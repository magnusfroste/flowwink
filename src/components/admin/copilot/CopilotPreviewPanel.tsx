import { useState } from 'react';
import { Monitor, Tablet, Smartphone, Layers, Check, Package } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { CopilotArtifact } from './CopilotArtifact';
import type { CopilotBlock, ModuleRecommendation } from '@/hooks/useCopilot';
import { defaultModulesSettings } from '@/hooks/useModules';

interface CopilotPreviewPanelProps {
  blocks: CopilotBlock[];
  onApprove: (blockId: string) => void;
  onReject: (blockId: string) => void;
  onRegenerate: (blockId: string, feedback?: string) => void;
  moduleRecommendation: ModuleRecommendation | null;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export function CopilotPreviewPanel({
  blocks,
  onApprove,
  onReject,
  onRegenerate,
  moduleRecommendation,
}: CopilotPreviewPanelProps) {
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [activeTab, setActiveTab] = useState<'blocks' | 'modules'>('blocks');

  const pendingBlocks = blocks.filter(b => b.status === 'pending');
  const approvedBlocks = blocks.filter(b => b.status === 'approved');

  const isEmpty = blocks.length === 0 && !moduleRecommendation;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="h-8">
            <TabsTrigger value="blocks" className="text-xs px-3 gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Blocks
              {blocks.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {blocks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="modules" className="text-xs px-3 gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Modules
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Device toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={deviceMode === 'desktop' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setDeviceMode('desktop')}
          >
            <Monitor className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={deviceMode === 'tablet' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setDeviceMode('tablet')}
          >
            <Tablet className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={deviceMode === 'mobile' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setDeviceMode('mobile')}
          >
            <Smartphone className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {activeTab === 'blocks' && (
          <div className="p-4 space-y-4">
            {isEmpty ? (
              <EmptyState />
            ) : (
              <>
                {/* Pending blocks */}
                {pendingBlocks.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Pending approval
                    </p>
                    {pendingBlocks.map((block) => (
                      <CopilotArtifact
                        key={block.id}
                        block={block}
                        onApprove={() => onApprove(block.id)}
                        onReject={() => onReject(block.id)}
                        onRegenerate={(feedback) => onRegenerate(block.id, feedback)}
                        deviceMode={deviceMode}
                      />
                    ))}
                  </div>
                )}

                {/* Approved blocks */}
                {approvedBlocks.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Approved blocks
                    </p>
                    {approvedBlocks.map((block) => (
                      <CopilotArtifact
                        key={block.id}
                        block={block}
                        onApprove={() => {}}
                        onReject={() => {}}
                        onRegenerate={() => {}}
                        deviceMode={deviceMode}
                        isApproved
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'modules' && (
          <div className="p-4 space-y-4">
            <ModulesPreview recommendation={moduleRecommendation} />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-4 rounded-full bg-muted mb-4">
        <Layers className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-medium mb-1">No blocks yet</h3>
      <p className="text-sm text-muted-foreground max-w-[250px]">
        Describe your business in the chat and I'll create blocks for your page
      </p>
    </div>
  );
}

function ModulesPreview({ recommendation }: { recommendation: ModuleRecommendation | null }) {
  const recommendedModules = recommendation?.modules || [];
  const isAccepted = recommendation?.status === 'accepted';

  if (recommendedModules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-4 rounded-full bg-muted mb-4">
          <Package className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-medium mb-1">No modules recommended</h3>
        <p className="text-sm text-muted-foreground max-w-[250px]">
          Describe your business and I'll recommend suitable modules
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {isAccepted ? 'Activated modules' : 'Recommended modules'}
        </p>
        {isAccepted && (
          <Badge variant="default" className="text-xs">
            <Check className="h-3 w-3 mr-1" />
            Activated
          </Badge>
        )}
      </div>

      <div className="grid gap-2">
        {recommendedModules.map((moduleId) => {
          const module = defaultModulesSettings[moduleId];
          return (
            <div
              key={moduleId}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border',
                isAccepted ? 'bg-primary/5 border-primary/20' : 'bg-muted/50'
              )}
            >
              <div className={cn(
                'p-2 rounded-lg',
                isAccepted ? 'bg-primary/10' : 'bg-background'
              )}>
                <Package className={cn(
                  'h-4 w-4',
                  isAccepted ? 'text-primary' : 'text-muted-foreground'
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{module?.name || moduleId}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {module?.description}
                </p>
              </div>
              {isAccepted && (
                <Check className="h-4 w-4 text-primary flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {recommendation?.reason && (
        <p className="text-xs text-muted-foreground italic">
          {recommendation.reason}
        </p>
      )}
    </div>
  );
}
