import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
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
import { useCreateProposal, ChannelType } from '@/hooks/useContentProposals';
import { ChannelIcon, ALL_CHANNELS, getChannelConfig } from './ChannelIcon';

interface CreateProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (id: string) => void;
}

export function CreateProposalDialog({ open, onOpenChange, onSuccess }: CreateProposalDialogProps) {
  const [topic, setTopic] = useState('');
  const [pillarContent, setPillarContent] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<ChannelType[]>(['blog', 'newsletter', 'linkedin']);
  const [useAI, setUseAI] = useState(true);

  const createProposal = useCreateProposal();

  const handleCreate = async () => {
    if (!topic.trim()) return;

    // Create basic channel variants structure
    const channel_variants: Record<string, unknown> = {};
    selectedChannels.forEach((channel) => {
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
      channel_variants,
    });

    if (result) {
      onOpenChange(false);
      setTopic('');
      setPillarContent('');
      onSuccess?.(result.id);
    }
  };

  const toggleChannel = (channel: ChannelType) => {
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

          <div className="space-y-2">
            <Label>Target Channels</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_CHANNELS.map((channel) => {
                const config = getChannelConfig(channel as ChannelType);
                return (
                  <label
                    key={channel}
                    className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedChannels.includes(channel as ChannelType)}
                      onCheckedChange={() => toggleChannel(channel as ChannelType)}
                    />
                    <ChannelIcon channel={channel as ChannelType} size="sm" />
                    <span className="text-sm font-medium">{config?.label}</span>
                  </label>
                );
              })}
            </div>
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
