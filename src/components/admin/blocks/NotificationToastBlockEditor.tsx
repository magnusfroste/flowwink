import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, GripVertical, ShoppingCart, User, Star, MessageCircle, Heart, Bell, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImagePickerField } from '../ImagePickerField';
import type { NotificationToastBlockData, NotificationItem } from '@/components/public/blocks/NotificationToastBlock';

interface NotificationToastBlockEditorProps {
  data: NotificationToastBlockData;
  onChange: (data: NotificationToastBlockData) => void;
  isEditing: boolean;
}

const ICON_OPTIONS = [
  { value: 'cart', label: 'Cart', icon: ShoppingCart },
  { value: 'user', label: 'User', icon: User },
  { value: 'star', label: 'Star', icon: Star },
  { value: 'message', label: 'Message', icon: MessageCircle },
  { value: 'heart', label: 'Heart', icon: Heart },
  { value: 'bell', label: 'Bell', icon: Bell },
  { value: 'check', label: 'Check', icon: Check },
];

const DEFAULT_NOTIFICATION: Omit<NotificationItem, 'id'> = {
  type: 'purchase',
  icon: 'cart',
  title: 'Someone just purchased',
  message: 'Premium Package',
};

export function NotificationToastBlockEditor({ data, onChange, isEditing }: NotificationToastBlockEditorProps) {
  const notifications = data.notifications || [];

  const handleAddNotification = () => {
    onChange({
      ...data,
      notifications: [
        ...notifications,
        { ...DEFAULT_NOTIFICATION, id: `notif-${Date.now()}` },
      ],
    });
  };

  const handleUpdateNotification = (index: number, updates: Partial<NotificationItem>) => {
    const updated = [...notifications];
    updated[index] = { ...updated[index], ...updates };
    onChange({ ...data, notifications: updated });
  };

  const handleRemoveNotification = (index: number) => {
    onChange({
      ...data,
      notifications: notifications.filter((_, i) => i !== index),
    });
  };

  if (!isEditing) {
    const ICONS_MAP: Record<string, React.ElementType> = {
      cart: ShoppingCart, user: User, star: Star, message: MessageCircle, heart: Heart, bell: Bell, check: Check,
    };

    if (notifications.length === 0) {
      return (
        <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
          <Bell className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No notifications configured</p>
        </div>
      );
    }

    const position = data.position || 'bottom-left';
    const sample = notifications[0];
    const IconComp = ICONS_MAP[sample.icon || 'bell'] || Bell;

    return (
      <div className="py-6 px-4">
        <p className="text-[10px] text-muted-foreground text-center mb-3 uppercase tracking-wider">
          Notification Toast — {position} • {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
        </p>
        <div className={cn(
          'mx-auto max-w-xs',
          position.includes('right') ? 'ml-auto mr-4' : 'mr-auto ml-4'
        )}>
          <div className="bg-card border rounded-xl shadow-lg p-3 flex items-start gap-3 relative">
            <div className="h-9 w-9 rounded-full bg-accent/50 flex items-center justify-center shrink-0">
              <IconComp className="h-4 w-4 text-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{sample.title}</p>
              <p className="text-xs text-muted-foreground truncate">{sample.message}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">2 min ago</p>
            </div>
            {data.showCloseButton !== false && (
              <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 bg-muted/30 rounded-lg">
      {/* Display settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Variant</Label>
          <Select
            value={data.variant || 'default'}
            onValueChange={(value) => onChange({ ...data, variant: value as NotificationToastBlockData['variant'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="bubble">Bubble</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Position</Label>
          <Select
            value={data.position || 'bottom-left'}
            onValueChange={(value) => onChange({ ...data, position: value as NotificationToastBlockData['position'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom-left">Bottom Left</SelectItem>
              <SelectItem value="bottom-right">Bottom Right</SelectItem>
              <SelectItem value="top-left">Top Left</SelectItem>
              <SelectItem value="top-right">Top Right</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Timing */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Initial delay (s)</Label>
          <Input
            type="number"
            min={0}
            value={data.initialDelay ?? 3}
            onChange={(e) => onChange({ ...data, initialDelay: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>Display duration (s)</Label>
          <Input
            type="number"
            min={1}
            value={data.displayDuration ?? 5}
            onChange={(e) => onChange({ ...data, displayDuration: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>Delay between (s)</Label>
          <Input
            type="number"
            min={1}
            value={data.delayBetween ?? 8}
            onChange={(e) => onChange({ ...data, delayBetween: Number(e.target.value) })}
          />
        </div>
      </div>

      {/* Animation and size */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Animation</Label>
          <Select
            value={data.animationType || 'slide'}
            onValueChange={(value) => onChange({ ...data, animationType: value as NotificationToastBlockData['animationType'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slide">Slide</SelectItem>
              <SelectItem value="fade">Fade</SelectItem>
              <SelectItem value="pop">Pop</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Max Width</Label>
          <Select
            value={data.maxWidth || 'sm'}
            onValueChange={(value) => onChange({ ...data, maxWidth: value as NotificationToastBlockData['maxWidth'] })}
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

      {/* Options */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={data.showCloseButton !== false}
            onCheckedChange={(checked) => onChange({ ...data, showCloseButton: checked })}
          />
          <Label>Show close button</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={data.showImage !== false}
            onCheckedChange={(checked) => onChange({ ...data, showImage: checked })}
          />
          <Label>Show image/icon</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={data.showTimestamp !== false}
            onCheckedChange={(checked) => onChange({ ...data, showTimestamp: checked })}
          />
          <Label>Show timestamp</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={data.loop !== false}
            onCheckedChange={(checked) => onChange({ ...data, loop: checked })}
          />
          <Label>Loop notifications</Label>
        </div>
      </div>

      {/* Notifications */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">Notifications</Label>
          <Button variant="outline" size="sm" onClick={handleAddNotification}>
            <Plus className="h-4 w-4 mr-1" />
            Add Notification
          </Button>
        </div>

        {notifications.map((notif, index) => (
          <Card key={notif.id} className="p-4 space-y-4">
            <div className="flex items-start gap-2">
              <GripVertical className="h-5 w-5 text-muted-foreground cursor-move mt-2" />
              
              <div className="flex-1 space-y-4">
                {/* Type and Icon */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={notif.type}
                      onValueChange={(value) => handleUpdateNotification(index, { type: value as NotificationItem['type'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="purchase">Purchase</SelectItem>
                        <SelectItem value="signup">Signup</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Icon</Label>
                    <Select
                      value={notif.icon || 'cart'}
                      onValueChange={(value) => handleUpdateNotification(index, { icon: value as NotificationItem['icon'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <option.icon className="h-4 w-4" />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Title and Message */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={notif.title}
                      onChange={(e) => handleUpdateNotification(index, { title: e.target.value })}
                      placeholder="Someone just purchased"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Message</Label>
                    <Input
                      value={notif.message}
                      onChange={(e) => handleUpdateNotification(index, { message: e.target.value })}
                      placeholder="Premium Package"
                    />
                  </div>
                </div>

                {/* Image */}
                <div className="space-y-2">
                  <Label className="text-xs">Image (optional)</Label>
                  <ImagePickerField
                    value={notif.image || ''}
                    onChange={(url) => handleUpdateNotification(index, { image: url })}
                  />
                </div>

                {/* Location */}
                <div className="space-y-2">
                  <Label className="text-xs">Location (optional)</Label>
                  <Input
                    value={notif.location || ''}
                    onChange={(e) => handleUpdateNotification(index, { location: e.target.value })}
                    placeholder="Stockholm, Sweden"
                  />
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => handleRemoveNotification(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}

        {notifications.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            No notifications yet. Click "Add Notification" to get started.
          </div>
        )}
      </div>
    </div>
  );
}
