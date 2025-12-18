import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
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
} from 'lucide-react';
import { ContentBlockType } from '@/types/cms';

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
        description: 'Large heading with background image',
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
        type: 'map',
        label: 'Map',
        icon: <MapPin className="h-5 w-5" />,
        description: 'Google Maps location for clinic',
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
        type: 'form',
        label: 'Form',
        icon: <FileText className="h-5 w-5" />,
        description: 'Custom contact or lead form',
      },
    ],
  },
];

interface BlockSelectorProps {
  onAdd: (type: ContentBlockType) => void;
}

export function BlockSelector({ onAdd }: BlockSelectorProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (type: ContentBlockType) => {
    onAdd(type);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full border-dashed">
          <Plus className="h-4 w-4 mr-2" />
          Add Block
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] p-0">
        <SheetHeader className="px-6 py-4 border-b bg-card">
          <SheetTitle className="font-serif">Select Block Type</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="p-6 space-y-6">
            {BLOCK_GROUPS.map((group) => (
              <div key={group.name}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {group.name}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {group.blocks.map((block) => (
                    <button
                      key={block.type}
                      onClick={() => handleSelect(block.type)}
                      className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent hover:border-primary/30 transition-all text-left group"
                    >
                      <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        {block.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{block.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {block.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
