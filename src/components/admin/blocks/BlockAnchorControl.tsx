import { Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface BlockAnchorControlProps {
  anchorId?: string;
  onChange: (anchorId: string | undefined) => void;
}

/**
 * Control for setting a block's anchor ID for in-page navigation.
 * Users can link to this block using #anchor-id URLs.
 */
export function BlockAnchorControl({ anchorId, onChange }: BlockAnchorControlProps) {
  const hasAnchor = !!anchorId;

  // Sanitize anchor ID: lowercase, no spaces, no special chars except hyphens
  const sanitizeAnchorId = (value: string): string => {
    return value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleChange = (value: string) => {
    const sanitized = sanitizeAnchorId(value);
    onChange(sanitized || undefined);
  };

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={`h-7 w-7 bg-card ${hasAnchor ? 'border-primary text-primary' : ''}`}
            >
              <Hash className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Anchor ID</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-1">Anchor ID</h4>
            <p className="text-xs text-muted-foreground">
              Set an ID to link directly to this block using #{anchorId || 'anchor-id'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="anchor-id" className="text-xs">
              ID (no spaces or special characters)
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">#</span>
              <Input
                id="anchor-id"
                value={anchorId || ''}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="kontakta-oss"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {hasAnchor && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Link to this block: <code className="bg-muted px-1 rounded">#{anchorId}</code>
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
