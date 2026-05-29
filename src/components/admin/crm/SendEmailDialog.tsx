import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Mail, Send, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useChatSettings } from '@/hooks/useSiteSettings';

export interface LeadComposeContext {
  name?: string | null;
  email?: string | null;
  status?: string | null;
  source?: string | null;
  notes?: string | null;
  company_name?: string | null;
  industry?: string | null;
  role?: string | null;
}

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientEmail: string;
  recipientName?: string;
  /** Optional CRM context used to ground the AI draft. */
  leadContext?: LeadComposeContext;
}

export function SendEmailDialog({ open, onOpenChange, recipientEmail, recipientName, leadContext }: SendEmailDialogProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const { data: chatSettings } = useChatSettings();

  const handleDraft = async () => {
    setDrafting(true);
    try {
      // 1. Pull business identity (company_profile) — the brand context
      const { data: settings } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', ['company_profile', 'company_name']);
      const companyProfile = settings?.find((s) => s.key === 'company_profile')?.value as any || {};
      const companyName = (settings?.find((s) => s.key === 'company_name')?.value as any) || companyProfile.company_name || 'Our company';

      // 2. Pull sender identity from profile (display_name + email identity overrides)
      const { data: { user } } = await supabase.auth.getUser();
      let senderName = user?.email || 'Sales';
      let senderTitle = '';
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('display_name, email_from_name, job_title')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile) {
          senderName = (profile as any).email_from_name || (profile as any).display_name || senderName;
          senderTitle = (profile as any).job_title || '';
        }
      }

      // 3. Build grounded prompt — business identity + sender + recipient/lead
      const identityLines = [
        `Company: ${companyName}`,
        companyProfile.about_us && `About us: ${companyProfile.about_us}`,
        companyProfile.industry && `Industry: ${companyProfile.industry}`,
        Array.isArray(companyProfile.differentiators) && companyProfile.differentiators.length
          ? `Differentiators / USPs:\n- ${companyProfile.differentiators.join('\n- ')}`
          : null,
        Array.isArray(companyProfile.services) && companyProfile.services.length
          ? `Services:\n- ${companyProfile.services.join('\n- ')}`
          : null,
        companyProfile.icp && `Ideal customer: ${companyProfile.icp}`,
        companyProfile.delivered_value && `Delivered value: ${companyProfile.delivered_value}`,
      ].filter(Boolean).join('\n');

      const recipient = leadContext || { name: recipientName, email: recipientEmail };
      const recipientLines = [
        `Name: ${recipient.name || recipientName || 'there'}`,
        `Email: ${recipientEmail}`,
        recipient.role && `Role: ${recipient.role}`,
        recipient.company_name && `Company: ${recipient.company_name}`,
        recipient.industry && `Industry: ${recipient.industry}`,
        recipient.status && `Lead status: ${recipient.status}`,
        recipient.source && `Source: ${recipient.source}`,
        recipient.notes && `Notes: ${recipient.notes}`,
      ].filter(Boolean).join('\n');

      const userMsg = `Draft a short, personal outbound sales email from ${senderName}${senderTitle ? ` (${senderTitle})` : ''} at ${companyName} to the lead below.

=== OUR BUSINESS IDENTITY ===
${identityLines}

=== RECIPIENT / LEAD ===
${recipientLines}

Guidelines:
- Open with a relevant hook tied to the recipient's context (no "I hope this finds you well").
- Tie ONE of our differentiators to a likely pain point for this lead.
- Keep it under 120 words. Plain text, no markdown.
- End with a soft single-question CTA.
- Sign as: ${senderName}${senderTitle ? `\n${senderTitle}` : ''}\n${companyName}

Return ONLY a JSON object: {"subject": "...", "body": "..."}. No code fences, no commentary.`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: userMsg }],
            settings: {
              aiProvider: chatSettings?.aiProvider || 'openai',
              toolCallingEnabled: false,
              includeContentAsContext: false,
              allowGeneralKnowledge: true,
            },
          }),
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) full += delta;
          } catch { /* ignore */ }
        }
      }

      // Parse — accept JSON or fenced JSON
      const jsonMatch = full.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI did not return a valid draft');
      const draft = JSON.parse(jsonMatch[0]);
      if (draft.subject) setSubject(String(draft.subject));
      if (draft.body) setBody(String(draft.body));
      toast.success('Draft ready — review before sending');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to draft email');
    } finally {
      setDrafting(false);
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and message are required');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-contact-email', {
        body: {
          to: recipientEmail,
          toName: recipientName || undefined,
          subject: subject.trim(),
          body: body.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Email sent to ${recipientName || recipientEmail}`);
      setSubject('');
      setBody('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Email
          </DialogTitle>
          <DialogDescription>
            Send a direct email to {recipientName || recipientEmail}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>To</Label>
            <Input value={recipientEmail} disabled className="bg-muted" />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDraft}
              disabled={drafting}
            >
              {drafting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              {drafting ? 'Drafting…' : 'Draft with AI'}
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              placeholder="Write your message..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !body.trim()}
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? 'Sending...' : 'Send Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
