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
          Sidinställningar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Sidinställningar</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Page Title Display */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="showTitle">Visa sidtitel</Label>
                <p className="text-sm text-muted-foreground">
                  Visa titeln ovanför sidinnehållet
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
                <Label>Rubrikjustering</Label>
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
                      Vänster
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="center" id="align-center" />
                    <Label htmlFor="align-center" className="font-normal cursor-pointer">
                      Centrerad
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
              <Label htmlFor="seoTitle">Anpassad SEO-titel</Label>
              <Input
                id="seoTitle"
                value={seoTitle}
                onChange={(e) => updateMeta({ seoTitle: e.target.value })}
                placeholder="Lämna tomt för att använda sidtiteln"
              />
              <p className="text-xs text-muted-foreground">
                Visas i sökresultat och webbläsarflik
              </p>
            </div>
          </div>

          <Separator />

          {/* Search Engine Indexing */}
          <div className="space-y-4">
            <Label>Sökmotor-indexering</Label>
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
                    Dölj från sökmotorer (noindex)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Sidan visas inte i sökresultat
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
                    Följ inte länkar (nofollow)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Sökmotorer följer inte länkar på sidan
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
