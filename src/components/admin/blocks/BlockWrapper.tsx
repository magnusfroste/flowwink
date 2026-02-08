import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Settings, Copy, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContentBlock, ContentBlockType, BlockSpacing, BlockAnimation } from '@/types/cms';
import { cn } from '@/lib/utils';
import { BlockSpacingControl, getSpacingClasses } from './BlockSpacingControl';
import { BlockAnimationControl } from './BlockAnimationControl';
import { BlockAnchorControl } from './BlockAnchorControl';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const BLOCK_LABELS: Record<ContentBlockType, string> = {
  hero: 'Hero',
  text: 'Text',
  image: 'Image',
  cta: 'Call-to-Action',
  contact: 'Contact',
  'link-grid': 'Link Grid',
  'two-column': 'Two Column',
  'info-box': 'Fact Box',
  accordion: 'Accordion/FAQ',
  'article-grid': 'Article Grid',
  youtube: 'YouTube',
  quote: 'Quote',
  separator: 'Separator',
  gallery: 'Gallery',
  stats: 'Statistics',
  chat: 'AI Chat',
  map: 'Map',
  form: 'Form',
  newsletter: 'Newsletter',
  popup: 'Popup',
  booking: 'Booking',
  'smart-booking': 'Smart Booking',
  pricing: 'Pricing',
  testimonials: 'Testimonials',
  team: 'Team',
  logos: 'Logo Cloud',
  comparison: 'Comparison',
  features: 'Features',
  timeline: 'Timeline',
  footer: 'Footer',
  header: 'Header',
  products: 'Products',
  cart: 'Cart',
  'kb-featured': 'KB Featured',
  'kb-hub': 'Knowledge Base',
  'kb-search': 'KB Search',
  'kb-accordion': 'KB Accordion',
  'announcement-bar': 'Announcement Bar',
  tabs: 'Tabs',
  marquee: 'Marquee',
  embed: 'Embed',
  lottie: 'Lottie Animation',
  table: 'Table',
  countdown: 'Countdown',
  progress: 'Progress',
  badge: 'Badge',
  'social-proof': 'Social Proof',
  'notification-toast': 'Notification Toast',
  'floating-cta': 'Floating CTA',
  'chat-launcher': 'Chat Launcher',
};

interface BlockWrapperProps {
  block: ContentBlock;
  children: React.ReactNode;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCopy?: () => void;
  onSpacingChange?: (spacing: BlockSpacing) => void;
  onAnimationChange?: (animation: BlockAnimation) => void;
  onAnchorChange?: (anchorId: string | undefined) => void;
  onToggleHidden?: (hidden: boolean) => void;
  canEdit: boolean;
}

export function BlockWrapper({
  block,
  children,
  isEditing,
  onEdit,
  onDelete,
  onCopy,
  onSpacingChange,
  onAnimationChange,
  onAnchorChange,
  onToggleHidden,
  canEdit,
}: BlockWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const spacingClasses = getSpacingClasses(block.spacing);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group rounded-lg border-2 transition-all',
        isDragging ? 'opacity-50 border-primary shadow-lg z-50' : 'border-transparent',
        isEditing ? 'border-primary bg-primary/5' : 'hover:border-border',
        block.hidden && 'opacity-40',
        !canEdit && 'pointer-events-none'
      )}
    >
      {/* Block Controls */}
      {canEdit && (
        <div
          className={cn(
            'absolute -top-3 left-4 flex items-center gap-1 opacity-0 transition-opacity z-10',
            'group-hover:opacity-100',
            isEditing && 'opacity-100'
          )}
        >
          <div
            {...attributes}
            {...listeners}
            className="flex items-center gap-1 px-2 py-1 bg-card border rounded-md shadow-sm cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {BLOCK_LABELS[block.type]}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 bg-card"
                onClick={onEdit}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          {onCopy && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 bg-card"
                  onClick={onCopy}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy block</TooltipContent>
            </Tooltip>
          )}
          {onSpacingChange && (
            <BlockSpacingControl
              spacing={block.spacing}
              onChange={onSpacingChange}
            />
          )}
          {onAnimationChange && (
            <BlockAnimationControl
              animation={block.animation}
              onChange={onAnimationChange}
            />
          )}
          {onAnchorChange && (
            <BlockAnchorControl
              anchorId={block.anchorId}
              onChange={onAnchorChange}
            />
          )}
          {onToggleHidden && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn('h-7 w-7 bg-card', block.hidden && 'text-warning border-warning/50')}
                  onClick={() => onToggleHidden(!block.hidden)}
                >
                  {block.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{block.hidden ? 'Show block' : 'Hide block'}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 bg-card hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Hidden indicator */}
      {block.hidden && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 bg-warning/10 border border-warning/30 rounded text-warning text-xs font-medium">
          <EyeOff className="h-3 w-3" />
          Hidden
        </div>
      )}

      {/* Block Content with spacing applied */}
      <div className={cn('p-2', spacingClasses)}>{children}</div>
    </div>
  );
}
