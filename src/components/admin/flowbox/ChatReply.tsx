import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useConversationMessages, useSupportConversations } from '@/hooks/useSupportConversations';
import { cn } from '@/lib/utils';

/**
 * Reply to a visitor's chat from the FlowBox queue. The same two writes
 * Live Support makes — claim the conversation (it becomes yours,
 * `with_agent`) and insert an agent message that the widget receives over
 * broadcast — without leaving the queue. The last few messages are shown so
 * the answer is written in context; the full transcript is one click away.
 */
export function ChatReply({ conversationId, needsClaim, live }: { conversationId: string; needsClaim: boolean; live: boolean }) {
  const { messages = [], isLoading, sendMessage } = useConversationMessages(conversationId);
  const { claimConversation } = useSupportConversations();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const recent = messages.slice(-6);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      if (needsClaim) await claimConversation.mutateAsync(conversationId);
      await sendMessage.mutateAsync(body);
      setText('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed p-3 space-y-2">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading conversation…</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {recent.length === 0 && <p className="text-xs text-muted-foreground">No messages yet.</p>}
          {recent.map((m) => (
            <div key={m.id} className={cn('text-xs rounded-md px-2 py-1 max-w-[90%]', m.role === 'user' ? 'bg-muted' : m.role === 'agent' ? 'bg-primary/10 ml-auto' : 'bg-accent/40 ml-auto')}>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">{m.role === 'user' ? 'visitor' : m.role === 'agent' ? 'you/colleague' : 'FlowPilot'}</span>
              {m.content}
            </div>
          ))}
        </div>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={needsClaim ? 'Reply — this takes the conversation over from FlowPilot' : 'Reply…'}
        rows={2}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send(); }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {needsClaim ? 'Sending claims the chat for you. ' : ''}
          {!live ? 'You are not live: this reply goes out, but new hand-offs will not ring you.' : ''}
        </span>
        <Button size="sm" onClick={send} disabled={sending || !text.trim()} className="gap-1.5">
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send
        </Button>
      </div>
    </div>
  );
}
