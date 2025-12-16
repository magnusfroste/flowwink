import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import type { PageMeta } from '@/types/cms';

interface PageSettingsDialogProps {
  meta: PageMeta;
  onMetaChange: (meta: PageMeta) => void;
  disabled?: boolean;
}

export function PageSettingsDialog({ meta, onMetaChange, disabled }: PageSettingsDialogProps) {
  const showTitle = meta.showTitle !== false;
  const titleAlignment = meta.titleAlignment || 'left';
  const seoTitle = meta.seoTitle || '';
  const noIndex = meta.noIndex || false;
  const noFollow = meta.noFollow || false;

  const updateMeta = (updates: Partial<PageMeta>) => {
    onMetaChange({ ...meta, ...updates });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Settings className="h-4 w-4 mr-2" />
          Page Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Page Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Page Title Display */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="showTitle">Show Page Title</Label>
                <p className="text-sm text-muted-foreground">
                  Display the title above the page content
                </p>
              </div>
              <Switch
                id="showTitle"
                checked={showTitle}
                onCheckedChange={(checked) => updateMeta({ showTitle: checked })}
              />
            </div>
            
            {showTitle && (
              <div className="space-y-2 pl-4 border-l-2 border-muted">
                <Label>Title Alignment</Label>
                <RadioGroup
                  value={titleAlignment}
                  onValueChange={(value: 'left' | 'center') => 
                    updateMeta({ titleAlignment: value })
                  }
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="left" id="align-left" />
                    <Label htmlFor="align-left" className="font-normal cursor-pointer">
                      Left
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="center" id="align-center" />
                    <Label htmlFor="align-center" className="font-normal cursor-pointer">
                      Center
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}
          </div>

          <Separator />

          {/* SEO Settings */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seoTitle">Custom SEO Title</Label>
              <Input
                id="seoTitle"
                value={seoTitle}
                onChange={(e) => updateMeta({ seoTitle: e.target.value })}
                placeholder="Leave empty to use the page title"
              />
              <p className="text-xs text-muted-foreground">
                Displayed in search results and browser tab
              </p>
            </div>
          </div>

          <Separator />

          {/* Search Engine Indexing */}
          <div className="space-y-4">
            <Label>Search Engine Indexing</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="noIndex"
                  checked={noIndex}
                  onCheckedChange={(checked) => 
                    updateMeta({ noIndex: checked === true })
                  }
                />
                <div className="space-y-0.5">
                  <Label htmlFor="noIndex" className="font-normal cursor-pointer">
                    Hide from search engines (noindex)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    The page will not appear in search results
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="noFollow"
                  checked={noFollow}
                  onCheckedChange={(checked) => 
                    updateMeta({ noFollow: checked === true })
                  }
                />
                <div className="space-y-0.5">
                  <Label htmlFor="noFollow" className="font-normal cursor-pointer">
                    Don't follow links (nofollow)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Search engines won't follow links on this page
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
