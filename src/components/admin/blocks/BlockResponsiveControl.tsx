import { MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  GRID_BLOCK_TYPES,
  RESPONSIVE_MAX_COLUMNS,
  RESPONSIVE_WIDTHS,
  normalizeResponsive,
  type BlockResponsive,
  type BlockResponsiveAt,
  type ResponsiveAlign,
  type ResponsiveWidth,
} from '@/lib/block-responsive';

interface BlockResponsiveControlProps {
  blockType: string;
  value?: BlockResponsive;
  onChange: (value: BlockResponsive | undefined) => void;
}

const WIDTH_NAME: Record<ResponsiveWidth, { name: string; range: string }> = {
  sm: { name: 'Phone', range: 'below 768 px' },
  md: { name: 'Tablet', range: '768–1023 px' },
  lg: { name: 'Desktop', range: '1024 px and up' },
};

const AS_THE_BLOCK = 'block';

/**
 * Per-width overrides for one block: hide it, change a grid block's column
 * count, or align its text — on phones, tablets and desktops separately.
 * What is left untouched follows the block's own layout.
 */
export function BlockResponsiveControl({ blockType, value, onChange }: BlockResponsiveControlProps) {
  const current = normalizeResponsive(value) ?? {};
  const active = Object.keys(current).length > 0;
  const hasColumns = GRID_BLOCK_TYPES.includes(blockType);

  const setAt = (width: ResponsiveWidth, patch: Partial<BlockResponsiveAt>) => {
    onChange(normalizeResponsive({ ...current, [width]: { ...current[width], ...patch } }));
  };

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={`h-7 w-7 bg-card ${active ? 'border-primary text-primary' : ''}`}
              aria-label="Per screen width"
            >
              <MonitorSmartphone className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Per screen width</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-1">Per screen width</h4>
            <p className="text-xs text-muted-foreground">
              Change how this block shows on phones, tablets and desktops. What you leave alone follows the block.
            </p>
          </div>

          {RESPONSIVE_WIDTHS.map((width) => {
            const at = current[width] ?? {};
            return (
              <div key={width} className="space-y-2 border-t pt-3" data-responsive-width={width}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">{WIDTH_NAME[width].name}</span>
                  <span className="text-xs text-muted-foreground">{WIDTH_NAME[width].range}</span>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor={`responsive-hidden-${width}`} className="text-xs">Hide here</Label>
                  <Switch
                    id={`responsive-hidden-${width}`}
                    checked={!!at.hidden}
                    onCheckedChange={(hidden) => setAt(width, { hidden: hidden || undefined })}
                  />
                </div>

                {hasColumns && (
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-xs">Columns</Label>
                    <Select
                      value={at.columns ? String(at.columns) : AS_THE_BLOCK}
                      onValueChange={(v) => setAt(width, { columns: v === AS_THE_BLOCK ? undefined : Number(v) })}
                    >
                      <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Columns on ${WIDTH_NAME[width].name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AS_THE_BLOCK}>As the block</SelectItem>
                        {Array.from({ length: RESPONSIVE_MAX_COLUMNS }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs">Text</Label>
                  <Select
                    value={at.align ?? AS_THE_BLOCK}
                    onValueChange={(v) => setAt(width, { align: v === AS_THE_BLOCK ? undefined : (v as ResponsiveAlign) })}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Text alignment on ${WIDTH_NAME[width].name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AS_THE_BLOCK}>As the block</SelectItem>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Centred</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}

          {active && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(undefined)}>
              Clear all
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
