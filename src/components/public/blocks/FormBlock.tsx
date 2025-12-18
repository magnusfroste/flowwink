import { useState } from 'react';
import { FormBlockData, FormField } from '@/types/cms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';

interface FormBlockProps {
  data: FormBlockData;
  blockId: string;
  pageId?: string;
}

export function FormBlock({ data, blockId, pageId }: FormBlockProps) {
  const [formData, setFormData] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
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
    
    // Validate all fields
    const newErrors: Record<string, string> = {};
    data.fields.forEach(field => {
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
      // Build submission data with field labels
      const submissionData: Record<string, Json> = {};
      data.fields.forEach(field => {
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

      setIsSubmitted(true);
      setFormData({});
    } catch (error) {
      console.error('Form submission error:', error);
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

      default:
        return (
          <div key={field.id} className={fieldClasses}>
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
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
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
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
