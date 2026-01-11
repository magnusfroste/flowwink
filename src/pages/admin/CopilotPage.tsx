import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Sparkles, Wand2 } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCopilot } from '@/hooks/useCopilot';
import { CopilotChat } from '@/components/admin/copilot/CopilotChat';
import { CopilotPreviewPanel } from '@/components/admin/copilot/CopilotPreviewPanel';
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
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">Copilot</h1>
                <Badge variant="secondary" className="text-xs">AI-driven</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Beskriv din verksamhet så bygger jag sidor och aktiverar moduler
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasApprovedBlocks && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Wand2 className="h-4 w-4 mr-2" />
                Skapa sida ({copilot.approvedBlocks.length} block)
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
              isLoading={copilot.isLoading}
              onSendMessage={copilot.sendMessage}
              onCancel={copilot.cancelRequest}
              moduleRecommendation={copilot.moduleRecommendation}
              onAcceptModules={copilot.acceptModules}
              onRejectModules={copilot.rejectModules}
            />
          </div>

          {/* Right panel - Preview */}
          <div className="w-1/2 flex flex-col bg-muted/30">
            <CopilotPreviewPanel
              blocks={copilot.blocks}
              onApprove={copilot.approveBlock}
              onReject={copilot.rejectBlock}
              onRegenerate={copilot.regenerateBlock}
              moduleRecommendation={copilot.moduleRecommendation}
            />
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
