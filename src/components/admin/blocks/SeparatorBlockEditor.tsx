import { SeparatorBlockData } from '@/types/cms';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Minus, MoreHorizontal, Sparkles, Space } from 'lucide-react';

interface SeparatorBlockEditorProps {
  data: SeparatorBlockData;
  onChange: (data: SeparatorBlockData) => void;
  isEditing: boolean;
}

const STYLE_ICONS = {
  line: <Minus className="h-4 w-4" />,
  dots: <MoreHorizontal className="h-4 w-4" />,
  ornament: <Sparkles className="h-4 w-4" />,
  space: <Space className="h-4 w-4" />,
};

const SPACING_MAP = {
  sm: 'py-4',
  md: 'py-8',
  lg: 'py-12',
};

export function SeparatorBlockEditor({ data, onChange, isEditing }: SeparatorBlockEditorProps) {
  const renderSeparator = () => {
    const spacing = SPACING_MAP[data.spacing || 'md'];
    
    switch (data.style) {
      case 'line':
        return (
          <div className={spacing}>
            <div className="border-t border-border" />
          </div>
        );
      case 'dots':
        return (
          <div className={`${spacing} flex justify-center gap-2`}>
            <span className="w-2 h-2 rounded-full bg-primary/40" />
            <span className="w-2 h-2 rounded-full bg-primary/40" />
            <span className="w-2 h-2 rounded-full bg-primary/40" />
          </div>
        );
      case 'ornament':
        return (
          <div className={`${spacing} flex justify-center items-center gap-4`}>
            <div className="flex-1 border-t border-border" />
            <Sparkles className="h-5 w-5 text-primary/60" />
            <div className="flex-1 border-t border-border" />
          </div>
        );
      case 'space':
      default:
        return <div className={spacing} />;
    }
  };

  if (!isEditing) {
    return <div className="px-4">{renderSeparator()}</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Style</Label>
          <Select
            value={data.style || 'line'}
            onValueChange={(value: 'line' | 'dots' | 'ornament' | 'space') => 
              onChange({ ...data, style: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="line">
                <div className="flex items-center gap-2">
                  {STYLE_ICONS.line}
                  <span>Line</span>
                </div>
              </SelectItem>
              <SelectItem value="dots">
                <div className="flex items-center gap-2">
                  {STYLE_ICONS.dots}
                  <span>Dots</span>
                </div>
              </SelectItem>
              <SelectItem value="ornament">
                <div className="flex items-center gap-2">
                  {STYLE_ICONS.ornament}
                  <span>Ornament</span>
                </div>
              </SelectItem>
              <SelectItem value="space">
                <div className="flex items-center gap-2">
                  {STYLE_ICONS.space}
                  <span>Space</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Size</Label>
          <Select
            value={data.spacing || 'md'}
            onValueChange={(value: 'sm' | 'md' | 'lg') => 
              onChange({ ...data, spacing: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg bg-background">
        {renderSeparator()}
      </div>
    </div>
  );
}
