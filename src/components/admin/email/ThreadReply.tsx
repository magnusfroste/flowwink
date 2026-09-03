import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, Reply, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { escapeHtml } from '@/lib/email-body';

interface ThreadMessage {
  id: string;
  direction?: string | null;
  sender?: string | null;
  recipient?: string | null;
  subject?: string | null;
  message_id_header?: string | null;
  in_reply_to?: string | null;
  status?: string | null;
  body_text?: string | null;
  metadata?: { references?: string | null; grounded_on?: string[] | null; needs_person?: boolean | null; approval_request_id?: string | null; pending_activity_id?: string | null; send_args?: Record<string, unknown> | null } | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  created_at?: string;
}

/** "Anna <anna@x.se>" → "anna@x.se"; a bare address passes through. */
export function addressOf(raw: string | null | undefined): string {
  const m = (raw ?? '').match(/<([^>]+)>/);
  return (m ? m[1] : raw ?? '').trim();
}

/** RFC 5322 References for a reply: the parent's References plus its own id. */
export function replyReferences(parent: ThreadMessage): string | undefined {
  const chain = [parent.metadata?.references, parent.message_id_header].filter(Boolean) as string[];
  return chain.length ? chain.join(' ') : undefined;
}

/**
 * Reply from the inbox thread. Not a mail client: one textarea, one send,
 * through the same email-send rail every other surface uses (Composio/Gmail
 * when connected — that is the rail that threads: In-Reply-To, References,
 * Gmail thread id — so the answer lands in the visitor's own conversation
 * and comes back here when they answer again). The reply binds to the same
 * CRM record the inbound message resolved to.
 */
