/**
 * FlowChat — internal operator chat for authenticated admins.
 *
 * Tesla analogy: FlowPilot (Autopilot) can be off, but you still use the
 * built-in chat to talk to the platform — execute skills, run /commands,
 * ask questions. FlowChat is the platform-layer chat surface; FlowPilot's
 * cockpit (briefings, autonomy loop, HIL approvals) lives at /admin/flowpilot.
 *
 * Layout: the ChatShell Flowwork uses too — header (title · actions),
 * hero or conversation with the shared ChatComposer, sessions on the right.
 * Mobile gets the SessionPicker in the header.
 */

import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { OperateChat } from '@/components/admin/copilot/OperateChat';
import { SessionPicker } from '@/components/admin/workspace/SessionPicker';
import { SessionsAside } from '@/components/admin/workspace/SessionsAside';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gauge, ListChecks, Loader2, MessageSquarePlus, Terminal } from 'lucide-react';
import { stepSummary } from '@/lib/step-summary';
import { ChatShell } from '@/components/admin/chat/ChatShell';
import { ChatSidePanel } from '@/components/admin/chat/ChatSidePanel';
import { supabase } from '@/integrations/supabase/client';
import type { WorkspaceSession } from '@/hooks/useWorkspaceSessions';
import { ProvenanceLine } from '@/components/ui/provenance-line';

export default function FlowChatPage() {
  // ?prompt= from the skill catalog's "Try in FlowChat": pre-filled, never auto-sent.
  const [searchParams] = useSearchParams();
  const promptParam = searchParams.get('prompt') ?? undefined;
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

  // The last turn's steps, for the Steps section.
  const lastSteps = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    return last?.skillResults ?? (last?.skillResult ? [last.skillResult] : []);
  }, [messages]);

  const handleRename = async (id: string, title: string) => {
    await supabase.from('chat_conversations').update({ title }).eq('id', id);
    loadConversations();
  };

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
  };

  return (
    <AdminLayout>
      <ChatShell
        icon={<Terminal className="h-4 w-4 text-primary" />}
        title="FlowChat"
        mobileSessions={
          <SessionPicker
            sessions={sessions}
            activeId={conversationId}
            onSelect={switchConversation}
            onNew={handleNew}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        }
        sessions={
          <SessionsAside
            side="left"
            sessions={sessions}
            activeId={conversationId}
            onSelect={switchConversation}
            onNew={handleNew}
            onRename={handleRename}
            onDelete={handleDelete}
            viewAllHref="/admin/flowchat/sessions"
          />
        }
        aside={
          <ChatSidePanel
            sections={[
              {
                id: 'running',
                title: 'Running',
                icon: Loader2,
                hidden: !isLoading,
                content: <p className="text-muted-foreground">Working on your message…</p>,
              },
              {
                id: 'steps',
                title: 'Steps',
                icon: ListChecks,
                hidden: lastSteps.length === 0,
                meta: stepSummary(lastSteps),
                content: (
                  <ul className="space-y-1">
                    {lastSteps.map((sr, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className="truncate">{sr.skill.replace(/_/g, ' ')}</span>
                        <span className={String(sr.status) === 'failed' || sr.status === 'error' ? 'text-destructive shrink-0' : 'text-muted-foreground shrink-0'}>{sr.status}</span>
                      </li>
                    ))}
                    <li className="pt-1"><Link to="/admin/flowpilot?tab=log" className="text-primary hover:underline">Why — the run in the Log →</Link></li>
                  </ul>
                ),
              },
              {
                id: 'context',
                title: 'Context',
                icon: Gauge,
                meta: skillStats ? `${skillStats.exposed} skills` : `${skills.length} skills`,
                content: (
                  <div className="space-y-1 text-muted-foreground">
                    <p>Operator — acts on your message with the skills of the modules that are on.</p>
                    {skillStats && skillStats.disabled > 0 && (
                      <p>{skillStats.disabled} skills hidden — their modules are off. <Link to="/admin/modules" className="text-primary hover:underline">Modules</Link></p>
                    )}
                  </div>
                ),
              },
            ]}
          />
        }
        actions={
          <>
            {/* #97 B1: the WHY lives in the line, not in a title-tooltip. */}
            {skillStats && skillStats.disabled > 0 && (
              <ProvenanceLine className="hidden lg:flex" to="/admin/modules" linkLabel="Modules">
                {skillStats.disabled} skills hidden — their modules are off.
              </ProvenanceLine>
            )}
            <Badge variant="secondary" className="text-[10px]">
              Operator · {skillStats ? `${skillStats.exposed} active` : `${skills.length} skills`}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNew}
              disabled={isLoading || messages.length === 0}
              className="gap-1.5"
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">New</span>
            </Button>
          </>
        }
      >
        <OperateChat
          messages={messages}
          skills={skills}
          isLoading={isLoading}
          onSendMessage={sendMessage}
          onReset={handleNew}
          onCancel={cancelRequest}
          initialInput={promptParam}
        />
      </ChatShell>
    </AdminLayout>
  );
}
