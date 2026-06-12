/**
 * AgentFeed — read-only stream of cowork_messages.
 *
 * Surfaces what FlowPilot (and other agents) post into the team channel
 * via the `post_to_cowork_chat` skill. Renders above the RAG conversation
 * in WorkspaceChatPage. Newest first. Realtime + 30s poll fallback.
 */
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bot, User, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CoworkMessage {
  id: string;
  author_type: 'agent' | 'user' | 'system';
  author_name: string | null;
  content: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

const POLL_MS = 30_000;
const COLLAPSED_LIMIT = 3;

const SOURCE_CHIPS: Record<string, { emoji: string; label: string }> = {
  approvals: { emoji: '🔔', label: 'Approvals' },
  heartbeat: { emoji: '💓', label: 'Heartbeat' },
  objective: { emoji: '🎯', label: 'Objective' },
  briefing: { emoji: '📋', label: 'Briefing' },
  workflow: { emoji: '⚙️', label: 'Workflow' },
  alert: { emoji: '⚠️', label: 'Alert' },
};

function SourceBadge({ source, requestId }: { source: string; requestId?: string }) {
  const chip = SOURCE_CHIPS[source] || { emoji: '✨', label: source };
  const content = (
    <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
      <span>{chip.emoji}</span>
      {chip.label}
    </Badge>
  );
  if (requestId) {
    return (
      <Link to="/admin/approvals/inbox" className="hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }
  return content;
}

function FeedItem({ msg }: { msg: CoworkMessage }) {
  const isAgent = msg.author_type === 'agent';
  const isSystem = msg.author_type === 'system';
  const source = msg.metadata?.source as string | undefined;
  const requestId = msg.metadata?.request_id as string | undefined;

  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg p-3 transition-colors',
        isAgent && 'border-l-2 border-l-primary bg-primary/[0.03]',
        isSystem && 'bg-muted/30 text-muted-foreground text-xs italic',
      )}
    >
      <div
        className={cn(
          'shrink-0 h-7 w-7 rounded-full flex items-center justify-center',
          isAgent && 'bg-primary/10 text-primary',
          isSystem && 'bg-muted text-muted-foreground',
          !isAgent && !isSystem && 'bg-muted text-foreground',
        )}
      >
        {isAgent ? <Bot className="h-3.5 w-3.5" /> : isSystem ? <Info className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs font-medium">
            {msg.author_name || (isAgent ? 'FlowPilot' : isSystem ? 'System' : 'User')}
          </span>
          {source && <SourceBadge source={source} requestId={requestId} />}
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
          </span>
        </div>
        <div
          className={cn(
            'prose prose-sm dark:prose-invert max-w-none',
            'prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1',
            isSystem && 'prose-p:text-muted-foreground',
          )}
        >
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export function AgentFeed() {
  const [messages, setMessages] = useState<CoworkMessage[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const fetchMessages = async () => {
    const { data, error } = await (supabase as any)
      .from('cowork_messages')
      .select('id, author_type, author_name, content, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      // Table may not exist yet (migration not applied) — render nothing.
      setUnavailable(true);
      setLoaded(true);
      return;
    }
    setMessages((data || []) as CoworkMessage[]);
    setLoaded(true);
  };

  useEffect(() => {
    void fetchMessages();
    const poll = window.setInterval(() => void fetchMessages(), POLL_MS);
    const channel = (supabase as any)
      .channel('cowork_messages_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cowork_messages' },
        () => void fetchMessages(),
      )
      .subscribe();
    return () => {
      window.clearInterval(poll);
      (supabase as any).removeChannel(channel);
    };
  }, []);

  const visible = useMemo(
    () => (expanded ? messages : messages.slice(0, COLLAPSED_LIMIT)),
    [messages, expanded],
  );

  if (unavailable) return null;
  if (!loaded) return null;

  if (messages.length === 0) {
    return (
      <div className="border border-dashed border-border/60 rounded-lg p-4 text-center">
        <Bot className="h-5 w-5 mx-auto text-muted-foreground/60 mb-1.5" />
        <p className="text-xs text-muted-foreground">
          FlowPilot has nothing to report yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Agent feed
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-1.5">
        {visible.map((m) => (
          <FeedItem key={m.id} msg={m} />
        ))}
      </div>
      {messages.length > COLLAPSED_LIMIT && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-xs text-muted-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" /> Show {messages.length - COLLAPSED_LIMIT} more
            </>
          )}
        </Button>
      )}
    </div>
  );
}
