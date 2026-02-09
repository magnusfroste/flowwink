import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Plus, 
  Layout, 
  Type, 
  ImageIcon, 
  MousePointerClick, 
  Phone, 
  Grid3X3, 
  Columns, 
  AlertCircle, 
  HelpCircle, 
  Newspaper, 
  Youtube, 
  Quote, 
  Minus, 
  Images, 
  BarChart3,
  MessageSquare,
  MapPin,
  FileText,
  Mail,
  Megaphone,
  CalendarCheck,
  CreditCard,
  MessageSquareQuote,
  Users,
  Building2,
  TableProperties,
  Sparkles,
  GitBranch,
  ShoppingBag,
  ShoppingCart,
  Bell,
  Layers,
  MoveHorizontal,
  Code2,
  Table2,
  Timer,
  TrendingUp,
  BadgeCheck,
  ThumbsUp,
  BellRing,
  PanelBottom,
  Video,
  Wand2,
  Search,
  Clipboard,
  AlertTriangle,
} from 'lucide-react';
import { ContentBlockType } from '@/types/cms';
import { useAllBlockModuleStatus } from '@/hooks/useBlockModuleStatus';

interface BlockOption {
  type: ContentBlockType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

interface BlockGroup {
  name: string;
  blocks: BlockOption[];
}

const BLOCK_GROUPS: BlockGroup[] = [
  {
    name: 'Text & Media',
    blocks: [
      {
        type: 'text',
        label: 'Text',
        icon: <Type className="h-5 w-5" />,
        description: 'Rich text content with formatting',
      },
      {
        type: 'image',
        label: 'Image',
        icon: <ImageIcon className="h-5 w-5" />,
        description: 'Image with caption',
      },
      {
        type: 'gallery',
        label: 'Gallery',
        icon: <Images className="h-5 w-5" />,
        description: 'Image gallery with lightbox',
      },
      {
        type: 'youtube',
        label: 'YouTube',
        icon: <Youtube className="h-5 w-5" />,
        description: 'Embedded YouTube video',
      },
      {
        type: 'embed',
        label: 'Embed',
        icon: <Code2 className="h-5 w-5" />,
        description: 'Vimeo, Spotify, SoundCloud, etc.',
      },
      {
        type: 'lottie',
        label: 'Lottie',
        icon: <Wand2 className="h-5 w-5" />,
        description: 'Lightweight vector animations',
      },
      {
        type: 'quote',
        label: 'Quote',
        icon: <Quote className="h-5 w-5" />,
        description: 'Featured quote with author',
      },
    ],
  },
  {
    name: 'Layout',
    blocks: [
      {
        type: 'hero',
        label: 'Hero',
        icon: <Layout className="h-5 w-5" />,
        description: 'Large heading with image/video background',
      },
      {
        type: 'two-column',
        label: 'Two Column',
        icon: <Columns className="h-5 w-5" />,
        description: 'Text and image side by side',
      },
      {
        type: 'separator',
        label: 'Separator',
        icon: <Minus className="h-5 w-5" />,
        description: 'Visual break between sections',
      },
      {
        type: 'tabs',
        label: 'Tabs',
        icon: <Layers className="h-5 w-5" />,
        description: 'Organize content in tabbed sections',
      },
      {
        type: 'table',
        label: 'Table',
        icon: <Table2 className="h-5 w-5" />,
        description: 'Structured data in responsive table',
      },
    ],
  },
  {
    name: 'Navigation & Links',
    blocks: [
      {
        type: 'link-grid',
        label: 'Link Grid',
        icon: <Grid3X3 className="h-5 w-5" />,
        description: 'Grid of quick links',
      },
      {
        type: 'article-grid',
        label: 'Article Grid',
        icon: <Newspaper className="h-5 w-5" />,
        description: 'Grid of article cards',
      },
    ],
  },
  {
    name: 'Information',
    blocks: [
      {
        type: 'info-box',
        label: 'Fact Box',
        icon: <AlertCircle className="h-5 w-5" />,
        description: 'Highlighted information box',
      },
      {
        type: 'accordion',
        label: 'Accordion/FAQ',
        icon: <HelpCircle className="h-5 w-5" />,
        description: 'Expandable questions and answers',
      },
      {
        type: 'stats',
        label: 'Statistics',
        icon: <BarChart3 className="h-5 w-5" />,
        description: 'Display key figures visually',
      },
      {
        type: 'testimonials',
        label: 'Testimonials',
        icon: <MessageSquareQuote className="h-5 w-5" />,
        description: 'Customer reviews with ratings',
      },
      {
        type: 'team',
        label: 'Team',
        icon: <Users className="h-5 w-5" />,
        description: 'Staff profiles with roles and social links',
      },
      {
        type: 'logos',
        label: 'Logo Cloud',
        icon: <Building2 className="h-5 w-5" />,
        description: 'Partner or client logos in grid or carousel',
      },
      {
        type: 'comparison',
        label: 'Comparison',
        icon: <TableProperties className="h-5 w-5" />,
        description: 'Feature comparison table for plans',
      },
      {
        type: 'features',
        label: 'Features',
        icon: <Sparkles className="h-5 w-5" />,
        description: 'Services or features with icons',
      },
      {
        type: 'timeline',
        label: 'Timeline',
        icon: <GitBranch className="h-5 w-5" />,
        description: 'Steps or milestones with connecting lines',
      },
      {
        type: 'map',
        label: 'Map',
        icon: <MapPin className="h-5 w-5" />,
        description: 'Google Maps location for clinic',
      },
      {
        type: 'announcement-bar',
        label: 'Announcement',
        icon: <Bell className="h-5 w-5" />,
        description: 'Sticky banner with countdown timer',
      },
      {
        type: 'countdown',
        label: 'Countdown',
        icon: <Timer className="h-5 w-5" />,
        description: 'Countdown timer for events or campaigns',
      },
      {
        type: 'progress',
        label: 'Progress',
        icon: <TrendingUp className="h-5 w-5" />,
        description: 'Animated progress bars and milestones',
      },
      {
        type: 'badge',
        label: 'Badges',
        icon: <BadgeCheck className="h-5 w-5" />,
        description: 'Certifications, awards and trust badges',
      },
      {
        type: 'social-proof',
        label: 'Social Proof',
        icon: <ThumbsUp className="h-5 w-5" />,
        description: 'Customer counts, ratings and live activity',
      },
      {
        type: 'notification-toast',
        label: 'Notification Toast',
        icon: <BellRing className="h-5 w-5" />,
        description: 'Popup notifications for purchases and signups',
      },
      {
        type: 'floating-cta',
        label: 'Floating CTA',
        icon: <PanelBottom className="h-5 w-5" />,
        description: 'Sticky call-to-action that appears on scroll',
      },
      {
        type: 'marquee',
        label: 'Marquee',
        icon: <MoveHorizontal className="h-5 w-5" />,
        description: 'Scrolling text ticker for promotions',
      },
    ],
  },
  {
    name: 'Interaction',
    blocks: [
      {
        type: 'cta',
        label: 'Call-to-Action',
        icon: <MousePointerClick className="h-5 w-5" />,
        description: 'Prompt with button',
      },
      {
        type: 'contact',
        label: 'Contact',
        icon: <Phone className="h-5 w-5" />,
        description: 'Contact information',
      },
      {
        type: 'chat',
        label: 'AI Chat',
        icon: <MessageSquare className="h-5 w-5" />,
        description: 'Embedded AI chat feature',
      },
      {
        type: 'chat-launcher',
        label: 'Chat Launcher',
        icon: <MessageSquare className="h-5 w-5" />,
        description: 'ChatGPT-style launcher that routes to /chat',
      },
      {
        type: 'form',
        label: 'Form',
        icon: <FileText className="h-5 w-5" />,
        description: 'Custom contact or lead form',
      },
      {
        type: 'newsletter',
        label: 'Newsletter',
        icon: <Mail className="h-5 w-5" />,
        description: 'Email subscription form',
      },
      {
        type: 'popup',
        label: 'Popup',
        icon: <Megaphone className="h-5 w-5" />,
        description: 'Promotional popup with triggers',
      },
      {
        type: 'booking',
        label: 'Booking',
        icon: <CalendarCheck className="h-5 w-5" />,
        description: 'Calendar embed or booking form',
      },
      {
        type: 'pricing',
        label: 'Pricing',
        icon: <CreditCard className="h-5 w-5" />,
        description: 'Pricing tiers and packages',
      },
      {
        type: 'products',
        label: 'Products',
        icon: <ShoppingBag className="h-5 w-5" />,
        description: 'Display products with add-to-cart',
      },
      {
        type: 'cart',
        label: 'Cart',
        icon: <ShoppingCart className="h-5 w-5" />,
        description: 'Shopping cart with checkout link',
      },
      {
        type: 'kb-featured',
        label: 'KB Featured',
        icon: <HelpCircle className="h-5 w-5" />,
        description: 'Featured Knowledge Base articles',
      },
      {
        type: 'kb-hub',
        label: 'Knowledge Base',
        icon: <HelpCircle className="h-5 w-5" />,
        description: 'Full Knowledge Base with search and categories',
      },
      {
        type: 'kb-search',
        label: 'KB Search',
        icon: <HelpCircle className="h-5 w-5" />,
        description: 'Standalone search for Knowledge Base',
      },
      {
        type: 'kb-accordion',
        label: 'KB Accordion',
        icon: <HelpCircle className="h-5 w-5" />,
        description: 'KB articles as expandable FAQ items',
      },
      {
        type: 'webinar',
        label: 'Webinar',
        icon: <Video className="h-5 w-5" />,
        description: 'Upcoming and past webinars with registration',
      },
    ],
  },
];

interface BlockSelectorProps {
  onAdd: (type: ContentBlockType) => void;
  onPaste?: () => void;
}

export function BlockSelector({ onAdd, onPaste }: BlockSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const blockModuleStatus = useAllBlockModuleStatus();

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return BLOCK_GROUPS;
    
    const query = searchQuery.toLowerCase();
    return BLOCK_GROUPS.map(group => ({
      ...group,
      blocks: group.blocks.filter(block => 
        block.label.toLowerCase().includes(query) ||
        block.description.toLowerCase().includes(query)
      )
    })).filter(group => group.blocks.length > 0);
  }, [searchQuery]);

  const handleSelect = (type: ContentBlockType) => {
    onAdd(type);
    setSearchQuery('');
    setOpen(false);
  };

  const getModuleWarning = (blockType: ContentBlockType): string | null => {
    const status = blockModuleStatus[blockType];
    if (!status || status.isAvailable) return null;
    return `Requires ${status.requiredModuleName} module`;
  };

  return (
    <div className="flex gap-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" className="flex-1 border-dashed">
            <Plus className="h-4 w-4 mr-2" />
            Add Block
          </Button>
        </SheetTrigger>
        {onPaste && (
          <Button variant="outline" onClick={onPaste} className="border-dashed">
            <Clipboard className="h-4 w-4 mr-2" />
            Paste
          </Button>
        )}
      <SheetContent side="right" className="w-[400px] sm:w-[540px] p-0">
        <SheetHeader className="px-6 py-4 border-b bg-card space-y-3">
          <SheetTitle className="font-serif">Select Block Type</SheetTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search blocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="p-6 space-y-6">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No blocks match your search
              </div>
            ) : filteredGroups.map((group) => (
              <div key={group.name}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {group.name}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {group.blocks.map((block) => {
                    const moduleWarning = getModuleWarning(block.type);
                    
                    return (
                      <TooltipProvider key={block.type}>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleSelect(block.type)}
                              className={`flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent hover:border-primary/30 transition-all text-left group relative ${
                                moduleWarning ? 'opacity-75' : ''
                              }`}
                            >
                              {moduleWarning && (
                                <div className="absolute top-2 right-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                </div>
                              )}
                              <div className={`p-2 rounded-md transition-colors ${
                                moduleWarning 
                                  ? 'bg-muted text-muted-foreground group-hover:bg-muted group-hover:text-muted-foreground' 
                                  : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground'
                              }`}>
                                {block.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{block.label}</div>
                                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {block.description}
                                </div>
                              </div>
                            </button>
                          </TooltipTrigger>
                          {moduleWarning && (
                            <TooltipContent side="top" className="max-w-xs">
                              <div className="flex items-center gap-2 text-sm">
                                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                <span>{moduleWarning}. Enable it in Modules settings.</span>
                              </div>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
    </div>
  );
}
