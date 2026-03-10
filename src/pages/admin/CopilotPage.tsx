import { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, MessageSquare, Trash2 } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UnifiedChat } from '@/components/chat/UnifiedChat';
import { ContextPanel } from '@/components/admin/copilot/ContextPanel';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function CopilotPage() {
  const operate = useAgentOperate();
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    operate.loadSkills();
    operate.loadActivity();
  }, []);

  const handleNewChat = () => {
    operate.clearMessages();
    setChatKey(k => k + 1);
  };

  return (
    <AdminLayout>
      <div className="flex h-full">
        {/* Chat history sidebar */}
        <aside className="hidden md:flex w-64 lg:w-72 border-r bg-muted/30 flex-col shrink-0">
          <div className="p-3 border-b">
            <Button onClick={handleNewChat} className="w-full gap-2" size="sm">
              <Plus className="h-4 w-4" />
              New chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {/* Current active chat indicator */}
              <div className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-muted'
              )}>
                <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="flex-1 truncate text-foreground font-medium">
                  {operate.messages.length > 0
                    ? (operate.messages.find(m => m.role === 'user')?.content?.slice(0, 40) || 'New chat')
                    : 'New chat'}
                </span>
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* Main chat + context */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat area */}
          <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 min-w-0 border-r flex flex-col">
              <UnifiedChat
                key={chatKey}
                scope="admin"
                messages={operate.messages}
                skills={operate.skills}
                isLoading={operate.isLoading}
                onSendMessage={operate.sendMessage}
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
      </div>
    </AdminLayout>
  );
}
