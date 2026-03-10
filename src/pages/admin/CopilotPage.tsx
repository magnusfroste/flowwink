import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { UnifiedChat } from '@/components/chat/UnifiedChat';
import { ActivityFeed } from '@/components/admin/copilot/ActivityFeed';
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
                Your autonomous CMS operator — use @commands to access skills
              </p>
            </div>
          </div>
        </div>

        {/* Main content: Chat + Activity sidebar */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r flex flex-col">
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
          <div className="w-80 flex flex-col bg-muted/30">
            <ActivityFeed
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
