import { useState } from 'react';
import { Check, X, RefreshCw, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { CopilotBlock } from '@/hooks/useCopilot';
import { BLOCK_REFERENCE } from '@/lib/block-reference';

interface CopilotArtifactProps {
  block: CopilotBlock;
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: (feedback?: string) => void;
  deviceMode: 'desktop' | 'tablet' | 'mobile';
  isApproved?: boolean;
}

export function CopilotArtifact({
  block,
  onApprove,
  onReject,
  onRegenerate,
  deviceMode,
  isApproved = false,
}: CopilotArtifactProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const blockInfo = BLOCK_REFERENCE.find(b => b.type === block.type);
  const blockName = blockInfo?.name || block.type;

  const handleRegenerate = () => {
    onRegenerate(feedback || undefined);
    setFeedback('');
    setShowFeedback(false);
  };

  // Generate preview content based on block type
  const previewContent = generatePreview(block);

  return (
    <Card className={cn(
      'transition-all',
      isApproved && 'border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20'
    )}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={isApproved ? 'default' : 'secondary'}>
                {blockName}
              </Badge>
              {isApproved && (
                <Badge variant="outline" className="text-green-600 border-green-200">
                  <Check className="h-3 w-3 mr-1" />
                  Godkänt
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1">
              {!isApproved && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={onApprove}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={onReject}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setShowFeedback(!showFeedback)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </>
              )}

              <CollapsibleTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>

          {/* Feedback input */}
          {showFeedback && !isApproved && (
            <div className="flex gap-2 mt-3">
              <Input
                placeholder="Beskriv vad du vill ändra..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="text-sm h-8"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRegenerate();
                  }
                }}
              />
              <Button size="sm" onClick={handleRegenerate}>
                Regenerera
              </Button>
            </div>
          )}
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            {/* Preview container */}
            <div
              className={cn(
                'rounded-lg border bg-background overflow-hidden transition-all',
                deviceMode === 'mobile' && 'max-w-[320px] mx-auto',
                deviceMode === 'tablet' && 'max-w-[768px] mx-auto'
              )}
            >
              <div className="p-4">
                {previewContent}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function generatePreview(block: CopilotBlock): React.ReactNode {
  const { type, data } = block;

  switch (type) {
    case 'hero':
      return (
        <div className="text-center py-8 px-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg">
          <h2 className="text-2xl font-bold mb-2">
            {(data.title as string) || 'Hero Title'}
          </h2>
          {data.subtitle && (
            <p className="text-muted-foreground mb-4">{data.subtitle as string}</p>
          )}
          {data.primaryButton && (
            <Button>
              {(data.primaryButton as { text?: string })?.text || 'Call to Action'}
            </Button>
          )}
        </div>
      );

    case 'features':
      const features = (data.features as Array<{ title?: string; description?: string }>) || [];
      return (
        <div className="space-y-4">
          {data.title && (
            <h3 className="text-lg font-semibold text-center">{data.title as string}</h3>
          )}
          <div className="grid grid-cols-2 gap-3">
            {features.slice(0, 4).map((feature, i) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-primary/10 mb-2" />
                <p className="font-medium text-sm">{feature.title || `Feature ${i + 1}`}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {feature.description || 'Description'}
                </p>
              </div>
            ))}
          </div>
        </div>
      );

    case 'cta':
      return (
        <div className="text-center py-6 px-4 bg-primary/10 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">
            {(data.title as string) || 'Ready to get started?'}
          </h3>
          {data.subtitle && (
            <p className="text-sm text-muted-foreground mb-3">{data.subtitle as string}</p>
          )}
          <Button>
            {(data.buttonText as string) || 'Get Started'}
          </Button>
        </div>
      );

    case 'testimonials':
      const testimonials = (data.testimonials as Array<{ content?: string; author?: string }>) || [];
      return (
        <div className="space-y-3">
          {data.title && (
            <h3 className="text-lg font-semibold text-center">{data.title as string}</h3>
          )}
          {testimonials.slice(0, 2).map((t, i) => (
            <div key={i} className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm italic mb-2">"{t.content || 'Great service!'}"</p>
              <p className="text-xs font-medium">{t.author || 'Customer'}</p>
            </div>
          ))}
        </div>
      );

    case 'stats':
      const stats = (data.stats as Array<{ value?: string; label?: string }>) || [];
      return (
        <div className="grid grid-cols-3 gap-2 text-center">
          {stats.slice(0, 3).map((stat, i) => (
            <div key={i} className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xl font-bold text-primary">{stat.value || '100+'}</p>
              <p className="text-xs text-muted-foreground">{stat.label || 'Label'}</p>
            </div>
          ))}
        </div>
      );

    case 'contact':
    case 'form':
      return (
        <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
          <h3 className="font-semibold">{(data.title as string) || 'Contact Us'}</h3>
          <div className="space-y-2">
            <div className="h-9 bg-background rounded border" />
            <div className="h-9 bg-background rounded border" />
            <div className="h-20 bg-background rounded border" />
          </div>
          <Button className="w-full">{(data.submitButtonText as string) || 'Send'}</Button>
        </div>
      );

    case 'text':
      return (
        <div className="prose prose-sm max-w-none">
          <p className="text-muted-foreground">
            {typeof data.content === 'string' ? data.content : 'Rich text content...'}
          </p>
        </div>
      );

    case 'booking':
      return (
        <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
          <h3 className="font-semibold">{(data.title as string) || 'Book Appointment'}</h3>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="aspect-square bg-background rounded border flex items-center justify-center text-xs">
                {i + 1}
              </div>
            ))}
          </div>
          <Button className="w-full">{(data.submitButtonText as string) || 'Book'}</Button>
        </div>
      );

    default:
      return (
        <div className="p-4 bg-muted/50 rounded-lg text-center">
          <Badge variant="outline">{type}</Badge>
          <p className="text-sm text-muted-foreground mt-2">
            Block preview
          </p>
        </div>
      );
  }
}
