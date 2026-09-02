import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useAddTicketComment, useTicketComments } from '@/hooks/useTickets';
import { escapeHtml } from '@/lib/email-body';
import { cn } from '@/lib/utils';

/**
 * Answer a ticket from the FlowBox queue. One write the ticket already
 * knows — a comment, public or internal — and, when the ticket has a
 * contact address, the same email rail every other surface uses, bound to
 * the ticket so the reply shows in its trail and in the message log. The
 * customer also sees public comments in their portal.
 */
export function TicketReply({ ticketId, subject, contactEmail, contactName }: { ticketId: string; subject: string; contactEmail?: string | null; contactName?: string | null }) {
  const { user, profile } = useAuth();
  const { data: comments = [], isLoading } = useTicketComments(ticketId);
  const addComment = useAddTicketComment();
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [email, setEmail] = useState(!!contactEmail);
  const [sending, setSending] = useState(false);

  const recent = comments.slice(-4);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await addComment.mutateAsync({
        ticket_id: ticketId,
        content: body,
        is_internal: internal,
        author_id: user?.id,
        author_name: profile?.full_name ?? profile?.email ?? undefined,
      });
      if (!internal && email && contactEmail) {
        const html = body.split('\n').map((l) => (l.trim() === '' ? '<br>' : `<p>${escapeHtml(l)}</p>`)).join('');
        const { data, error } = await supabase.functions.invoke('email-send', {
          body: {
            to: contactEmail,
            toName: contactName || undefined,
            subject: /^\s*re:/i.test(subject) ? subject : `Re: ${subject}`,
            html,
            text: body,
            expects_reply: true,
            source: 'ticket-reply',
            related_entity_type: 'ticket',
            related_entity_id: ticketId,
            tags: { source: 'ticket-reply' },
          },
        });
        if (error) throw error;
        if (data && data.success === false) throw new Error(data.error || 'Email failed');
      }
      setText('');
      toast.success(internal ? 'Note added' : email && contactEmail ? `Reply sent to ${contactEmail}` : 'Reply added to the ticket');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reply');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed p-3 space-y-2">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : recent.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {recent.map((c) => (
            <div key={c.id} className={cn('text-xs rounded-md px-2 py-1', c.is_internal ? 'bg-warning/10' : c.author_type === 'agent' ? 'bg-primary/10' : 'bg-muted')}>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">
                {c.is_internal ? 'internal' : c.author_type}{c.author_name ? ` · ${c.author_name}` : ''} · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </span>
              {c.content}
            </div>
          ))}
        </div>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={internal ? 'Internal note — the customer never sees this' : 'Reply to the customer…'}
        rows={2}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send(); }}
      />
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <label className="inline-flex items-center gap-1.5"><Switch checked={internal} onCheckedChange={setInternal} aria-label="Internal note" /> Internal note</label>
        {contactEmail && !internal && (
          <label className="inline-flex items-center gap-1.5"><Switch checked={email} onCheckedChange={setEmail} aria-label="Email the customer" /> Also email {contactEmail}</label>
        )}
        <Button size="sm" onClick={send} disabled={sending || !text.trim()} className="gap-1.5 ml-auto">
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {internal ? 'Add note' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
