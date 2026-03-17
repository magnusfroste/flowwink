/**
 * UnifiedChat
 * 
 * Single chat interface for both admin (FlowPilot) and visitor (public) scopes.
 * Replaces OperateChat, ChatConversation, and CopilotChat with one component.
 * 
 * - scope='admin': Full FlowPilot with @-commands, skills, SSE streaming
 * - scope='visitor': Public chat with limited commands, standard completion
 */

import { useRef, useEffect } from 'react';
import { Terminal, Sparkles, Wrench, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UnifiedChatInput } from './UnifiedChatInput';
import { ChatTypingIndicator } from './ChatTypingIndicator';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessage } from './ChatMessage';
import { ProactiveMessageCard } from './ProactiveMessageCard';
import type { ProactiveMessage } from '@/hooks/useProactiveMessages';
import type { ActionButton } from './ProactiveMessageCard';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import type { OperateMessage } from '@/hooks/useAgentOperate';
import type { AgentSkill } from '@/types/agent';

// ─── Tool status indicator (reused from OperateChat) ──────────────────────────

function ToolStatusIndicator({ toolStatus }: { toolStatus: OperateMessage['toolStatus'] }) {
  if (!toolStatus || toolStatus.phase === 'done') return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-200">
      {toolStatus.phase === 'thinking' && (
        <>
          <Sparkles className="h-3 w-3 animate-pulse text-primary" />
          <span>Thinking…</span>
        </>
      )}
      {toolStatus.phase === 'executing' && (
        <>
          <Wrench className="h-3 w-3 animate-spin text-primary" />
          <span>
            Running {toolStatus.tools?.map(t => t.replace(/_/g, ' ')).join(', ')}
            {toolStatus.iteration ? ` (step ${toolStatus.iteration})` : ''}
          </span>
        </>
      )}
      {toolStatus.phase === 'streaming' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span>Writing response…</span>
        </>
      )}
    </div>
  );
}

// ─── Admin message bubble ─────────────────────────────────────────────────────

