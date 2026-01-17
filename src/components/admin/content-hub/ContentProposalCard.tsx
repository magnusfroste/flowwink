import { formatDistanceToNow, format } from 'date-fns';
import { Calendar, Clock, MoreVertical, CheckCircle2, Sparkles, Trash2 } from 'lucide-react';
import { ContentProposal, ChannelType } from '@/hooks/useContentProposals';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChannelIcon, ALL_CHANNELS } from './ChannelIcon';
import { cn } from '@/lib/utils';

interface ContentProposalCardProps {
  proposal: ContentProposal;
  onSelect: (proposal: ContentProposal) => void;
  onApprove?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  published: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

export function ContentProposalCard({ proposal, onSelect, onApprove, onDelete }: ContentProposalCardProps) {
  const activeChannels = ALL_CHANNELS.filter(
    (channel) => proposal.channel_variants?.[channel as ChannelType]
  );

  const publishedChannels = proposal.published_channels || [];

  return (
    <Card 
      className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
      onClick={() => onSelect(proposal)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={cn('text-xs capitalize', STATUS_STYLES[proposal.status])}>
                {proposal.status.replace('_', ' ')}
              </Badge>
              {proposal.source_research && Object.keys(proposal.source_research).length > 0 && (
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              )}
            </div>
            <h3 className="font-semibold text-base line-clamp-2">{proposal.topic}</h3>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {proposal.status === 'draft' && onApprove && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onApprove(proposal.id); }}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onDelete && (
                <DropdownMenuItem 
                  className="text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(proposal.id); }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {proposal.pillar_content && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {proposal.pillar_content}
          </p>
        )}

        {/* Channel badges */}
        <div className="flex flex-wrap gap-1 mb-3">
          {activeChannels.map((channel) => (
            <div 
              key={channel} 
              className={cn(
                'relative',
                publishedChannels.includes(channel) && 'ring-2 ring-emerald-500 ring-offset-1 rounded-md'
              )}
            >
              <ChannelIcon channel={channel as ChannelType} size="sm" />
            </div>
          ))}
          {activeChannels.length === 0 && (
            <span className="text-xs text-muted-foreground">No channels configured</span>
          )}
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(proposal.created_at), { addSuffix: true })}
          </div>
          {proposal.scheduled_for && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(proposal.scheduled_for), 'MMM d')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
