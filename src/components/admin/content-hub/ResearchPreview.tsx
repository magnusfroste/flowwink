import { useState } from 'react';
import { 
  Lightbulb, 
  Target, 
  TrendingUp, 
  MessageSquare, 
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ContentResearch, ContentAngle } from '@/hooks/useContentResearch';
import { ChannelIcon } from './ChannelIcon';
import { ChannelType } from '@/hooks/useContentProposals';

interface ResearchPreviewProps {
  research: ContentResearch;
  selectedAngle: ContentAngle | null;
  onAngleSelect: (angle: ContentAngle) => void;
  selectedHooks: string[];
  onHookToggle: (hook: string) => void;
}

export function ResearchPreview({ 
  research, 
  selectedAngle, 
  onAngleSelect,
  selectedHooks,
  onHookToggle 
}: ResearchPreviewProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>(['angles', 'hooks']);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const allHooks = [
    ...research.content_hooks.curiosity_hooks.map(h => ({ text: h, type: 'curiosity' })),
    ...research.content_hooks.controversy_hooks.map(h => ({ text: h, type: 'controversy' })),
    ...research.content_hooks.story_hooks.map(h => ({ text: h, type: 'story' })),
    ...research.content_hooks.data_hooks.map(h => ({ text: h, type: 'data' })),
  ];

  return (
    <ScrollArea className="h-[500px] pr-4">
      <div className="space-y-4">
        {/* Topic Analysis Summary */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Core Theme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{research.topic_analysis.main_theme}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {research.topic_analysis.sub_topics.slice(0, 4).map((topic, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {topic}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Content Angles - MAIN SELECTION */}
        <Collapsible 
          open={expandedSections.includes('angles')} 
          onOpenChange={() => toggleSection('angles')}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Content Angles
                    <Badge variant="outline" className="ml-2">
                      {research.content_angles.length} options
                    </Badge>
                  </CardTitle>
                  {expandedSections.includes('angles') ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <CardDescription>Select an angle to guide your content</CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                {research.content_angles.map((angle, index) => (
                  <div
                    key={index}
                    onClick={() => onAngleSelect(angle)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedAngle === angle
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'hover:border-primary/50 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 p-1 rounded-full ${
                        selectedAngle === angle ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                        {selectedAngle === angle ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <span className="h-4 w-4 flex items-center justify-center text-xs font-bold">
                            {index + 1}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{angle.angle}</p>
                        <p className="text-xs text-muted-foreground mt-1">{angle.description}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {angle.best_for_channels.slice(0, 3).map((ch, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <ChannelIcon channel={ch as ChannelType} size="sm" />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          Hook: "{angle.hook_example}"
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Content Hooks */}
        <Collapsible 
          open={expandedSections.includes('hooks')} 
          onOpenChange={() => toggleSection('hooks')}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    Hook Options
                    {selectedHooks.length > 0 && (
                      <Badge className="ml-2">{selectedHooks.length} selected</Badge>
                    )}
                  </CardTitle>
                  {expandedSections.includes('hooks') ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <CardDescription>Select hooks to include in your content</CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-2 pt-0">
                {allHooks.map((hook, index) => (
                  <label
                    key={index}
                    className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedHooks.includes(hook.text) ? 'bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      checked={selectedHooks.includes(hook.text)}
                      onCheckedChange={() => onHookToggle(hook.text)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{hook.text}</p>
                      <Badge variant="outline" className="text-xs mt-1 capitalize">
                        {hook.type}
                      </Badge>
                    </div>
                  </label>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Audience Insights */}
        <Collapsible 
          open={expandedSections.includes('audience')} 
          onOpenChange={() => toggleSection('audience')}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4 text-green-500" />
                    Audience Insights
                  </CardTitle>
                  {expandedSections.includes('audience') ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Pain Points</p>
                  <ul className="text-sm space-y-1">
                    {research.audience_insights.pain_points.slice(0, 3).map((p, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-destructive">•</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Desires</p>
                  <ul className="text-sm space-y-1">
                    {research.audience_insights.desires.slice(0, 3).map((d, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-green-500">•</span> {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Competitive Landscape */}
        <Collapsible 
          open={expandedSections.includes('competitive')} 
          onOpenChange={() => toggleSection('competitive')}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-purple-500" />
                    Differentiation Opportunities
                  </CardTitle>
                  {expandedSections.includes('competitive') ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {research.competitive_landscape.differentiation_opportunities.map((opp, i) => (
                    <div key={i} className="p-2 rounded bg-muted/30 text-sm">
                      {opp}
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* SEO Insights */}
        {research.seo_insights && (
          <Collapsible 
            open={expandedSections.includes('seo')} 
            onOpenChange={() => toggleSection('seo')}
          >
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Search className="h-4 w-4 text-orange-500" />
                      SEO Keywords
                    </CardTitle>
                    {expandedSections.includes('seo') ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1">
                    {research.seo_insights.primary_keywords.map((kw, i) => (
                      <Badge key={i} variant="default" className="text-xs">{kw}</Badge>
                    ))}
                    {research.seo_insights.secondary_keywords.map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
      </div>
    </ScrollArea>
  );
}
