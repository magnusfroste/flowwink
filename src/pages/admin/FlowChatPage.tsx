/**
 * FlowChat — internal operator chat for authenticated admins.
 *
 * Tesla analogy: FlowPilot (Autopilot) can be off, but you still use the
 * built-in chat to talk to the platform — execute skills, run /commands,
 * ask questions. FlowChat is the platform-layer chat surface; FlowPilot's
 * cockpit (briefings, autonomy loop, HIL approvals) lives at /admin/flowpilot.
 *
 * - Wraps OperateChat (same engine as the FlowPilot cockpit) with admin
 *   sidebar + a sessions panel that mirrors /chat's history.
 * - Sessions sidebar is filtered by useAgentOperate.loadConversations to only
 *   include conversations with at least one user message — autonomous logs
 *   no longer pollute the list.
 * - Independent of the FlowPilot module flag.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { OperateChat } from '@/components/admin/copilot/OperateChat';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageSquare, Trash2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export default function FlowChatPage() {
  const { user, isWriter } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen] = useState(true);

  const {
    messages,
    isLoading,
    skills,
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

  // Load skills + sessions on mount
  useEffect(() => {
    if (!user || !isWriter) return;
    loadSkills();
    loadConversations();
  }, [user, isWriter, loadSkills, loadConversations]);

  // Reload sessions list whenever the active conversation changes
  // (a freshly-created session needs to appear in the sidebar)
  useEffect(() => {
    if (conversationId) {
      const t = setTimeout(() => loadConversations(), 800);
      return () => clearTimeout(t);
    }
  }, [conversationId, loadConversations]);

  const handleNewConversation = () => {
    clearMessages();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    await deleteConversation(id);
  };

  return (
    <AdminLayout>
      <div className="flex h-full min-h-0 w-full">
        {/* Sessions sidebar */}
        <aside
          className={cn(
            'w-72 border-r bg-muted/20 flex flex-col flex-shrink-0 transition-all',
            !sidebarOpen && 'w-0 overflow-hidden',
          )}
        >
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">FlowChat</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Open visitor chat"
                onClick={() => navigate('/chat')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button onClick={handleNewConversation} className="w-full gap-2" size="sm">
              <Plus className="h-4 w-4" />
              New conversation
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {conversations.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8 px-4">
                  No conversations yet. Say hi to get started.
                </p>
              )}
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => switchConversation(conv.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm group transition-colors',
                    'hover:bg-muted',
                    conversationId === conv.id && 'bg-muted',
                  )}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{conv.title || 'Untitled'}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={(e) => handleDelete(conv.id, e)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </button>
              ))}
            </div>
          </ScrollArea>

          <div className="p-3 border-t text-[10px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">FlowChat</strong> is the platform's
            operator chat. FlowPilot's autonomy cockpit (briefings, HIL, automations)
            lives at <code>/admin/flowpilot</code>.
          </div>
        </aside>

        {/* Chat */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <OperateChat
            messages={messages}
            skills={skills}
            isLoading={isLoading}
            onSendMessage={sendMessage}
            onReset={handleNewConversation}
            onCancel={cancelRequest}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
