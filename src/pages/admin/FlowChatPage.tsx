/**
 * FlowChat — internal operator chat for authenticated admins.
 *
 * Tesla analogy: FlowPilot (Autopilot) can be off, but you still use the
 * built-in chat to talk to the platform — execute skills, run /commands,
 * ask questions. FlowChat is the platform-layer chat surface; FlowPilot's
 * cockpit (briefings, autonomy loop, HIL approvals) lives at /admin/flowpilot.
 *
 * Layout: regular AdminLayout (pinned-pages header, left admin sidebar)
 * plus a right collapsible `SessionsAside` for chat history. Mobile gets
 * the same SessionPicker dropdown the workspace uses.
 */

import { useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { OperateChat } from '@/components/admin/copilot/OperateChat';
import { SessionPicker } from '@/components/admin/workspace/SessionPicker';
import { SessionsAside } from '@/components/admin/workspace/SessionsAside';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import type { WorkspaceSession } from '@/hooks/useWorkspaceSessions';

export default function FlowChatPage() {
  const { user, isWriter } = useAuth();

  const {
    messages,
    isLoading,
    skills,
    skillStats,
    conversationId,
    conversations,
    sendMessage,
    cancelRequest,
    loadSkills,
    loadConversations,
    switchConversation,
    deleteConversation,
    clearMessages,
  } = useAgentOperate();

  useEffect(() => {
    if (!user || !isWriter) return;
    loadSkills();
    loadConversations();
  }, [user, isWriter, loadSkills, loadConversations]);

  useEffect(() => {
    if (conversationId) {
      const t = setTimeout(() => loadConversations(), 800);
      return () => clearTimeout(t);
    }
  }, [conversationId, loadConversations]);

  const sessions = useMemo<WorkspaceSession[]>(
    () =>
      conversations.map((c) => ({
        id: c.id,
        title: c.title || 'Untitled',
        createdAt: (c as any).created_at || c.updated_at,
        updatedAt: c.updated_at,
      })),
    [conversations],
  );

  const handleNew = () => clearMessages();

  const handleRename = async (id: string, title: string) => {
    await supabase.from('chat_conversations').update({ title }).eq('id', id);
    loadConversations();
  };

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
  };

  return (
    <AdminLayout>
      {/* AdminLayout wraps non-cockpit pages in `<main className="p-8">`.
          We need edge-to-edge inside that main, so neutralise the padding. */}
      <div className="-m-8 flex h-[calc(100vh-4rem-3.5rem)] min-h-0">
        {/* Chat column */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {/* Mobile-only thin toolbar: session picker + operator badge */}
          <div className="md:hidden border-b border-border/40 px-4 py-2 flex items-center justify-between gap-2 shrink-0">
            <SessionPicker
              sessions={sessions}
              activeId={conversationId}
              onSelect={switchConversation}
              onNew={handleNew}
              onRename={handleRename}
              onDelete={handleDelete}
            />
            <Badge variant="secondary" className="text-[10px]">
              {skillStats ? `${skillStats.exposed} skills` : `${skills.length} skills`}
            </Badge>
          </div>

          {/* Desktop: operator badge floats top-right of the chat column */}
          <div className="hidden md:flex justify-end px-4 pt-3 shrink-0">
            <Badge
              variant="secondary"
              className="text-[10px]"
              title={
                skillStats
                  ? `${skillStats.exposed} skills exposed to FlowChat. ${skillStats.disabled} more skills exist but are hidden because their module is off (${skillStats.modulesOff} modules disabled).`
                  : `${skills.length} skills total in catalog`
              }
            >
              Operator · {skillStats ? `${skillStats.exposed} active` : `${skills.length} skills`}
              {skillStats && skillStats.disabled > 0 ? ` · ${skillStats.disabled} hidden` : ''}
            </Badge>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <OperateChat
              messages={messages}
              skills={skills}
              isLoading={isLoading}
              onSendMessage={sendMessage}
              onReset={handleNew}
              onCancel={cancelRequest}
            />
          </div>
        </div>

        {/* Right collapsible chat history (desktop+) */}
        <SessionsAside
          sessions={sessions}
          activeId={conversationId}
          onSelect={switchConversation}
          onNew={handleNew}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </div>
    </AdminLayout>
  );
}
