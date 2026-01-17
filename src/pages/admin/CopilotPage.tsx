import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Wand2 } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCopilot } from '@/hooks/useCopilot';
import { CopilotChat } from '@/components/admin/copilot/CopilotChat';
import { CopilotPreviewPanel } from '@/components/admin/copilot/CopilotPreviewPanel';
import { CopilotMigrationPreview } from '@/components/admin/copilot/CopilotMigrationPreview';
import { CreateFromCopilotDialog } from '@/components/admin/copilot/CreateFromCopilotDialog';

export default function CopilotPage() {
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const copilot = useCopilot();

  const hasApprovedBlocks = copilot.approvedBlocks.length > 0;

  // Custom layout without p-8 padding for full width split view

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
                <Badge variant="secondary" className="text-xs">AI Migration Agent</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                I'll migrate your entire site — pages, blog, and knowledge base
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasApprovedBlocks && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Wand2 className="h-4 w-4 mr-2" />
                Create page ({copilot.approvedBlocks.length} blocks)
              </Button>
            )}
          </div>
        </div>

        {/* Main content - Split view */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel - Chat */}
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
              moduleRecommendation={copilot.moduleRecommendation}
              onAcceptModules={copilot.acceptModules}
              onRejectModules={copilot.rejectModules}
            />
          </div>

          {/* Right panel - Preview or Migration */}
          <div className="w-1/2 flex flex-col bg-muted/30">
            {copilot.migrationState.isActive ? (
              <CopilotMigrationPreview
                migrationState={copilot.migrationState}
                onApprove={copilot.approveMigrationBlock}
                onSkip={copilot.skipMigrationBlock}
                onEdit={copilot.editMigrationBlock}
                onMigrateNextPage={copilot.migrateNextPage}
                onStartBlogMigration={copilot.startBlogMigration}
                onStartKbMigration={copilot.startKbMigration}
                onSkipPhase={copilot.skipPhase}
                isLoading={copilot.isLoading}
              />
            ) : (
              <CopilotPreviewPanel
                blocks={copilot.blocks}
                onApprove={copilot.approveBlock}
                onReject={copilot.rejectBlock}
                onRegenerate={copilot.regenerateBlock}
                moduleRecommendation={copilot.moduleRecommendation}
              />
            )}
          </div>
        </div>
      </div>

      {/* Create page dialog */}
      <CreateFromCopilotDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        blocks={copilot.approvedBlocks}
        moduleRecommendation={copilot.moduleRecommendation}
        onSuccess={() => {
          copilot.clearConversation();
          navigate('/admin/pages');
        }}
      />
    </AdminLayout>
  );
}
