import { useState, useMemo } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCreateProposal, ChannelType } from '@/hooks/useContentProposals';
import { ChannelIcon, ALL_CHANNELS, getChannelConfig, INTERNAL_CHANNELS } from './ChannelIcon';
import { FeaturedImagePicker } from './FeaturedImagePicker';
import { useModules } from '@/hooks/useModules';
import { cn } from '@/lib/utils';

interface CreateProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (id: string) => void;
}

export function CreateProposalDialog({ open, onOpenChange, onSuccess }: CreateProposalDialogProps) {
  const [topic, setTopic] = useState('');
  const [pillarContent, setPillarContent] = useState('');
  const [featuredImage, setFeaturedImage] = useState<string | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<ChannelType[]>(['blog', 'newsletter', 'linkedin']);
  const [useAI, setUseAI] = useState(true);

  const createProposal = useCreateProposal();
  const { data: modules } = useModules();

  // Determine which channels are available based on module status
  const channelAvailability = useMemo(() => {
    const availability: Record<ChannelType, { available: boolean; hint?: string }> = {} as any;
    
    ALL_CHANNELS.forEach((channel) => {
      const config = getChannelConfig(channel);
      if (!config) {
        availability[channel] = { available: true };
        return;
      }
      
      // External channels are always available
      if (!config.moduleId) {
        availability[channel] = { available: true };
        return;
      }
      
      // Check if the required module is enabled
      const isEnabled = modules?.[config.moduleId]?.enabled ?? false;
      availability[channel] = {
        available: isEnabled,
        hint: isEnabled ? undefined : config.disabledHint,
      };
    });
    
    return availability;
  }, [modules]);

  // Count available internal channels
  const availableInternalCount = INTERNAL_CHANNELS.filter(
    (ch) => channelAvailability[ch]?.available
  ).length;

  const handleCreate = async () => {
    if (!topic.trim()) return;

    // Filter out unavailable channels
    const validChannels = selectedChannels.filter(
      (ch) => channelAvailability[ch]?.available
    );

    // Create basic channel variants structure
    const channel_variants: Record<string, unknown> = {};
    validChannels.forEach((channel) => {
      switch (channel) {
        case 'blog':
          channel_variants.blog = {
            title: topic,
            excerpt: pillarContent?.slice(0, 160) || '',
            body: pillarContent || '',
            seo_keywords: [],
          };
          break;
        case 'newsletter':
          channel_variants.newsletter = {
            subject: topic,
            preview_text: pillarContent?.slice(0, 100) || '',
            blocks: [],
          };
          break;
        case 'linkedin':
          channel_variants.linkedin = {
            text: pillarContent || topic,
            hashtags: [],
          };
          break;
        case 'instagram':
          channel_variants.instagram = {
            caption: pillarContent || topic,
            hashtags: [],
            suggested_image_prompt: `Image for: ${topic}`,
          };
          break;
        case 'twitter':
          channel_variants.twitter = {
            thread: [pillarContent?.slice(0, 280) || topic],
          };
          break;
        case 'facebook':
          channel_variants.facebook = {
            text: pillarContent || topic,
          };
          break;
        case 'print':
          channel_variants.print = {
            format: 'A4',
            content: pillarContent || topic,
          };
          break;
      }
    });

    const result = await createProposal.mutateAsync({
      topic,
      pillar_content: pillarContent,
      featured_image: featuredImage,
      channel_variants,
    });

    if (result) {
      onOpenChange(false);
      setTopic('');
      setPillarContent('');
      setFeaturedImage(null);
      onSuccess?.(result.id);
    }
  };

  const toggleChannel = (channel: ChannelType) => {
    // Don't allow selecting unavailable channels
    if (!channelAvailability[channel]?.available) return;
    
    setSelectedChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Content Campaign</DialogTitle>
          <DialogDescription>
            Create a new multi-channel content proposal. AI can help generate variations for each platform.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="topic">Topic / Campaign Name</Label>
            <Input
              id="topic"
              placeholder="e.g., Spring wellness tips for busy professionals"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pillar">Pillar Content (optional)</Label>
            <Textarea
              id="pillar"
              placeholder="Main content or idea that will be adapted for each channel..."
              value={pillarContent}
              onChange={(e) => setPillarContent(e.target.value)}
              rows={4}
            />
          </div>

          {/* Featured Image */}
          <FeaturedImagePicker
            value={featuredImage}
            onChange={setFeaturedImage}
            inheritedChannelCount={selectedChannels.length}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Target Channels</Label>
              {availableInternalCount < INTERNAL_CHANNELS.length && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Some channels require module activation
                </span>
              )}
            </div>
            <TooltipProvider>
              <div className="grid grid-cols-2 gap-2">
                {ALL_CHANNELS.map((channel) => {
                  const config = getChannelConfig(channel);
                  const { available, hint } = channelAvailability[channel] || { available: true };
                  const isSelected = selectedChannels.includes(channel);
                  
                  const channelItem = (
                    <label
                      key={channel}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                        available 
                          ? 'cursor-pointer hover:bg-muted/50' 
                          : 'cursor-not-allowed opacity-60 bg-muted/30',
                        isSelected && available && 'ring-2 ring-primary/20 border-primary/50'
                      )}
                    >
                      <Checkbox
                        checked={isSelected && available}
                        onCheckedChange={() => toggleChannel(channel)}
                        disabled={!available}
                      />
                      <ChannelIcon channel={channel} size="sm" disabled={!available} />
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          'text-sm font-medium',
                          !available && 'text-muted-foreground'
                        )}>
                          {config?.label}
                        </span>
                        {!available && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            Module disabled
                          </p>
                        )}
                      </div>
                    </label>
                  );
                  
                  // Wrap unavailable channels with tooltip
                  if (!available && hint) {
                    return (
                      <Tooltip key={channel}>
                        <TooltipTrigger asChild>
                          {channelItem}
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px]">
                          <p className="text-xs">{hint}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  
                  return channelItem;
                })}
              </div>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
            <Checkbox
              id="use-ai"
              checked={useAI}
              onCheckedChange={(checked) => setUseAI(checked as boolean)}
            />
            <div className="flex-1">
              <label htmlFor="use-ai" className="flex items-center gap-2 font-medium cursor-pointer">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Use AI to generate content
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI will adapt your content for each platform automatically
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate}
            disabled={!topic.trim() || createProposal.isPending}
          >
            {createProposal.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Campaign'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
