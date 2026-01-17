import { useState } from 'react';
import { Sparkles, Loader2, Info } from 'lucide-react';
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
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChannelType } from '@/hooks/useContentProposals';
import { useGenerateProposal } from '@/hooks/useGenerateProposal';
import { ChannelIcon, ALL_CHANNELS, getChannelConfig } from './ChannelIcon';

interface AIProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (id: string) => void;
}

const INDUSTRIES = [
  { value: 'saas', label: 'SaaS / Software' },
  { value: 'ecommerce', label: 'E-commerce / Retail' },
  { value: 'health', label: 'Health & Wellness' },
  { value: 'finance', label: 'Finance / Fintech' },
  { value: 'education', label: 'Education / EdTech' },
  { value: 'creative', label: 'Creative / Agency' },
  { value: 'consulting', label: 'Consulting / Services' },
  { value: 'manufacturing', label: 'Manufacturing / Industrial' },
  { value: 'nonprofit', label: 'Nonprofit / NGO' },
  { value: 'other', label: 'Other' },
];

const CONTENT_GOALS = [
  { value: 'awareness', label: 'Brand Awareness' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'leads', label: 'Lead Generation' },
  { value: 'education', label: 'Education' },
  { value: 'conversion', label: 'Conversion / Sales' },
  { value: 'thought_leadership', label: 'Thought Leadership' },
];

const TONE_LABELS = [
  'Very Formal',
  'Professional',
  'Balanced',
  'Conversational',
  'Casual',
];

export function AIProposalDialog({ open, onOpenChange, onSuccess }: AIProposalDialogProps) {
  const [topic, setTopic] = useState('');
  const [pillarContent, setPillarContent] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<ChannelType[]>(['blog', 'newsletter', 'linkedin']);
  const [brandVoice, setBrandVoice] = useState('');
  
  // New fields
  const [targetAudience, setTargetAudience] = useState('');
  const [toneLevel, setToneLevel] = useState([3]); // 1-5, default 3 (balanced)
  const [industry, setIndustry] = useState('');
  const [contentGoals, setContentGoals] = useState<string[]>([]);
  const [uniqueAngle, setUniqueAngle] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { generateProposal, isGenerating, progress } = useGenerateProposal();

  const handleGenerate = async () => {
    if (!topic.trim()) return;

    try {
      const result = await generateProposal({
        topic,
        pillar_content: pillarContent || undefined,
        target_channels: selectedChannels,
        brand_voice: brandVoice || undefined,
        target_audience: targetAudience || undefined,
        tone_level: toneLevel[0],
        industry: industry || undefined,
        content_goals: contentGoals.length > 0 ? contentGoals : undefined,
        unique_angle: uniqueAngle || undefined,
      });

      if (result.proposal) {
        onOpenChange(false);
        resetForm();
        onSuccess?.(result.proposal.id);
      }
    } catch (error) {
      // Error is handled by the hook
    }
  };

  const resetForm = () => {
    setTopic('');
    setPillarContent('');
    setTargetAudience('');
    setToneLevel([3]);
    setIndustry('');
    setContentGoals([]);
    setUniqueAngle('');
  };

  const toggleChannel = (channel: ChannelType) => {
    setSelectedChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel]
    );
  };

  const toggleGoal = (goal: string) => {
    setContentGoals((prev) =>
      prev.includes(goal)
        ? prev.filter((g) => g !== goal)
        : [...prev, goal]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            AI Content Campaign Generator
          </DialogTitle>
          <DialogDescription>
            Generate optimized, publication-ready content for each platform with enhanced AI prompts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Topic - Required */}
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

          {/* Target Audience */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="audience">Target Audience</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p>Describe who this content is for. Be specific about demographics, job titles, pain points, or interests.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="audience"
              placeholder="e.g., B2B marketing managers at mid-size companies, aged 30-45"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          {/* Tone Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Tone</Label>
              <span className="text-sm text-muted-foreground">
                {TONE_LABELS[toneLevel[0] - 1]}
              </span>
            </div>
            <Slider
              value={toneLevel}
              onValueChange={setToneLevel}
              min={1}
              max={5}
              step={1}
              disabled={isGenerating}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Formal</span>
              <span>Casual</span>
            </div>
          </div>

          {/* Key Points */}
          <div className="space-y-2">
            <Label htmlFor="pillar">Key Points & Research (optional)</Label>
            <Textarea
              id="pillar"
              placeholder="Add specific points, data, statistics, or messaging you want included..."
              value={pillarContent}
              onChange={(e) => setPillarContent(e.target.value)}
              rows={3}
              disabled={isGenerating}
            />
          </div>

          {/* Target Channels */}
          <div className="space-y-2">
            <Label>Target Channels *</Label>
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

          {/* Advanced Options Toggle */}
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </Button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="space-y-4 border-t pt-4">
              {/* Industry */}
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select value={industry} onValueChange={setIndustry} disabled={isGenerating}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind.value} value={ind.value}>
                        {ind.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Content Goals */}
              <div className="space-y-2">
                <Label>Content Goals</Label>
                <div className="flex flex-wrap gap-2">
                  {CONTENT_GOALS.map((goal) => (
                    <label
                      key={goal.value}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                        contentGoals.includes(goal.value)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={contentGoals.includes(goal.value)}
                        onCheckedChange={() => toggleGoal(goal.value)}
                        disabled={isGenerating}
                        className="sr-only"
                      />
                      <span className="text-sm">{goal.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Brand Voice */}
              <div className="space-y-2">
                <Label htmlFor="voice">Brand Voice Description</Label>
                <Input
                  id="voice"
                  placeholder="e.g., Authoritative but approachable, uses humor, avoids jargon"
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              {/* Unique Angle */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="angle">Unique Angle / Differentiation</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p>What makes your perspective or offering unique? This helps the AI create more differentiated content.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea
                  id="angle"
                  placeholder="e.g., We're the only platform that combines AI with human coaching..."
                  value={uniqueAngle}
                  onChange={(e) => setUniqueAngle(e.target.value)}
                  rows={2}
                  disabled={isGenerating}
                />
              </div>
            </div>
          )}
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
