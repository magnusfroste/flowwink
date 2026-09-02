import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { escapeHtml } from '@/lib/email-body';

/**
 * Close a form submission from the FlowBox queue. Two things the Forms page
 * can do, done where the queue is: mark it handled (the same handled_at /
 * handled_by stamp, RLS on the forms module), and — when the submission
 * carries an address — answer the sender by email on the platform rail,
 * bound to the submission so the reply shows in the message log. Sending a
 * reply marks the submission handled: answering IS handling it.
 */
export function FormHandle({ submissionId, formName, contactEmail, contactName, fields }: {
  submissionId: string;
  formName: string;
  contactEmail?: string | null;
  contactName?: string | null;
  fields: Record<string, unknown> | null;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'handle' | 'send' | null>(null);

  const entries = Object.entries(fields ?? {}).filter(([, v]) => typeof v === 'string' && (v as string).trim());

  const done = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['inbox-items'] }),
      qc.invalidateQueries({ queryKey: ['form-submissions'] }),
    ]);
  };

  const markHandled = async () => {
    const { data: auth } = await supabase.auth.getUser();
    // Cast: the generated types predate the handled columns; DB + RLS decide.
    const { error, data } = await (supabase.from('form_submissions') as never as {
      update: (p: object) => { eq: (c: string, v: string) => { select: (c: string) => { single: () => Promise<{ error: { message: string } | null; data: unknown }> } } };
    }).update({ handled_at: new Date().toISOString(), handled_by: auth?.user?.id ?? null }).eq('id', submissionId).select('id').single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('The submission was not updated — no row matched');
  };

  const handle = async () => {
    setBusy('handle');
    try {
      await markHandled();
      toast.success('Marked as handled — find it under Show done');
      await done();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark as handled');
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !contactEmail) return;
    setBusy('send');
    try {
      const html = body.split('\n').map((l) => (l.trim() === '' ? '<br>' : `<p>${escapeHtml(l)}</p>`)).join('');
      const { data, error } = await supabase.functions.invoke('email-send', {
        body: {
          to: contactEmail,
          toName: contactName || undefined,
          subject: `Re: ${formName}`,
          html,
          text: body,
          expects_reply: true,
          source: 'form-reply',
          related_entity_type: 'form_submission',
          related_entity_id: submissionId,
          tags: { source: 'form-reply' },
        },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Email failed');
      await markHandled();
      setText('');
      toast.success(`Reply sent to ${contactEmail} — submission handled`);
      await done();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reply');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border border-dashed p-3 space-y-2">
      {entries.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs max-h-40 overflow-y-auto">
          {entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground truncate">{k}</dt>
              <dd className="break-words">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {contactEmail && (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Reply to ${contactEmail}… sending marks the submission handled`}
          rows={2}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send(); }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {contactEmail ? 'Answer by email, or just mark it handled.' : 'No address on this submission — mark it handled when done.'}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="outline" onClick={handle} disabled={busy !== null} className="gap-1.5">
            {busy === 'handle' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Mark handled
          </Button>
          {contactEmail && (
            <Button size="sm" onClick={send} disabled={busy !== null || !text.trim()} className="gap-1.5">
              {busy === 'send' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send reply
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
