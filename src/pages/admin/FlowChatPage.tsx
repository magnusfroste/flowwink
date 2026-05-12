/**
 * FlowChat — internal operator chat for authenticated admins.
 *
 * Tesla analogy: FlowPilot (Autopilot) can be off, but you still use the
 * built-in chat to talk to the platform — execute skills, run /commands,
 * ask questions. FlowChat is the platform-layer chat surface; FlowPilot's
 * cockpit (briefings, autonomy loop, HIL approvals) lives at /admin/flowpilot.
 *
 * Layout mirrors /admin/cowork: no left aside (admin sidebar is already
 * there), sessions live in a header `SessionPicker` dropdown.
 */

import { useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { OperateChat } from '@/components/admin/copilot/OperateChat';
import { SessionPicker } from '@/components/admin/workspace/SessionPicker';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
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
    executeSkill,
    approveAction,
    rejectAction,
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

  // Reload sidebar shortly after a fresh conversation is created
  useEffect(() => {
    if (conversationId) {
      const t = setTimeout(() => loadConversations(), 800);
      return () => clearTimeout(t);
    }
  }, [conversationId, loadConversations]);

  // Map FlowPilotConversation → WorkspaceSession shape for SessionPicker reuse
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
      <div className="h-[calc(100vh-4rem)] flex flex-col bg-background">
        {/* Slim header — mirrors /admin/cowork */}
        <div className="border-b border-border/40 px-4 md:px-6 py-3 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">FlowChat</span>
            </div>
            <SessionPicker
              sessions={sessions}
              activeId={conversationId}
              onSelect={switchConversation}
              onNew={handleNew}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="text-[10px]"
              title={
                skillStats
                  ? `${skillStats.exposed} skills exposed to FlowChat. ${skillStats.disabled} more skills exist but are hidden because their module is off (${skillStats.modulesOff} modules disabled). Enable modules in /admin/modules to expand FlowChat's reach.`
                  : `${skills.length} skills total in catalog`
              }
            >
              Operator · {skillStats ? `${skillStats.exposed} active` : `${skills.length} skills`}
              {skillStats && skillStats.disabled > 0 ? ` · ${skillStats.disabled} hidden` : ''}
            </Badge>
          </div>
        </div>

        {/* Chat body */}
        <div className="flex-1 flex flex-col min-h-0">
          <OperateChat
            messages={messages}
            skills={skills}
            isLoading={isLoading}
            onSendMessage={sendMessage}
            onReset={handleNew}
            onCancel={cancelRequest}
            onExecuteSkill={executeSkill}
            onApproveAction={approveAction}
            onRejectAction={rejectAction}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
