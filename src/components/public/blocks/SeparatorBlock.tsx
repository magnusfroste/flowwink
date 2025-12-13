import { SeparatorBlockData } from '@/types/cms';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SeparatorBlockProps {
  data: SeparatorBlockData;
}

const SPACING_MAP = {
  sm: 'py-6',
  md: 'py-12',
  lg: 'py-20',
};

export function SeparatorBlock({ data }: SeparatorBlockProps) {
  const spacing = SPACING_MAP[data.spacing || 'md'];

  const renderSeparator = () => {
    switch (data.style) {
      case 'line':
        return (
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="border-t border-border" />
          </div>
        );
      
      case 'dots':
        return (
          <div className="flex justify-center gap-3">
            <span className="w-2 h-2 rounded-full bg-primary/40" />
            <span className="w-2 h-2 rounded-full bg-primary/60" />
            <span className="w-2 h-2 rounded-full bg-primary/40" />
          </div>
        );
      
      case 'ornament':
        return (
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="flex items-center gap-4">
              <div className="flex-1 border-t border-border" />
              <Sparkles className="h-6 w-6 text-primary/60" />
              <div className="flex-1 border-t border-border" />
            </div>
          </div>
        );
      
      case 'space':
      default:
        return null;
    }
  };

  return (
    <div className={cn(spacing)} aria-hidden="true">
      {renderSeparator()}
    </div>
  );
}
