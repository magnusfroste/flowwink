import { useState } from 'react';
import { format } from 'date-fns';
import { 
  CheckCircle2, 
  RefreshCw, 
  X, 
  Calendar, 
  Clock,
  Sparkles,
  Edit,
  Send,
  Rocket,
  ExternalLink,
  Image
} from 'lucide-react';
import { ContentProposal, ChannelType, useApproveProposal, getChannelImage } from '@/hooks/useContentProposals';
import { usePublishProposalChannel, usePublishAllChannels } from '@/hooks/usePublishProposal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChannelIcon, ALL_CHANNELS, getChannelConfig } from './ChannelIcon';
import { ChannelMockup } from './ChannelMockup';
import { ChannelImageOverride } from './FeaturedImagePicker';
import { cn } from '@/lib/utils';

interface ContentProposalPreviewProps {
  proposal: ContentProposal;
  onClose: () => void;
  onRegenerate?: (channel: ChannelType) => void;
}

export function ContentProposalPreview({ proposal, onClose, onRegenerate }: ContentProposalPreviewProps) {
  const [activeChannel, setActiveChannel] = useState<ChannelType>('blog');
  const approveProposal = useApproveProposal();
  const publishChannel = usePublishProposalChannel();
  const publishAll = usePublishAllChannels();

  const activeChannels = ALL_CHANNELS.filter(
    (channel) => proposal.channel_variants?.[channel as ChannelType]
  );

  const unpublishedChannels = activeChannels.filter(
    (channel) => !proposal.published_channels?.includes(channel)
  );

  const handleApprove = async () => {
    await approveProposal.mutateAsync(proposal.id);
  };

  const handlePublishChannel = async (channel: ChannelType) => {
    await publishChannel.mutateAsync({ proposal, channel });
  };

  const handlePublishAll = async () => {
    await publishAll.mutateAsync(proposal);
  };

  const isPublishing = publishChannel.isPending || publishAll.isPending;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="capitalize">
                {proposal.status.replace('_', ' ')}
              </Badge>
              {proposal.source_research && Object.keys(proposal.source_research).length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI Research
                </Badge>
              )}
            </div>
            <h2 className="text-xl font-bold truncate">{proposal.topic}</h2>
            
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Created {format(new Date(proposal.created_at), 'MMM d, yyyy')}
              </div>
              {proposal.scheduled_for && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Scheduled {format(new Date(proposal.scheduled_for), 'MMM d')}
                </div>
              )}
            </div>
          </div>
          
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {proposal.status === 'draft' && (
            <Button 
              onClick={handleApprove}
              disabled={approveProposal.isPending}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve Proposal
            </Button>
          )}
          {proposal.status === 'approved' && unpublishedChannels.length > 0 && (
            <Button 
              onClick={handlePublishAll}
              disabled={isPublishing}
              className="gap-2"
            >
              <Rocket className="h-4 w-4" />
              Publish All ({unpublishedChannels.length})
            </Button>
          )}
          <Button variant="outline" className="gap-2">
            <Edit className="h-4 w-4" />
            Edit Content
          </Button>
        </div>

        {/* Published channels summary */}
        {proposal.published_channels && proposal.published_channels.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Published to:</span>
            <div className="flex items-center gap-1">
              {proposal.published_channels.map((channel) => (
                <Badge key={channel} variant="secondary" className="gap-1 text-xs">
                  <ChannelIcon channel={channel as ChannelType} size="sm" />
                  {getChannelConfig(channel as ChannelType)?.label}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Featured Image */}
      {proposal.featured_image && (
        <div className="flex-shrink-0 border-b p-4 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Image className="h-4 w-4" />
              Featured Image
            </h3>
            <span className="text-xs text-muted-foreground">
              Inherited by {activeChannels.length} channel{activeChannels.length !== 1 ? 's' : ''}
            </span>
          </div>
          <img
            src={proposal.featured_image}
            alt="Featured"
            className="w-full max-h-32 object-cover rounded-lg"
          />
        </div>
      )}

      {/* Pillar content */}
      {proposal.pillar_content && (
        <div className="flex-shrink-0 border-b p-4 bg-muted/30">
          <h3 className="text-sm font-medium mb-2">Pillar Content</h3>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {proposal.pillar_content}
          </p>
        </div>
      )}

      {/* Channel tabs */}
      <Tabs 
        value={activeChannel} 
        onValueChange={(v) => setActiveChannel(v as ChannelType)}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="flex-shrink-0 border-b px-4">
          <TabsList className="h-auto bg-transparent p-0 gap-1">
            {ALL_CHANNELS.map((channel) => {
              const hasContent = !!proposal.channel_variants?.[channel as ChannelType];
              const isPublished = proposal.published_channels?.includes(channel);
              const config = getChannelConfig(channel as ChannelType);
              
              return (
                <TabsTrigger
                  key={channel}
                  value={channel}
                  disabled={!hasContent}
                  className={cn(
                    'relative px-3 py-2 gap-2 data-[state=active]:bg-muted rounded-t-lg rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary',
                    !hasContent && 'opacity-40'
                  )}
                >
                  <ChannelIcon channel={channel as ChannelType} size="sm" />
                  <span className="hidden sm:inline text-sm">{config?.label}</span>
                  {isPublished && (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 absolute -top-1 -right-1" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6">
            {ALL_CHANNELS.map((channel) => {
              const isPublished = proposal.published_channels?.includes(channel);
              const channelConfig = getChannelConfig(channel as ChannelType);
              
              return (
                <TabsContent key={channel} value={channel} className="m-0">
                  <div className="max-w-2xl mx-auto">
                    {/* Channel actions */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">
                          {channelConfig?.label} Preview
                        </h3>
                        {isPublished && (
                          <Badge variant="outline" className="gap-1 text-xs text-emerald-600 border-emerald-200 bg-emerald-50">
                            <CheckCircle2 className="h-3 w-3" />
                            Published
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {onRegenerate && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-1"
                            onClick={() => onRegenerate(channel as ChannelType)}
                            disabled={isPublishing}
                          >
                            <RefreshCw className="h-3 w-3" />
                            Regenerate
                          </Button>
                        )}
                        {proposal.status === 'approved' && !isPublished && (
                          <Button 
                            size="sm" 
                            className="gap-1"
                            onClick={() => handlePublishChannel(channel as ChannelType)}
                            disabled={isPublishing}
                          >
                            <Send className="h-3 w-3" />
                            {channel === 'blog' 
                              ? 'Publish'
                              : channel === 'newsletter'
                              ? 'Create Draft'
                              : 'Send via Webhook'}
                          </Button>
                        )}
                        {isPublished && (channel === 'blog' || channel === 'newsletter') && (
                          <Button 
                            variant="outline"
                            size="sm" 
                            className="gap-1"
                            asChild
                          >
                            <a href={channel === 'blog' ? '/admin/blog' : '/admin/newsletter'}>
                              <ExternalLink className="h-3 w-3" />
                              View in {channelConfig?.label}
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Channel mockup */}
                    <ChannelMockup 
                      channel={channel as ChannelType} 
                      variant={proposal.channel_variants?.[channel as ChannelType]}
                      imageUrl={getChannelImage(proposal, channel as ChannelType)}
                    />
                  </div>
                </TabsContent>
              );
            })}
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
