import { useState, useEffect } from 'react';
import { Zap, Plus, Trash2, MessageSquare } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { UnifiedChat } from '@/components/chat/UnifiedChat';
import { ContextPanel } from '@/components/admin/copilot/ContextPanel';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export default function CopilotPage() {
  const operate = useAgentOperate();
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    operate.loadSkills();
    operate.loadActivity();
    operate.loadConversations();
  }, []);

  const handleNewChat = () => {
    operate.clearMessages();
    setChatKey(k => k + 1);
    // Reload conversations after a delay so the new one appears
    setTimeout(() => operate.loadConversations(), 500);
  };

  const handleSwitchConversation = (id: string) => {
    operate.switchConversation(id);
    setChatKey(k => k + 1);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await operate.deleteConversation(id);
  };

  // Reload conversation list when a message is sent
  const handleSendMessage = async (content: string) => {
    await operate.sendMessage(content);
    setTimeout(() => operate.loadConversations(), 1500);
  };

  return (
    <AdminLayout>
      {/* Chat history sidebar — full height */}
      <aside className="hidden md:flex w-64 lg:w-72 border-r bg-muted/30 flex-col shrink-0">
        <div className="p-3 border-b">
          <Button onClick={handleNewChat} className="w-full gap-2" size="sm">
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {operate.conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleSwitchConversation(conv.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm group transition-colors',
                  'hover:bg-muted',
                  operate.conversationId === conv.id && 'bg-muted'
                )}
              >
                <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block truncate text-foreground">
                    {conv.title || 'Untitled'}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </button>
            ))}

            {operate.conversations.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 px-4 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-xs text-center">No previous chats</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Right column: header + chat + context */}
      <div className="flex-1 flex flex-col min-w-0">
        <AdminContentHeader />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-w-0 border-r flex flex-col">
            <UnifiedChat
              key={chatKey}
              scope="admin"
              messages={operate.messages}
              skills={operate.skills}
              isLoading={operate.isLoading}
              onSendMessage={handleSendMessage}
              onReset={operate.clearMessages}
              onCancel={operate.cancelRequest}
            />
          </div>
          <div className="hidden lg:flex w-72 xl:w-80 shrink-0 flex-col bg-muted/30 overflow-hidden">
            <ContextPanel
              activities={operate.activities}
              onApprove={operate.approveAction}
              onRefresh={operate.loadActivity}
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