function AdminMessage({ msg }: { msg: OperateMessage }) {
  const results = msg.skillResults?.length ? msg.skillResults : msg.skillResult ? [msg.skillResult] : [];
  const isStreaming = msg.role === 'assistant' && msg.toolStatus && msg.toolStatus.phase !== 'done';
  const showCursor = isStreaming && msg.toolStatus?.phase === 'streaming';

  return (
    <div className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
        msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
      )}>
        {msg.role === 'assistant' ? (
          <>
            {msg.content ? (
              <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown>{msg.content + (showCursor ? '▍' : '')}</ReactMarkdown>
              </div>
            ) : isStreaming ? (
              <ToolStatusIndicator toolStatus={msg.toolStatus} />
            ) : null}

            {msg.content && isStreaming && msg.toolStatus?.phase !== 'streaming' && (
              <div className="mt-2 pt-2 border-t border-border/30">
                <ToolStatusIndicator toolStatus={msg.toolStatus} />
              </div>
            )}
          </>
        ) : (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        )}

        {results.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5">
            {results.map((sr, i) => (
              <div key={i}>
                <Badge variant={
                  sr.status === 'success' ? 'default' :
                  sr.status === 'pending_approval' ? 'secondary' : 'destructive'
                } className="text-xs">
                  {sr.skill.replace(/_/g, ' ')} — {sr.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface UnifiedChatProps {
  scope: 'admin' | 'visitor';
  className?: string;

  // Admin mode (FlowPilot)
  messages?: OperateMessage[];
  skills?: AgentSkill[];
  isLoading?: boolean;
  onSendMessage?: (message: string) => void;
  onReset?: () => void;
  onCancel?: () => void;
  proactiveMessages?: ProactiveMessage[];
  onProactiveAction?: (action: ActionButton) => void;
  onApproveAction?: (activityId: string) => Promise<void>;
  onRejectAction?: (activityId: string) => Promise<void>;

  // Visitor mode (public chat) — delegates to ChatConversation internals
  visitorChat?: {
    messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt?: Date; isFromAgent?: boolean }>;
    isLoading: boolean;
    error?: string | null;
    sendMessage: (msg: string) => void;
    cancelRequest?: () => void;
  };
  visitorSettings?: {
    title?: string;
    welcomeMessage?: string;
    suggestedPrompts?: string[];
    placeholder?: string;
    enabled?: boolean;
    feedbackEnabled?: boolean;
  };
  conversationId?: string;
  compact?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UnifiedChat({
  scope,
  className,
  messages = [],
  skills = [],
  isLoading = false,
  onSendMessage,
  onReset,
  onCancel,
  proactiveMessages = [],
  onProactiveAction,
  onApproveAction,
  onRejectAction,
  visitorChat,
  visitorSettings,
  conversationId,
  compact = false,
}: UnifiedChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin = scope === 'admin';
  const isEmpty = isAdmin ? messages.length === 0 : (visitorChat?.messages.length ?? 0) === 0;
  const loading = isAdmin ? isLoading : (visitorChat?.isLoading ?? false);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, visitorChat?.messages, loading]);

  const handleSend = (msg: string) => {
    if (isAdmin) {
      onSendMessage?.(msg);
    } else {
      visitorChat?.sendMessage(msg);
    }
  };

  const handleCancel = () => {
    if (isAdmin) {
      onCancel?.();
    } else {
      visitorChat?.cancelRequest?.();
    }
  };

  // ─── Admin empty state ────────────────────────────────────────────────
  const renderAdminEmpty = () => (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-5">
      <div className="p-3 rounded-2xl bg-primary/10">
        <Terminal className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-lg font-semibold">FlowPilot</h2>
        <p className="text-sm text-muted-foreground">
          Your autonomous CMS operator. Use <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs font-mono">@</kbd> commands
          to access {skills.length} skills, or just tell me what you need.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {[
          { label: 'Analyze this week', action: 'Analyze my site traffic for this week' },
          { label: 'Write a blog post', action: '@write_blog_post Write about our latest update' },
          { label: 'Check leads', action: '@check_leads Show recent lead activity' },
        ].map(qa => (
          <Button key={qa.label} variant="outline" size="sm" className="rounded-full" onClick={() => handleSend(qa.action)}>
            {qa.label}
          </Button>
        ))}
      </div>
    </div>
  );

  // ─── Visitor empty state ──────────────────────────────────────────────
  const renderVisitorEmpty = () => (
    <ChatEmptyState
      title={visitorSettings?.title}
      welcomeMessage={visitorSettings?.welcomeMessage}
      suggestedPrompts={visitorSettings?.suggestedPrompts}
      onPromptClick={handleSend}
      compact={compact}
    />
  );

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty && !loading ? (
          isAdmin ? renderAdminEmpty() : renderVisitorEmpty()
        ) : isAdmin ? (
          <div className="py-4 px-4 space-y-4">
            {/* Merge admin messages with proactive messages by timestamp */}
            {(() => {
              const combined: Array<{ type: 'msg'; data: OperateMessage } | { type: 'proactive'; data: ProactiveMessage }> = [
                ...messages.map(m => ({ type: 'msg' as const, data: m })),
                ...proactiveMessages.map(m => ({ type: 'proactive' as const, data: m })),
              ].sort((a, b) => {
                const timeA = a.type === 'msg' ? (a.data.createdAt?.getTime() || 0) : new Date(a.data.created_at).getTime();
                const timeB = b.type === 'msg' ? (b.data.createdAt?.getTime() || 0) : new Date(b.data.created_at).getTime();
                return timeA - timeB;
              });

              return combined.map((item) => {
                if (item.type === 'proactive') {
                  const pm = item.data;
                  return (
                    <ProactiveMessageCard
                      key={`proactive-${pm.id}`}
                      content={pm.content}
                      payload={pm.action_payload || { type: 'update' }}
                      createdAt={pm.created_at}
                      onAction={onProactiveAction}
                      onApprove={onApproveAction}
                      onReject={onRejectAction}
                    />
                  );
                }
                return <AdminMessage key={item.data.id} msg={item.data} />;
              });
            })()}
          </div>
        ) : (
          <div className="py-2">
            {visitorChat?.messages.map((message, index) => {
              const previousUserMessage = message.role === 'assistant'
                ? visitorChat.messages.slice(0, index).reverse().find(m => m.role === 'user')?.content
                : undefined;

              return (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  createdAt={message.createdAt}
                  messageId={message.id}
                  conversationId={conversationId}
                  previousUserMessage={previousUserMessage}
                  showFeedback={visitorSettings?.feedbackEnabled !== false && message.role === 'assistant' && !!message.content}
                  isFromAgent={message.isFromAgent}
                />
              );
            })}
            {loading && visitorChat?.messages[visitorChat.messages.length - 1]?.role === 'user' && (
              <ChatTypingIndicator />
            )}
          </div>
        )}
      </div>

      {/* Error display (visitor) */}
      {!isAdmin && visitorChat?.error && (
        <div className="px-4 pb-2">
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {visitorChat.error}
          </div>
        </div>
      )}

      {/* Unified input */}
      <UnifiedChatInput
        onSend={handleSend}
        onCancel={loading ? handleCancel : undefined}
        onReset={isAdmin ? onReset : undefined}
        isLoading={loading}
        placeholder={isAdmin ? 'Tell FlowPilot what to do…' : visitorSettings?.placeholder}
        disabled={!isAdmin && visitorSettings?.enabled === false}
        skills={skills}
        scope={scope}
      />
    </div>
  );
}
