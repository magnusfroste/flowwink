import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FloatingCTABlockData } from '@/components/public/blocks/FloatingCTABlock';

interface FloatingCTABlockEditorProps {
  data: FloatingCTABlockData;
  onChange: (data: FloatingCTABlockData) => void;
  isEditing: boolean;
}

export function FloatingCTABlockEditor({ data, onChange, isEditing }: FloatingCTABlockEditorProps) {
  if (!isEditing) {
    return (
      <div className="py-8 px-6 text-center bg-muted/30 rounded-lg border-2 border-dashed">
        <p className="text-muted-foreground text-sm">
          Floating CTA: "{data.title || 'Untitled'}" – visas efter {data.showAfterScroll || 25}% scroll
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {/* Content Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
          Innehåll
        </h4>
        
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Ex: Boka din tid idag!"
          />
        </div>

        <div className="space-y-2">
          <Label>Subtitle (optional)</Label>
          <Input
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="Ex: Limited spots available"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Button text</Label>
            <Input
              value={data.buttonText || ''}
              onChange={(e) => onChange({ ...data, buttonText: e.target.value })}
              placeholder="Book now"
            />
          </div>
          <div className="space-y-2">
            <Label>Button link</Label>
            <Input
              value={data.buttonUrl || ''}
              onChange={(e) => onChange({ ...data, buttonUrl: e.target.value })}
              placeholder="/contact"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Secondary button text (optional)</Label>
            <Input
              value={data.secondaryButtonText || ''}
              onChange={(e) => onChange({ ...data, secondaryButtonText: e.target.value })}
              placeholder="Read more"
            />
          </div>
          <div className="space-y-2">
            <Label>Secondary button link</Label>
            <Input
              value={data.secondaryButtonUrl || ''}
              onChange={(e) => onChange({ ...data, secondaryButtonUrl: e.target.value })}
              placeholder="/about"
            />
          </div>
        </div>
      </div>

      {/* Trigger Settings */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
          Trigger
        </h4>

        <div className="space-y-2">
          <Label>Visa efter scroll: {data.showAfterScroll || 25}%</Label>
          <Slider
            value={[data.showAfterScroll || 25]}
            onValueChange={([value]) => onChange({ ...data, showAfterScroll: value })}
            min={0}
            max={100}
            step={5}
          />
          <p className="text-xs text-muted-foreground">
            CTA:n visas när användaren scrollat {data.showAfterScroll || 25}% av sidan
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Dölj vid scroll uppåt</Label>
            <p className="text-xs text-muted-foreground">Göm när användaren scrollar upp</p>
          </div>
          <Switch
            checked={data.hideOnScrollUp ?? false}
            onCheckedChange={(checked) => onChange({ ...data, hideOnScrollUp: checked })}
          />
        </div>
      </div>

      {/* Display Settings */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
          Utseende
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Variant</Label>
            <Select
              value={data.variant || 'bar'}
              onValueChange={(value: FloatingCTABlockData['variant']) => 
                onChange({ ...data, variant: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar (full width)</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="pill">Pill</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Position</Label>
            <Select
              value={data.position || 'bottom'}
              onValueChange={(value: FloatingCTABlockData['position']) => 
                onChange({ ...data, position: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom">Centered</SelectItem>
                <SelectItem value="bottom-left">Bottom left</SelectItem>
                <SelectItem value="bottom-right">Bottom right</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Size</Label>
            <Select
              value={data.size || 'md'}
              onValueChange={(value: FloatingCTABlockData['size']) => 
                onChange({ ...data, size: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Liten</SelectItem>
                <SelectItem value="md">Medium</SelectItem>
                <SelectItem value="lg">Stor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Animation</Label>
            <Select
              value={data.animationType || 'slide'}
              onValueChange={(value: FloatingCTABlockData['animationType']) => 
                onChange({ ...data, animationType: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slide">Glid upp</SelectItem>
                <SelectItem value="fade">Tona in</SelectItem>
                <SelectItem value="scale">Zooma in</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>Visa stäng-knapp</Label>
              <p className="text-xs text-muted-foreground">Låter användaren stänga CTA:n</p>
            </div>
            <Switch
              checked={data.showCloseButton ?? true}
              onCheckedChange={(checked) => onChange({ ...data, showCloseButton: checked })}
            />
          </div>

          {data.showCloseButton && (
            <div className="flex items-center justify-between pl-4 border-l-2">
              <div>
                <Label>Kom ihåg stängning</Label>
                <p className="text-xs text-muted-foreground">Visa inte igen denna session</p>
              </div>
              <Switch
                checked={data.closePersistent ?? false}
                onCheckedChange={(checked) => onChange({ ...data, closePersistent: checked })}
              />
            </div>
          )}

          {data.variant === 'pill' && (
            <div className="flex items-center justify-between">
              <div>
                <Label>Visa "Scrolla upp"-knapp</Label>
                <p className="text-xs text-muted-foreground">Extra knapp för att gå till toppen</p>
              </div>
              <Switch
                checked={data.showScrollTop ?? false}
                onCheckedChange={(checked) => onChange({ ...data, showScrollTop: checked })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
