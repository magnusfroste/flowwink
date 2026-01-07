import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBlockEditor } from '@/hooks/useBlockEditor';
import { Bell, X } from 'lucide-react';
import type { AnnouncementBarBlockData } from '@/components/public/blocks/AnnouncementBarBlock';

interface AnnouncementBarBlockEditorProps {
  data: AnnouncementBarBlockData;
  onChange: (data: AnnouncementBarBlockData) => void;
  isEditing: boolean;
}

export function AnnouncementBarBlockEditor({ data, onChange, isEditing }: AnnouncementBarBlockEditorProps) {
  const { data: blockData, updateField } = useBlockEditor({
    initialData: data,
    onChange,
  });

  if (isEditing) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <div className="space-y-2">
          <Label htmlFor="announcement-message">Message *</Label>
          <Input
            id="announcement-message"
            value={blockData.message || ''}
            onChange={(e) => updateField('message', e.target.value)}
            placeholder="🎉 Special offer! Get 20% off today only"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="link-text">Link Text</Label>
            <Input
              id="link-text"
              value={blockData.linkText || ''}
              onChange={(e) => updateField('linkText', e.target.value)}
              placeholder="Shop now"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-url">Link URL</Label>
            <Input
              id="link-url"
              value={blockData.linkUrl || ''}
              onChange={(e) => updateField('linkUrl', e.target.value)}
              placeholder="/products"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Variant</Label>
          <Select
            value={blockData.variant || 'solid'}
            onValueChange={(value) => updateField('variant', value as 'solid' | 'gradient' | 'minimal')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid</SelectItem>
              <SelectItem value="gradient">Gradient</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="dismissable">Allow dismiss</Label>
          <Switch
            id="dismissable"
            checked={blockData.dismissable ?? true}
            onCheckedChange={(checked) => updateField('dismissable', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="sticky">Sticky (stay on top when scrolling)</Label>
          <Switch
            id="sticky"
            checked={blockData.sticky ?? false}
            onCheckedChange={(checked) => updateField('sticky', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-countdown">Show countdown</Label>
          <Switch
            id="show-countdown"
            checked={blockData.showCountdown ?? false}
            onCheckedChange={(checked) => updateField('showCountdown', checked)}
          />
        </div>

        {blockData.showCountdown && (
          <div className="space-y-2">
            <Label htmlFor="countdown-target">Countdown target date/time</Label>
            <Input
              id="countdown-target"
              type="datetime-local"
              value={blockData.countdownTarget ? blockData.countdownTarget.slice(0, 16) : ''}
              onChange={(e) => updateField('countdownTarget', new Date(e.target.value).toISOString())}
            />
          </div>
        )}
      </div>
    );
  }

  // Preview mode
  if (!blockData.message) {
    return (
      <div className="flex flex-col items-center justify-center h-24 bg-muted/50 rounded-lg border-2 border-dashed border-muted-foreground/30">
        <Bell className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No announcement message</p>
      </div>
    );
  }

  const variantStyles = {
    solid: 'bg-primary text-primary-foreground',
    gradient: 'bg-gradient-to-r from-primary via-primary/90 to-primary text-primary-foreground',
    minimal: 'bg-muted text-muted-foreground border-b',
  };

  return (
    <div className={`relative py-2.5 px-4 text-center text-sm rounded-lg ${variantStyles[blockData.variant || 'solid']}`}>
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <span className="font-medium">{blockData.message}</span>
        {blockData.linkText && (
          <span className="font-semibold underline">{blockData.linkText} →</span>
        )}
      </div>
      {blockData.dismissable !== false && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <X className="h-4 w-4 opacity-50" />
        </div>
      )}
    </div>
  );
}
