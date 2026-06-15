import { logger } from '@/lib/logger';
import { useState, useRef } from 'react';
import { FormBlockData, FormField } from '@/types/cms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';
import { webhookEvents } from '@/lib/webhook-utils';
import { createLeadFromForm } from '@/lib/lead-utils';

interface FormBlockProps {
  data: FormBlockData;
  blockId: string;
  pageId?: string;
}

export function FormBlock({ data, blockId, pageId }: FormBlockProps) {
  const [formData, setFormData] = useState<Record<string, string | boolean>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  // Spam protection: a honeypot field (hidden from humans) + a time-trap. Bots fill
  // the honeypot and/or submit near-instantly; we drop those silently.
  const [honeypot, setHoneypot] = useState('');
  const mountedAt = useRef(Date.now());
  const { toast } = useToast();

  const validateField = (field: FormField, value: string | boolean): string | null => {
    if (field.required) {
      if (field.type === 'checkbox' && value !== true) {
        return 'This field is required';
      }
      if (typeof value === 'string' && !value.trim()) {
        return 'This field is required';
      }
    }

    if (field.type === 'email' && typeof value === 'string' && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return 'Please enter a valid email address';
      }
    }

    if (field.type === 'phone' && typeof value === 'string' && value) {
      const phoneRegex = /^[\d\s\-+()]{7,20}$/;
      if (!phoneRegex.test(value)) {
        return 'Please enter a valid phone number';
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Spam protection — honeypot filled or submitted suspiciously fast (<800ms):
    // a human can't, so silently show success without persisting (don't tip off bots).
    if (honeypot.trim() !== '' || Date.now() - mountedAt.current < 800) {
      setIsSubmitted(true);
      setFormData({});
      return;
    }

    // Validate all fields
    const newErrors: Record<string, string> = {};
    data.fields.forEach(field => {
      if (field.type === 'file') {
        const file = files[field.id];
        if (field.required && !file) {
          newErrors[field.id] = 'Please attach a file';
        } else if (file) {
          const maxBytes = (field.maxSizeMB ?? 10) * 1024 * 1024;
          if (file.size > maxBytes) {
            newErrors[field.id] = `File must be under ${field.maxSizeMB ?? 10} MB`;
          }
        }
        return;
      }
      const error = validateField(field, formData[field.id] || '');
      if (error) {
        newErrors[field.id] = error;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Upload any file fields to the private bucket; store {path,name} in the submission.
      const uploadedFiles: Record<string, { path: string; name: string }> = {};
      for (const field of data.fields) {
        if (field.type !== 'file') continue;
        const file = files[field.id];
        if (!file) continue;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${blockId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from('form-uploads')
          .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        uploadedFiles[field.id] = { path, name: file.name };
      }

      // Build submission data with field labels
      const submissionData: Record<string, Json> = {};
      data.fields.forEach(field => {
        if (field.type === 'file') {
          submissionData[field.label] = uploadedFiles[field.id] ?? null;
          return;
        }
        submissionData[field.label] = formData[field.id] !== undefined
          ? formData[field.id]
          : (field.type === 'checkbox' ? false : '');
      });

      const { error } = await supabase
        .from('form_submissions')
        .insert([{
          block_id: blockId,
          page_id: pageId || null,
          form_name: data.title || 'Contact Form',
          data: submissionData,
          metadata: {
            submitted_at: new Date().toISOString(),
            user_agent: navigator.userAgent,
          },
        }]);

      if (error) throw error;

      // Create/update lead automatically
      const emailField = data.fields.find(f => f.type === 'email');
      const nameField = data.fields.find(f => f.label.toLowerCase().includes('name'));
      const companyField = data.fields.find(f => f.label.toLowerCase().includes('company'));
      const phoneField = data.fields.find(f => f.type === 'phone');

      if (emailField && formData[emailField.id]) {
        await createLeadFromForm({
          email: formData[emailField.id] as string,
          name: nameField ? (formData[nameField.id] as string) : undefined,
          company: companyField ? (formData[companyField.id] as string) : undefined,
          phone: phoneField ? (formData[phoneField.id] as string) : undefined,
          formName: data.title || 'Contact Form',
          formData: submissionData as Record<string, unknown>,
          sourceId: blockId,
          pageId: pageId,
        });
      }

      // Trigger webhook for form submission
      webhookEvents.formSubmitted({
        form_name: data.title || 'Contact Form',
        block_id: blockId,
        page_id: pageId,
        data: submissionData as Record<string, unknown>,
      });

      // Submission notification — fire-and-forget email to the configured address.
      // Public block: use the fetch + publishable-key pattern (not functions.invoke).
      if (data.notifyEmail?.trim()) {
        try {
          const lines = Object.entries(submissionData)
            .map(([k, v]) => {
              const val =
                v && typeof v === 'object' && 'name' in (v as Record<string, unknown>)
                  ? (v as { name: string }).name
                  : v;
              return `${k}: ${val ?? ''}`;
            })
            .join('\n');
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-contact-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              to: data.notifyEmail.trim(),
              subject: `New submission: ${data.title || 'Contact Form'}`,
              body: `A new form submission was received:\n\n${lines}`,
            }),
          });
        } catch (notifyErr) {
          logger.error('Form notification email failed:', notifyErr);
        }
      }

      // Job application — route the uploaded CV into the recruitment pipeline.
      if (data.jobPostingId) {
        const fileFieldId = data.fields.find((f) => f.type === 'file')?.id;
        const cv = fileFieldId ? uploadedFiles[fileFieldId] : undefined;
        if (cv) {
          try {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-job-application`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify({
                job_posting_id: data.jobPostingId,
                storage_path: `form-uploads/${cv.path}`,
                candidate_name: nameField ? (formData[nameField.id] as string) : undefined,
                candidate_email: emailField ? (formData[emailField.id] as string) : undefined,
                candidate_phone: phoneField ? (formData[phoneField.id] as string) : undefined,
              }),
            });
          } catch (appErr) {
            logger.error('process-job-application failed:', appErr);
          }
        }
      }

      setIsSubmitted(true);
      setFormData({});
      setFiles({});
    } catch (error) {
      logger.error('Form submission error:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit form. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldChange = (fieldId: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    // Clear error when user starts typing
    if (errors[fieldId]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const renderField = (field: FormField) => {
    const error = errors[field.id];
    const value = formData[field.id];

    const fieldClasses = cn(
      field.width === 'half' ? 'col-span-1' : 'col-span-2',
      'space-y-2'
    );

    switch (field.type) {
      case 'textarea':
        return (
          <div key={field.id} className={fieldClasses}>
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id={field.id}
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              rows={4}
              className={cn(error && 'border-destructive')}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.id} className={cn(fieldClasses, 'flex items-start gap-3 pt-2')}>
            <Checkbox
              id={field.id}
              checked={(value as boolean) || false}
              onCheckedChange={(checked) => handleFieldChange(field.id, checked as boolean)}
              className={cn(error && 'border-destructive')}
            />
            <div className="space-y-1">
              <Label htmlFor={field.id} className="cursor-pointer leading-relaxed">
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          </div>
        );

      case 'select':
        return (
          <div key={field.id} className={fieldClasses}>
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select
              value={(value as string) || ''}
              onValueChange={(v) => handleFieldChange(field.id, v)}
            >
              <SelectTrigger id={field.id} className={cn(error && 'border-destructive')}>
                <SelectValue placeholder={field.placeholder || 'Select…'} />
              </SelectTrigger>
              <SelectContent>
                {(field.options || []).map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        );

      case 'radio':
        return (
          <div key={field.id} className={fieldClasses}>
            <Label>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <RadioGroup
              value={(value as string) || ''}
              onValueChange={(v) => handleFieldChange(field.id, v)}
              className="gap-2 pt-1"
            >
              {(field.options || []).map((opt) => (
                <div key={opt} className="flex items-center gap-2">
                  <RadioGroupItem value={opt} id={`${field.id}-${opt}`} />
                  <Label htmlFor={`${field.id}-${opt}`} className="font-normal cursor-pointer">{opt}</Label>
                </div>
              ))}
            </RadioGroup>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        );

      case 'file':
        return (
          <div key={field.id} className={fieldClasses}>
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="file"
              accept={field.accept || undefined}
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFiles((prev) => {
                  const next = { ...prev };
                  if (f) next[field.id] = f;
                  else delete next[field.id];
                  return next;
                });
                if (errors[field.id]) {
                  setErrors((prev) => {
                    const n = { ...prev };
                    delete n[field.id];
                    return n;
                  });
                }
              }}
              className={cn('cursor-pointer', error && 'border-destructive')}
            />
            {field.accept && <p className="text-xs text-muted-foreground">Accepted: {field.accept}</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        );

      default:
        return (
          <div key={field.id} className={fieldClasses}>
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type={
                field.type === 'email' ? 'email'
                : field.type === 'phone' ? 'tel'
                : field.type === 'date' ? 'date'
                : field.type === 'number' ? 'number'
                : 'text'
              }
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              className={cn(error && 'border-destructive')}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        );
    }
  };

  // Success state
  if (isSubmitted) {
    return (
      <section className="py-12 md:py-16">
        <div className="container max-w-2xl mx-auto px-4">
          <Card className="text-center py-12">
            <CardContent>
              <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
              <p className="text-lg text-foreground whitespace-pre-line">
                {data.successMessage || 'Thank you! Your message has been sent.'}
              </p>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => setIsSubmitted(false)}
              >
                Send Another Message
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {data.fields.map(renderField)}
      </div>

      {/* Honeypot — hidden from humans; bots that fill it are dropped on submit. */}
      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />

      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          data.submitButtonText || 'Send Message'
        )}
      </Button>
    </form>
  );

  // Render based on variant
  if (data.variant === 'card') {
    return (
      <section className="py-12 md:py-16">
        <div className="container max-w-2xl mx-auto px-4">
          <Card>
            {(data.title || data.description) && (
              <CardHeader>
                {data.title && <CardTitle className="font-serif">{data.title}</CardTitle>}
                {data.description && <CardDescription>{data.description}</CardDescription>}
              </CardHeader>
            )}
            <CardContent>
              {formContent}
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  if (data.variant === 'minimal') {
    return (
      <section className="py-12 md:py-16">
        <div className="container max-w-2xl mx-auto px-4">
          {data.title && (
            <h2 className="text-2xl font-serif font-semibold mb-2">{data.title}</h2>
          )}
          {data.description && (
            <p className="text-muted-foreground mb-6">{data.description}</p>
          )}
          {formContent}
        </div>
      </section>
    );
  }

  // Default variant
  return (
    <section className="py-12 md:py-16 bg-muted/30">
      <div className="container max-w-2xl mx-auto px-4">
        {data.title && (
          <h2 className="text-3xl font-serif font-semibold text-center mb-3">{data.title}</h2>
        )}
        {data.description && (
          <p className="text-muted-foreground text-center mb-8 max-w-lg mx-auto">{data.description}</p>
        )}
        <Card className="p-6 md:p-8">
          {formContent}
        </Card>
      </div>
    </section>
  );
}
