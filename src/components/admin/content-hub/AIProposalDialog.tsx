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
import { ChannelType } from '@/hooks/useContentProposals';
import { useGenerateProposal } from '@/hooks/useGenerateProposal';
import { ChannelIcon, ALL_CHANNELS, getChannelConfig } from './ChannelIcon';

interface AIProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (id: string) => void;
}

export function AIProposalDialog({ open, onOpenChange, onSuccess }: AIProposalDialogProps) {
  const [topic, setTopic] = useState('');
  const [pillarContent, setPillarContent] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<ChannelType[]>(['blog', 'newsletter', 'linkedin']);
  const [brandVoice, setBrandVoice] = useState('professional yet friendly');

  const { generateProposal, isGenerating, progress } = useGenerateProposal();

  const handleGenerate = async () => {
    if (!topic.trim()) return;

    try {
      const result = await generateProposal({
        topic,
        pillar_content: pillarContent || undefined,
        target_channels: selectedChannels,
        brand_voice: brandVoice || undefined,
      });

      if (result.proposal) {
        onOpenChange(false);
        setTopic('');
        setPillarContent('');
        onSuccess?.(result.proposal.id);
      }
    } catch (error) {
      // Error is handled by the hook
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
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            AI Content Campaign Generator
          </DialogTitle>
          <DialogDescription>
            AI will research your topic and generate optimized content for each platform.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="topic">Topic / Campaign Theme *</Label>
            <Input
              id="topic"
              placeholder="e.g., Spring wellness tips for busy professionals"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pillar">Key Points (optional)</Label>
            <Textarea
              id="pillar"
              placeholder="Add specific points, data, or messaging you want included..."
              value={pillarContent}
              onChange={(e) => setPillarContent(e.target.value)}
              rows={3}
              disabled={isGenerating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="voice">Brand Voice</Label>
            <Input
              id="voice"
              placeholder="e.g., professional, friendly, casual, authoritative"
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              disabled={isGenerating}
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
                      disabled={isGenerating}
                    />
                    <ChannelIcon channel={channel as ChannelType} size="sm" />
                    <span className="text-sm font-medium">{config?.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button 
            onClick={handleGenerate}
            disabled={!topic.trim() || selectedChannels.length === 0 || isGenerating}
            className="gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress || 'Generating...'}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate with AI
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
