import { useEffect } from 'react';
import { Zap } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { UnifiedChat } from '@/components/chat/UnifiedChat';
import { ContextPanel } from '@/components/admin/copilot/ContextPanel';
import { useAgentOperate } from '@/hooks/useAgentOperate';

export default function CopilotPage() {
  const operate = useAgentOperate();

  useEffect(() => {
    operate.loadSkills();
    operate.loadActivity();
  }, []);

  return (
    <AdminLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">FlowPilot</h1>
                <Badge variant="secondary" className="text-xs">
                  {operate.skills.length} skills
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Your autonomous CMS operator — use <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">@</kbd> commands to access skills
              </p>
            </div>
          </div>
        </div>

        {/* Main content: Chat + Context Panel */}
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 min-w-0 border-r flex flex-col">
            <UnifiedChat
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
    </AdminLayout>
  );
}
