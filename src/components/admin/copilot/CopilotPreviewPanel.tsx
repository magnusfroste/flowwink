import { useState } from 'react';
import { Monitor, Tablet, Smartphone, Layers, Globe } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopilotArtifact } from './CopilotArtifact';
import { CopilotSiteOverview } from './CopilotSiteOverview';
import type { CopilotBlock, MigrationState } from '@/hooks/useCopilot';

interface CopilotPreviewPanelProps {
  blocks: CopilotBlock[];
  onApprove: (blockId: string) => void;
  onReject: (blockId: string) => void;
  onRegenerate: (blockId: string, feedback?: string) => void;
  migrationState: MigrationState;
  onTogglePage: (url: string) => void;
  isLoading: boolean;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export function CopilotPreviewPanel({
  blocks,
  onApprove,
  onReject,
  onRegenerate,
  migrationState,
  onTogglePage,
  isLoading,
}: CopilotPreviewPanelProps) {
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [activeTab, setActiveTab] = useState<'site' | 'blocks'>(() => {
    return migrationState.siteStructure ? 'site' : 'blocks';
  });

  const activeBlocks = blocks.filter(b => b.status !== 'rejected');
  const isEmpty = blocks.length === 0;
  const hasSiteStructure = !!migrationState.siteStructure;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="h-8">
            <TabsTrigger value="site" className="text-xs px-3 gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Site
              {hasSiteStructure && migrationState.siteStructure && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {migrationState.siteStructure.pages.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="blocks" className="text-xs px-3 gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Blocks
              {blocks.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {blocks.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Device toggle - only show for blocks tab */}
        {activeTab === 'blocks' && (
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
        )}
      </div>

      {/* Content */}
      {activeTab === 'site' && (
        <CopilotSiteOverview
          siteStructure={migrationState.siteStructure}
          discoveryStatus={migrationState.discoveryStatus}
          onTogglePage={onTogglePage}
          isLoading={isLoading}
        />
      )}

      {activeTab === 'blocks' && (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {isEmpty ? (
              <EmptyState />
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Page blocks ({activeBlocks.length})
                </p>
                {activeBlocks.map((block) => (
                  <CopilotArtifact
                    key={block.id}
                    block={block}
                    onApprove={() => onApprove(block.id)}
                    onReject={() => onReject(block.id)}
                    onRegenerate={(feedback) => onRegenerate(block.id, feedback)}
                    deviceMode={deviceMode}
                    isApproved={block.status === 'approved'}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
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