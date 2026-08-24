import { useState, useEffect } from 'react';
import { callSkill } from '@/lib/call-skill';
import { useLeadEmailStatus } from '@/hooks/useLeadEmailStatus';
import { useOutreachPolicy } from '@/hooks/useOutreachPolicy';
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
import { useQueryClient } from '@tanstack/react-query';
import { ProvenanceLine } from '@/components/ui/provenance-line';

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
  /** Optional prefilled subject (e.g. from Fit Analysis intro letter). */
  initialSubject?: string;
  /** Optional prefilled body (e.g. from Fit Analysis intro letter). */
  initialBody?: string;
  /** Lead/contact id — used so the outbound row links back to the record. */
  leadId?: string;
}

export function SendEmailDialog({ open, onOpenChange, recipientEmail, recipientName, leadContext, initialSubject, initialBody, leadId }: SendEmailDialogProps) {
  const [subject, setSubject] = useState(initialSubject ?? '');
  const [body, setBody] = useState(initialBody ?? '');
  // #97 A6: true after "Draft with AI" filled the fields — the provenance
  // line clears as soon as the human edits (then it is THEIR text).
  const [aiDrafted, setAiDrafted] = useState(false);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  // Deliverability gate (find → verify → gate, 2026 practice): the lead's
  // email_status decides whether Send is safe. invalid/disposable block;
  // accept_all (catch-all, ~30% bounce risk) and unknown warn; 'valid' is the
  // green light. Verification is an explicit button because it costs a Hunter
  // credit — never an automatic sweep.
  const [verifiedStatus, setVerifiedStatus] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const { data: storedStatus } = useLeadEmailStatus(leadId, open);
  const { data: outreach } = useOutreachPolicy(leadId, open);
  // Consent-required jurisdictions are not blocked — the seller may hold
  // consent or an existing relationship. They must ACKNOWLEDGE the regime,
  // which is both the honest gate and the record that they knew.
  const [lawfulBasis, setLawfulBasis] = useState(false);
  const consentRequired = outreach?.policy === 'consent_required';
  const emailStatus = verifiedStatus ?? storedStatus ?? null;

  const statusBlocksSend = emailStatus === 'invalid' || emailStatus === 'disposable';

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await callSkill<{ status?: string; success?: boolean; error?: string }>('verify_email', {
        email: recipientEmail, lead_id: leadId,
      });
      if (res?.status) setVerifiedStatus(res.status);
      else if (res?.error) toast.error(res.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      if (initialSubject !== undefined) setSubject(initialSubject);
      if (initialBody !== undefined) setBody(initialBody);
    }
  }, [open, initialSubject, initialBody]);
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

      // 2. Pull sender identity from profile (full_name + title)
      const { data: { user } } = await supabase.auth.getUser();
      let senderName = user?.email || 'Sales';
      let senderTitle = '';
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('full_name, title')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          senderName = (profile as any).full_name || senderName;
          senderTitle = (profile as any).title || '';
        }
      }

      // 3. Build grounded prompt — business identity + sender + recipient/lead
      const identityLines = [
        `Company: ${companyName}`,
        companyProfile.about_us && `About us: ${companyProfile.about_us}`,
        companyProfile.industry && `Industry: ${companyProfile.industry}`,
        // differentiators is [{name, description}] like services — the same
        // "[object Object]" trap the services line below already documents.
        Array.isArray(companyProfile.differentiators) && companyProfile.differentiators.length
          ? `Differentiators / USPs:\n- ${companyProfile.differentiators
              .map((d: { name?: string; description?: string } | string) =>
                typeof d === 'string' ? d : `${d?.name ?? ''}${d?.description ? ` (${d.description})` : ''}`)
              .filter(Boolean)
              .join('\n- ')}`
          : null,
        // services is ServiceItem[] ({name, description}), not string[] — a raw
        // join fed the AI draft literal "[object Object]" lines.
        Array.isArray(companyProfile.services) && companyProfile.services.length
          ? `Services:\n- ${companyProfile.services
              .map((s: { name?: string; description?: string } | string) =>
                typeof s === 'string' ? s : `${s?.name ?? ''}${s?.description ? ` (${s.description})` : ''}`)
              .filter(Boolean)
              .join('\n- ')}`
          : null,
        companyProfile.icp && `Ideal customer: ${companyProfile.icp}`,
        companyProfile.delivered_value && `Delivered value: ${companyProfile.delivered_value}`,
        Array.isArray(companyProfile.proof_points) && companyProfile.proof_points.length
          ? `Proof points (the only figures you may state — quote them verbatim):\n- ${companyProfile.proof_points
              .map((pp: { value?: string; label?: string; context?: string }) =>
                [pp?.value, pp?.label].filter(Boolean).join(' ') + (pp?.context ? ` (${pp.context})` : ''))
              .filter((row: string) => row.trim())
              .join('\n- ')}`
          : null,
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
      setAiDrafted(true);
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
      // Record the acting human on the comms log row (titthål: agent vs manual)
      const { data: { user } } = await supabase.auth.getUser();

      // Route directly through `email-send` with expects_reply=true so the
      // router prefers Composio/Gmail (company inbox) over Resend — replies
      // then land back in the system on the same thread. Same rail as the
      // Discuss panel's Email tab.
      const htmlBody = body
        .trim()
        .split('\n')
        .map((line) => (line.trim() === '' ? '<br>' : `<p>${line}</p>`))
        .join('');

      const { data, error } = await supabase.functions.invoke('email-send', {
        body: {
          to: recipientEmail,
          toName: recipientName || undefined,
          subject: subject.trim(),
          html: htmlBody,
          text: body.trim(),
          expects_reply: true,
          source: 'contact-compose',
          ...(leadId ? { related_entity_type: 'lead', related_entity_id: leadId } : {}),
          tags: {
            source: 'contact-compose',
            ...(user?.email ? { sent_by: user.email } : {}),
          },
        },
      });

      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Send failed');

      toast.success(`Email sent${data?.provider ? ` via ${data.provider}` : ''} to ${recipientName || recipientEmail}`);
      setSubject('');
      setBody('');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['lead-communications'] });
      queryClient.invalidateQueries({ queryKey: ['unified-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['outbound-communications'] });
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
            {leadId && (
              <div className="flex items-center justify-between text-xs">
                <span className={
                  statusBlocksSend ? 'text-destructive font-medium'
                  : emailStatus === 'valid' ? 'text-success'
                  : 'text-muted-foreground'
                }>
                  {statusBlocksSend
                    ? `Address is ${emailStatus} — sending is blocked`
                    : emailStatus === 'valid'
                      ? 'Address verified deliverable'
                      : emailStatus === 'accept_all'
                        ? 'Catch-all domain — delivery uncertain (~30% bounce risk)'
                        : 'Address not verified'}
                </span>
                {emailStatus !== 'valid' && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleVerify} disabled={verifying}>
                    {verifying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                    {verifying ? 'Verifying…' : 'Verify (1 Hunter credit)'}
                  </Button>
                )}
              </div>
            )}
            {/* The RECIPIENT's country decides the cold-outreach regime, not
                ours (ePrivacy is implemented per member state). Data-driven —
                outreach_country_policy — so the send path never branches on a
                country name. */}
            {leadId && outreach && (
              consentRequired ? (
                <div className="text-xs rounded-md border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 space-y-2">
                  <p className="text-yellow-700 dark:text-yellow-500">
                    <span className="font-medium">{outreach.countryName ?? outreach.country}: prior consent required.</span>{' '}
                    {outreach.note}
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={lawfulBasis}
                      onChange={(e) => setLawfulBasis(e.target.checked)}
                    />
                    <span>I have consent or an existing business relationship with this recipient.</span>
                  </label>
                </div>
              ) : outreach.policy === 'unknown' ? (
                <p className="text-xs text-muted-foreground">
                  Recipient country unknown — check the local rules before cold outreach.
                  Set the company&apos;s country to get the regime shown here.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {outreach.countryName}: B2B outreach allowed with a working opt-out (already in every send).
                </p>
              )
            )}
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
              onChange={(e) => { setBody(e.target.value); setAiDrafted(false); }}
              rows={10}
            />
            {aiDrafted && (
              <ProvenanceLine>
                Drafted from your Business Identity and this contact&apos;s CRM record.
              </ProvenanceLine>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !body.trim() || statusBlocksSend || (consentRequired && !lawfulBasis)}
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? 'Sending...' : 'Send Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
