import { useThreadMessages } from '@/hooks/useEmailModule';
import { ThreadReply } from '@/components/admin/email/ThreadReply';

/**
 * Answer an email thread from the FlowBox queue. The same reply box the
 * Email page has — one textarea, the platform email rail, threaded — fed
 * with the thread's messages so a draft FlowPilot filed is already in it.
 */
export function EmailReply({ threadKey }: { threadKey: string }) {
  const { data: messages = [], isLoading } = useThreadMessages(threadKey);
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading thread…</p>;
  return <ThreadReply threadKey={threadKey} messages={messages} />;
}
