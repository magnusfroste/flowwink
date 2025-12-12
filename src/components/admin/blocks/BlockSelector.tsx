import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Layout, Type, ImageIcon, MousePointerClick, Phone, Grid3X3, Columns, AlertCircle, HelpCircle, Newspaper } from 'lucide-react';
import { ContentBlockType } from '@/types/cms';

const BLOCK_OPTIONS: { type: ContentBlockType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    type: 'hero',
    label: 'Hero',
    icon: <Layout className="h-4 w-4" />,
    description: 'Stor rubrik med bakgrund',
  },
  {
    type: 'text',
    label: 'Text',
    icon: <Type className="h-4 w-4" />,
    description: 'Rik textinnehåll',
  },
  {
    type: 'image',
    label: 'Bild',
    icon: <ImageIcon className="h-4 w-4" />,
    description: 'Bild med bildtext',
  },
  {
    type: 'two-column',
    label: 'Två-kolumn',
    icon: <Columns className="h-4 w-4" />,
    description: 'Text och bild sida vid sida',
  },
  {
    type: 'link-grid',
    label: 'Länkgrid',
    icon: <Grid3X3 className="h-4 w-4" />,
    description: 'Rutnät med snabblänkar',
  },
  {
    type: 'info-box',
    label: 'Faktaruta',
    icon: <AlertCircle className="h-4 w-4" />,
    description: 'Framhävd informationsruta',
  },
  {
    type: 'accordion',
    label: 'Accordion/FAQ',
    icon: <HelpCircle className="h-4 w-4" />,
    description: 'Expanderbara frågor och svar',
  },
  {
    type: 'article-grid',
    label: 'Artikelgrid',
    icon: <Newspaper className="h-4 w-4" />,
    description: 'Rutnät med artikelkort',
  },
  {
    type: 'cta',
    label: 'Call-to-Action',
    icon: <MousePointerClick className="h-4 w-4" />,
    description: 'Uppmaning med knapp',
  },
  {
    type: 'contact',
    label: 'Kontakt',
    icon: <Phone className="h-4 w-4" />,
    description: 'Kontaktinformation',
  },
];

interface BlockSelectorProps {
  onAdd: (type: ContentBlockType) => void;
}

export function BlockSelector({ onAdd }: BlockSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full border-dashed">
          <Plus className="h-4 w-4 mr-2" />
          Lägg till block
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        {BLOCK_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.type}
            onClick={() => onAdd(option.type)}
            className="flex items-start gap-3 py-3"
          >
            <div className="mt-0.5 text-primary">{option.icon}</div>
            <div>
              <div className="font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground">{option.description}</div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
