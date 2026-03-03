import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Wand2, Terminal, Bot, ArrowRightLeft } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCopilot } from '@/hooks/useCopilot';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { CopilotChat } from '@/components/admin/copilot/CopilotChat';
import { CopilotPreviewPanel } from '@/components/admin/copilot/CopilotPreviewPanel';
import { CopilotMigrationPreview } from '@/components/admin/copilot/CopilotMigrationPreview';
import { CreateFromCopilotDialog } from '@/components/admin/copilot/CreateFromCopilotDialog';
import { OperateChat } from '@/components/admin/copilot/OperateChat';
import { ActivityFeed } from '@/components/admin/copilot/ActivityFeed';

type FlowPilotMode = 'migrate' | 'operate';

export default function CopilotPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<FlowPilotMode>('operate');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const copilot = useCopilot();
  const operate = useAgentOperate();

  // Load skills and activity when entering operate mode
  useEffect(() => {
    if (mode === 'operate') {
      operate.loadSkills();
      operate.loadActivity();
    }
  }, [mode]);

  const hasApprovedBlocks = copilot.approvedBlocks.length > 0;

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
                  {mode === 'migrate' ? 'Migration' : 'Operate'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {mode === 'migrate'
                  ? "I'll migrate your entire site — pages, blog, and knowledge base"
                  : 'Tell me what to do — I operate your CMS'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode switcher */}
            <Tabs value={mode} onValueChange={(v) => setMode(v as FlowPilotMode)}>
              <TabsList className="h-9">
                <TabsTrigger value="operate" className="text-xs gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />
                  Operate
                </TabsTrigger>
                <TabsTrigger value="migrate" className="text-xs gap-1.5">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Migrate
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Create page button (migrate mode only) */}
            {mode === 'migrate' && hasApprovedBlocks && copilot.migrationState.discoveryStatus !== 'migrating' && copilot.migrationState.discoveryStatus !== 'ready' && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Wand2 className="h-4 w-4 mr-2" />
                Create page ({copilot.approvedBlocks.length} blocks)
              </Button>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {mode === 'migrate' ? (
            <>
              {/* Migration mode — existing layout */}
              <div className="w-1/2 border-r flex flex-col">
                <CopilotChat
                  messages={copilot.messages}
                  blocks={copilot.blocks}
                  isLoading={copilot.isLoading}
                  isAutoContinue={copilot.isAutoContinue}
                  onSendMessage={copilot.sendMessage}
                  onCancel={copilot.cancelRequest}
                  onFinishPage={() => setShowCreateDialog(true)}
                  onStopAutoContinue={copilot.stopAutoContinue}
                  onReset={copilot.clearConversation}
                  onAnalyzeSite={copilot.discoverPages}
                  discoveryStatus={copilot.migrationState.discoveryStatus}
                />
              </div>
              <div className="w-1/2 flex flex-col bg-muted/30">
                {(copilot.migrationState.isActive || copilot.migrationState.discoveryStatus === 'selecting') ? (
                  <CopilotMigrationPreview
                    migrationState={copilot.migrationState}
                    onApprove={copilot.approveMigrationBlock}
                    onSkip={copilot.skipMigrationBlock}
                    onEdit={copilot.editMigrationBlock}
                    onMigrateNextPage={copilot.migrateNextPage}
                    onStartBlogMigration={copilot.startBlogMigration}
                    onStartKbMigration={copilot.startKbMigration}
                    onSkipPhase={copilot.skipPhase}
                    onPagesChange={copilot.updateDiscoveredPages}
                    onConfirmSelection={copilot.confirmPageSelection}
                    onCancelSelection={copilot.cancelPageSelection}
                    isLoading={copilot.isLoading}
                  />
                ) : (
                  <CopilotPreviewPanel
                    blocks={copilot.blocks}
                    onApprove={copilot.approveBlock}
                    onReject={copilot.rejectBlock}
                    onRegenerate={copilot.regenerateBlock}
                    migrationState={copilot.migrationState}
                    onTogglePage={copilot.togglePageSelection}
                    isLoading={copilot.isLoading}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              {/* Operate mode — chat + activity feed */}
              <div className="flex-1 border-r flex flex-col">
                <OperateChat
                  messages={operate.messages}
                  skills={operate.skills}
                  isLoading={operate.isLoading}
                  onSendMessage={operate.sendMessage}
                  onReset={operate.clearMessages}
                />
              </div>
              <div className="w-80 flex flex-col bg-muted/30">
                <ActivityFeed
                  activities={operate.activities}
                  onApprove={operate.approveAction}
                  onRefresh={operate.loadActivity}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create page dialog */}
      <CreateFromCopilotDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        blocks={copilot.approvedBlocks}
        onSuccess={() => {
          copilot.clearConversation();
          navigate('/admin/pages');
        }}
      />
    </AdminLayout>
  );
}
