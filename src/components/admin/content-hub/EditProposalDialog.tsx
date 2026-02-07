import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
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
import { useUpdateProposal, ContentProposal, ChannelType } from '@/hooks/useContentProposals';
import { ChannelIcon, ALL_CHANNELS, getChannelConfig, INTERNAL_CHANNELS } from './ChannelIcon';
import { FeaturedImagePicker } from './FeaturedImagePicker';
import { useModules } from '@/hooks/useModules';
import { cn } from '@/lib/utils';

interface EditProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: ContentProposal | null;
  onSuccess?: () => void;
}

export function EditProposalDialog({ open, onOpenChange, proposal, onSuccess }: EditProposalDialogProps) {
  const [topic, setTopic] = useState('');
  const [pillarContent, setPillarContent] = useState('');
  const [featuredImage, setFeaturedImage] = useState<string | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<ChannelType[]>([]);

  const updateProposal = useUpdateProposal();
  const { data: modules } = useModules();

  // Initialize form when proposal changes
  useEffect(() => {
    if (proposal) {
      setTopic(proposal.topic);
      setPillarContent(proposal.pillar_content || '');
      setFeaturedImage(proposal.featured_image);
      setSelectedChannels(
        ALL_CHANNELS.filter((channel) => proposal.channel_variants?.[channel as ChannelType])
      );
    }
  }, [proposal]);

  // Determine which channels are available based on module status
  const channelAvailability = (() => {
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
  })();

  const handleUpdate = async () => {
    if (!proposal || !topic.trim()) return;

    // Filter out unavailable channels
    const validChannels = selectedChannels.filter(
      (ch) => channelAvailability[ch]?.available
    );

    // Update channel_variants to only include selected channels
    const channel_variants: Record<string, unknown> = {};
    validChannels.forEach((channel) => {
      if (proposal.channel_variants?.[channel as ChannelType]) {
        channel_variants[channel] = proposal.channel_variants[channel as ChannelType];
      }
    });

    await updateProposal.mutateAsync({
      id: proposal.id,
      topic,
      pillar_content: pillarContent,
      featured_image: featuredImage,
      channel_variants,
    });

    onSuccess?.();
    onOpenChange(false);
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Content Campaign</DialogTitle>
          <DialogDescription>
            Update your multi-channel content proposal.
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpdate}
            disabled={!topic.trim() || updateProposal.isPending}
          >
            {updateProposal.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Campaign'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
