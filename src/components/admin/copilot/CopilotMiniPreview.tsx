import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { CopilotBlock } from '@/hooks/useCopilot';
import { 
  Layout, 
  Grid3X3, 
  MessageSquareQuote, 
  MousePointerClick, 
  Mail,
  Image,
  Type,
  Users,
  Star,
  Layers
} from 'lucide-react';

interface CopilotMiniPreviewProps {
  blocks: CopilotBlock[];
  className?: string;
}

// Icon mapping for different block types
const blockIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  hero: Layout,
  features: Grid3X3,
  testimonials: MessageSquareQuote,
  cta: MousePointerClick,
  contact: Mail,
  image: Image,
  text: Type,
  team: Users,
  stats: Star,
  gallery: Image,
};

// Color mapping for block types
const blockColorMap: Record<string, string> = {
  hero: 'bg-primary/20 border-primary/30',
  features: 'bg-blue-500/20 border-blue-500/30',
  testimonials: 'bg-amber-500/20 border-amber-500/30',
  cta: 'bg-green-500/20 border-green-500/30',
  contact: 'bg-purple-500/20 border-purple-500/30',
  image: 'bg-pink-500/20 border-pink-500/30',
  text: 'bg-slate-500/20 border-slate-500/30',
  team: 'bg-indigo-500/20 border-indigo-500/30',
  stats: 'bg-orange-500/20 border-orange-500/30',
  gallery: 'bg-rose-500/20 border-rose-500/30',
};

// Height mapping for block representation (proportional to typical block size)
const blockHeightMap: Record<string, number> = {
  hero: 24,
  features: 16,
  testimonials: 14,
  cta: 10,
  contact: 18,
  image: 12,
  text: 8,
  team: 14,
  stats: 10,
  gallery: 16,
};

export function CopilotMiniPreview({ blocks, className }: CopilotMiniPreviewProps) {
  const activeBlocks = useMemo(() => 
    blocks.filter(b => b.status !== 'rejected'),
    [blocks]
  );

  if (activeBlocks.length === 0) {
    return null;
  }

  return (
    <div className={cn(
      "relative w-16 h-20 bg-background rounded border shadow-sm overflow-hidden",
      className
    )}>
      {/* Browser chrome decoration */}
      <div className="h-2 bg-muted border-b flex items-center gap-0.5 px-1">
        <div className="w-1 h-1 rounded-full bg-red-400/60" />
        <div className="w-1 h-1 rounded-full bg-yellow-400/60" />
        <div className="w-1 h-1 rounded-full bg-green-400/60" />
      </div>
      
      {/* Content area with mini blocks */}
      <div className="p-0.5 space-y-0.5 overflow-hidden">
        {activeBlocks.map((block, index) => {
          const Icon = blockIconMap[block.type] || Layers;
          const colorClass = blockColorMap[block.type] || 'bg-muted border-muted-foreground/20';
          const height = blockHeightMap[block.type] || 8;
          
          return (
            <div
              key={block.id}
              className={cn(
                "w-full rounded-sm border flex items-center justify-center transition-all duration-300",
                colorClass,
                // Animate new blocks
                "animate-in fade-in slide-in-from-bottom-1"
              )}
              style={{ 
                height: `${height}px`,
                animationDelay: `${index * 50}ms`,
              }}
            >
              <Icon className="w-2 h-2 text-muted-foreground/70" />
            </div>
          );
        })}
      </div>

      {/* Subtle gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
    </div>
  );
}
