import { useState } from 'react';
import { Check, X, Edit3, SkipForward, Globe, ExternalLink, ChevronRight, FileText, BookOpen, Library, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { CopilotBlock, MigrationState, MigrationPhase } from '@/hooks/useCopilot';

interface CopilotMigrationPreviewProps {
  migrationState: MigrationState;
  onApprove: () => void;
  onSkip: () => void;
  onEdit: (feedback: string) => void;
  onMigrateNextPage: (url: string) => void;
  onStartBlogMigration?: () => void;
  onStartKbMigration?: () => void;
  onSkipPhase?: () => void;
  isLoading?: boolean;
}

// Block type icons and labels
const BLOCK_LABELS: Record<string, { label: string; color: string }> = {
  hero: { label: 'Hero', color: 'bg-blue-500/10 text-blue-600' },
  text: { label: 'Text', color: 'bg-gray-500/10 text-gray-600' },
  features: { label: 'Features', color: 'bg-purple-500/10 text-purple-600' },
  cta: { label: 'CTA', color: 'bg-orange-500/10 text-orange-600' },
  testimonials: { label: 'Testimonials', color: 'bg-green-500/10 text-green-600' },
  gallery: { label: 'Gallery', color: 'bg-pink-500/10 text-pink-600' },
  contact: { label: 'Contact', color: 'bg-cyan-500/10 text-cyan-600' },
  pricing: { label: 'Pricing', color: 'bg-yellow-500/10 text-yellow-600' },
  team: { label: 'Team', color: 'bg-indigo-500/10 text-indigo-600' },
  stats: { label: 'Stats', color: 'bg-red-500/10 text-red-600' },
  logos: { label: 'Logos', color: 'bg-teal-500/10 text-teal-600' },
  accordion: { label: 'FAQ', color: 'bg-amber-500/10 text-amber-600' },
  form: { label: 'Form', color: 'bg-emerald-500/10 text-emerald-600' },
};

function getBlockLabel(type: string) {
  return BLOCK_LABELS[type] || { label: type.charAt(0).toUpperCase() + type.slice(1), color: 'bg-muted text-muted-foreground' };
}

function BlockPreviewContent({ block }: { block: CopilotBlock }) {
  const data = block.data;
  
  switch (block.type) {
    case 'hero':
      return (
        <div className="space-y-2">
          {data.title && <h3 className="text-lg font-bold">{String(data.title)}</h3>}
          {data.subtitle && <p className="text-sm text-muted-foreground">{String(data.subtitle)}</p>}
          {data.primaryButton && (
            <Badge variant="secondary" className="text-xs">
              Button: {String((data.primaryButton as Record<string, unknown>).text || '')}
            </Badge>
          )}
        </div>
      );
    
    case 'features':
      const features = (data.features as Array<{ title?: string; description?: string }>) || [];
      return (
        <div className="space-y-2">
          {data.title && <h4 className="font-medium">{String(data.title)}</h4>}
          <div className="grid grid-cols-2 gap-2">
            {features.slice(0, 4).map((f, i) => (
              <div key={i} className="text-xs p-2 bg-muted/50 rounded">
                <span className="font-medium">{f.title}</span>
              </div>
            ))}
            {features.length > 4 && (
              <div className="text-xs text-muted-foreground">+{features.length - 4} more</div>
            )}
          </div>
        </div>
      );
    
    case 'testimonials':
      const testimonials = (data.testimonials as Array<{ content?: string; author?: string }>) || [];
      return (
        <div className="space-y-2">
          {data.title && <h4 className="font-medium">{String(data.title)}</h4>}
          {testimonials[0] && (
            <div className="text-xs italic border-l-2 border-primary/30 pl-2">
              "{String(testimonials[0].content || '').slice(0, 100)}..."
              <span className="block text-muted-foreground mt-1">— {testimonials[0].author}</span>
            </div>
          )}
          {testimonials.length > 1 && (
            <span className="text-xs text-muted-foreground">+{testimonials.length - 1} more testimonials</span>
          )}
        </div>
      );
    
    case 'cta':
      return (
        <div className="space-y-2">
          {data.title && <h4 className="font-medium">{String(data.title)}</h4>}
          {data.subtitle && <p className="text-xs text-muted-foreground">{String(data.subtitle)}</p>}
          {data.buttonText && (
            <Badge variant="default" className="text-xs">{String(data.buttonText)}</Badge>
          )}
        </div>
      );
    
    case 'text':
      const content = String(data.content || '').replace(/<[^>]*>/g, '');
      return (
        <p className="text-sm text-muted-foreground line-clamp-4">{content.slice(0, 200)}...</p>
      );
    
    case 'contact':
      return (
        <div className="space-y-1 text-xs">
          {data.title && <h4 className="font-medium">{String(data.title)}</h4>}
          {data.email && <div>📧 {String(data.email)}</div>}
          {data.phone && <div>📞 {String(data.phone)}</div>}
          {data.address && <div>📍 {String(data.address)}</div>}
        </div>
      );
    
    case 'pricing':
      const tiers = (data.tiers as Array<{ name?: string; price?: string }>) || [];
      return (
        <div className="flex gap-2">
          {tiers.slice(0, 3).map((tier, i) => (
            <div key={i} className="text-xs p-2 bg-muted/50 rounded flex-1 text-center">
              <div className="font-medium">{tier.name}</div>
              <div className="text-muted-foreground">{tier.price}</div>
            </div>
          ))}
        </div>
      );
    
    default:
      return (
        <div className="text-sm text-muted-foreground">
          {JSON.stringify(data).slice(0, 150)}...
        </div>
      );
  }
}

const PHASE_CONFIG: Record<MigrationPhase, { label: string; icon: typeof FileText; color: string }> = {
  idle: { label: 'Ready', icon: Zap, color: 'text-muted-foreground' },
  pages: { label: 'Pages', icon: FileText, color: 'text-blue-600' },
  blog: { label: 'Blog', icon: BookOpen, color: 'text-purple-600' },
  knowledgeBase: { label: 'Knowledge Base', icon: Library, color: 'text-green-600' },
  complete: { label: 'Complete', icon: Check, color: 'text-green-600' },
};

export function CopilotMigrationPreview({
  migrationState,
  onApprove,
  onSkip,
  onEdit,
  onMigrateNextPage,
  onStartBlogMigration,
  onStartKbMigration,
  onSkipPhase,
  isLoading,
}: CopilotMigrationPreviewProps) {
  const [editFeedback, setEditFeedback] = useState('');
  const [showEditInput, setShowEditInput] = useState(false);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);

  const { pendingBlocks, currentBlockIndex, discoveredLinks, sourceUrl, detectedPlatform, pageTitle, phase, hasBlog, hasKnowledgeBase, blogUrls, kbUrls, pagesCompleted, pagesTotal } = migrationState;
  const currentBlock = pendingBlocks[currentBlockIndex];
  const isComplete = currentBlockIndex >= pendingBlocks.length;
  const progress = pendingBlocks.length > 0 ? Math.round((currentBlockIndex / pendingBlocks.length) * 100) : 0;

  const handleEdit = () => {
    if (editFeedback.trim()) {
      onEdit(editFeedback);
      setEditFeedback('');
      setShowEditInput(false);
    }
  };

  if (!migrationState.isActive) {
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Migrating from</span>
          <Badge variant="secondary" className="text-xs font-mono truncate max-w-[200px]">
            {sourceUrl}
          </Badge>
        </div>
        
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{pageTitle || 'Page'}</span>
            <span>{currentBlockIndex} of {pendingBlocks.length}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {detectedPlatform && (
          <Badge variant="outline" className="mt-2 text-xs">
            Detected: {detectedPlatform}
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Current block preview */}
          {currentBlock && !isComplete && (
            <Card className="border-primary/30">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={cn('text-xs', getBlockLabel(currentBlock.type).color)}>
                      {getBlockLabel(currentBlock.type).label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Section {currentBlockIndex + 1}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-3 px-4 border-t">
                <BlockPreviewContent block={currentBlock} />
              </CardContent>
              
              {/* Actions */}
              <div className="p-3 border-t bg-muted/30 space-y-2">
                {showEditInput ? (
                  <div className="flex gap-2">
                    <Input
                      value={editFeedback}
                      onChange={(e) => setEditFeedback(e.target.value)}
                      placeholder="How should I change this?"
                      className="flex-1 h-8 text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
                    />
                    <Button size="sm" onClick={handleEdit} disabled={!editFeedback.trim() || isLoading}>
                      Apply
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowEditInput(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      onClick={onApprove}
                      disabled={isLoading}
                      className="flex-1 gap-1"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Keep
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => setShowEditInput(true)}
                      disabled={isLoading}
                      className="gap-1"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={onSkip}
                      disabled={isLoading}
                      className="gap-1 text-muted-foreground"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      Skip
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Completion state */}
          {isComplete && (
            <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="py-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mb-3">
                  <Check className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-medium mb-1">Migration Complete!</h3>
                <p className="text-sm text-muted-foreground">
                  All {pendingBlocks.length} sections have been reviewed.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Discovered pages */}
          {discoveredLinks.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Other pages found ({discoveredLinks.length})
                </h4>
                <div className="space-y-1">
                  {discoveredLinks.map((link, i) => {
                    const fullUrl = new URL(link, sourceUrl!).href;
                    const isMigrated = migrationState.migratedPages.includes(fullUrl);
                    
                    return (
                      <button
                        key={i}
                        onClick={() => !isMigrated && onMigrateNextPage(fullUrl)}
                        disabled={isMigrated || isLoading}
                        className={cn(
                          'w-full flex items-center justify-between p-2 rounded-md text-sm text-left transition-colors',
                          isMigrated 
                            ? 'bg-muted/50 text-muted-foreground cursor-not-allowed'
                            : 'hover:bg-muted/50 cursor-pointer'
                        )}
                      >
                        <span className="truncate">{link}</span>
                        {isMigrated ? (
                          <Badge variant="secondary" className="text-xs">Done</Badge>
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Upcoming blocks preview */}
          {!isComplete && pendingBlocks.length > currentBlockIndex + 1 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Coming up next</h4>
                <div className="flex flex-wrap gap-1.5">
                  {pendingBlocks.slice(currentBlockIndex + 1, currentBlockIndex + 5).map((block, i) => (
                    <Badge 
                      key={block.id} 
                      variant="outline" 
                      className={cn('text-xs opacity-60', getBlockLabel(block.type).color)}
                    >
                      {getBlockLabel(block.type).label}
                    </Badge>
                  ))}
                  {pendingBlocks.length > currentBlockIndex + 5 && (
                    <Badge variant="outline" className="text-xs opacity-40">
                      +{pendingBlocks.length - currentBlockIndex - 5} more
                    </Badge>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