export function ThreadReply({ threadKey, messages }: { threadKey: string; messages: ThreadMessage[] }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const parent = useMemo(
    () => [...messages].reverse().find((m) => m.direction === 'inbound') ?? null,
    [messages],
  );
  // FlowPilot went first: the newest draft on the thread lands in the box.
  // A proposal, never sent — the person edits, sends or discards it, and
  // the draft row is marked used/discarded so the message log keeps the story.
  const draft = useMemo(
    () => [...messages].reverse().find((m) => m.status === 'draft' && m.direction !== 'inbound') ?? null,
    [messages],
  );
  useEffect(() => {
    if (draft?.body_text) setText((cur) => (cur ? cur : draft.body_text ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id]);
  const spendDraft = async (status: 'used' | 'discarded') => {
    if (!draft) return;
    const { error } = await supabase.from('outbound_communications' as never).update({ status } as never).eq('id', draft.id);
    if (error) toast.error(`Draft could not be marked ${status}: ${error.message}`);
  };
  // A draft that carries an approval request is FlowPilot's own send waiting
  // for a yes. Send here IS the yes: the reply_to_email skill runs with the
  // (possibly edited) text and _approved, the request is resolved, the draft
  // is marked used by the skill. Discard is the no.
  const staged = !!draft?.metadata?.approval_request_id;
  const sendStaged = async (body: string) => {
    if (!draft) return;
    const base = (draft.metadata?.send_args ?? {}) as Record<string, unknown>;
    const { data: run, error } = await supabase.functions.invoke('agent-execute', {
      body: {
        skill_name: 'reply_to_email',
        arguments: { ...base, to, subject, body_text: body, thread_id: threadKey, draft_id: draft.id, _approved: true },
        agent_type: 'flowpilot',
      },
    });
    if (error) throw new Error(error.message);
    const r = run as { result?: { success?: boolean; error?: string }; error?: string } | null;
    if (r?.error || r?.result?.success === false) throw new Error(r?.error || r?.result?.error || 'Send failed');
    const { error: resolveErr } = await supabase.rpc('resolve_approval', { p_request_id: draft.metadata!.approval_request_id, p_decision: 'approve', p_comment: 'Sent from FlowBox' } as never);
    if (resolveErr) console.warn('[thread-reply] approval request not resolved:', resolveErr.message);
    if (draft.metadata?.pending_activity_id) {
      await supabase.from('agent_activity').update({ status: 'success' } as never).eq('id', draft.metadata.pending_activity_id).eq('status', 'pending_approval');
    }
  };
  const discard = async () => {
    if (staged && draft?.metadata?.approval_request_id) {
      const { error: resolveErr } = await supabase.rpc('resolve_approval', { p_request_id: draft.metadata.approval_request_id, p_decision: 'reject', p_comment: 'Discarded from FlowBox' } as never);
      if (resolveErr) console.warn('[thread-reply] approval request not rejected:', resolveErr.message);
    }
    await spendDraft('discarded');
    setText('');
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['email-thread-messages', threadKey] }),
      qc.invalidateQueries({ queryKey: ['inbox-items'] }),
    ]);
  };
  if (!parent) return null;

  const to = addressOf(parent.sender);
  const baseSubject = (parent.subject ?? '').replace(/^\s*(re|sv|aw|fwd?)\s*:\s*/i, '');
  const subject = `Re: ${baseSubject || '(no subject)'}`;

  const send = async () => {
    const body = text.trim();
    if (!body || !to) return;
    setSending(true);
    try {
      if (staged) {
        await sendStaged(body);
        setText('');
        toast.success(`Approved and sent to ${to}`);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['email-thread-messages', threadKey] }),
          qc.invalidateQueries({ queryKey: ['email-threads'] }),
          qc.invalidateQueries({ queryKey: ['inbox-items'] }),
          qc.invalidateQueries({ queryKey: ['approvals'] }),
        ]);
        return;
      }
      const html = body
        .split('\n')
        .map((line) => (line.trim() === '' ? '<br>' : `<p>${escapeHtml(line)}</p>`))
        .join('');
      const { data, error } = await supabase.functions.invoke('email-send', {
        body: {
          to,
          subject,
          html,
          text: body,
          expects_reply: true,
          source: 'inbox-reply',
          inReplyTo: parent.message_id_header ?? undefined,
          references: replyReferences(parent),
          threadId: threadKey,
          ...(parent.related_entity_type && parent.related_entity_id
            ? { related_entity_type: parent.related_entity_type, related_entity_id: parent.related_entity_id }
            : {}),
          tags: { source: 'inbox-reply' },
        },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Send failed');
      setText('');
      await spendDraft('used');
      toast.success(`Reply sent to ${to}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['email-thread-messages', threadKey] }),
        qc.invalidateQueries({ queryKey: ['email-threads'] }),
        qc.invalidateQueries({ queryKey: ['inbox-items'] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reply failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {draft ? <Bot className="h-3.5 w-3.5 text-primary" /> : <Reply className="h-3.5 w-3.5" />}
        <span>
          {draft ? <><span className="font-medium text-foreground">FlowPilot's draft</span> to </> : 'Reply to '}
          <span className="font-medium text-foreground">{to}</span> · {subject}
          {draft?.metadata?.needs_person ? <span className="text-warning"> · FlowPilot could not answer from the sources — a holding reply; this one needs you</span> : ''}
          {staged ? <span className="text-warning"> · FlowPilot wants to send this — Send approves it, Discard rejects it</span> : ''}
        </span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your reply… plain text, sent as a threaded email"
        rows={4}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send(); }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {staged ? 'Edit freely — Send here is the approval. ' : draft ? 'Edit freely — nothing goes out until you send. ' : ''}Sent through the platform email rail and logged on this thread. ⌘⏎ to send.
        </span>
        {draft && (
          <Button size="sm" variant="ghost" onClick={discard} disabled={sending} className="gap-1.5 ml-auto mr-2 text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" /> {staged ? 'Reject' : 'Discard draft'}
          </Button>
        )}
        <Button size="sm" onClick={send} disabled={sending || !text.trim()} className="gap-1.5">
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {staged ? 'Approve & send' : 'Send reply'}
        </Button>
      </div>
    </div>
  );
}
