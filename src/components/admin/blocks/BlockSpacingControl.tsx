import { ChevronDown, ChevronUp, Space } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BlockSpacing, SpacingSize } from '@/types/cms';

interface BlockSpacingControlProps {
  spacing?: BlockSpacing;
  onChange: (spacing: BlockSpacing) => void;
}

const SPACING_OPTIONS: { value: SpacingSize; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'xs', label: 'XS' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'XL' },
];

export function BlockSpacingControl({ spacing = {}, onChange }: BlockSpacingControlProps) {
  const updateSpacing = (key: keyof BlockSpacing, value: SpacingSize) => {
    onChange({
      ...spacing,
      [key]: value === 'none' ? undefined : value,
    });
  };

  const hasSpacing = Object.values(spacing).some(v => v && v !== 'none');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`h-7 w-7 bg-card ${hasSpacing ? 'border-primary text-primary' : ''}`}
        >
          <Space className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Spacing</h4>
          </div>

          {/* Margin controls */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Margin (outer)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronUp className="h-3 w-3" />
                  <span>Top</span>
                </div>
                <Select
                  value={spacing.marginTop || 'none'}
                  onValueChange={(value) => updateSpacing('marginTop', value as SpacingSize)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPACING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronDown className="h-3 w-3" />
                  <span>Bottom</span>
                </div>
                <Select
                  value={spacing.marginBottom || 'none'}
                  onValueChange={(value) => updateSpacing('marginBottom', value as SpacingSize)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPACING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Padding controls */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Padding (inner)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronUp className="h-3 w-3" />
                  <span>Top</span>
                </div>
                <Select
                  value={spacing.paddingTop || 'none'}
                  onValueChange={(value) => updateSpacing('paddingTop', value as SpacingSize)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPACING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronDown className="h-3 w-3" />
                  <span>Bottom</span>
                </div>
                <Select
                  value={spacing.paddingBottom || 'none'}
                  onValueChange={(value) => updateSpacing('paddingBottom', value as SpacingSize)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPACING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Preview indicator */}
          {hasSpacing && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Spacing applied to this block
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Utility function to convert spacing to Tailwind classes
export function getSpacingClasses(spacing?: BlockSpacing): string {
  if (!spacing) return '';
  
  const classes: string[] = [];
  
  const spacingMap: Record<SpacingSize, string> = {
    none: '0',
    xs: '2',
    sm: '4',
    md: '8',
    lg: '12',
    xl: '16',
  };
  
  if (spacing.paddingTop && spacing.paddingTop !== 'none') {
    classes.push(`pt-${spacingMap[spacing.paddingTop]}`);
  }
  if (spacing.paddingBottom && spacing.paddingBottom !== 'none') {
    classes.push(`pb-${spacingMap[spacing.paddingBottom]}`);
  }
  if (spacing.marginTop && spacing.marginTop !== 'none') {
    classes.push(`mt-${spacingMap[spacing.marginTop]}`);
  }
  if (spacing.marginBottom && spacing.marginBottom !== 'none') {
    classes.push(`mb-${spacingMap[spacing.marginBottom]}`);
  }
  
  return classes.join(' ');
}
