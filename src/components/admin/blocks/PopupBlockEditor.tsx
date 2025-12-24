import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImagePickerField } from '@/components/admin/ImagePickerField';
import { Clock, MousePointer, ArrowUp, X } from 'lucide-react';
import type { PopupBlockData, PopupTrigger } from '@/types/cms';

interface PopupBlockEditorProps {
  data: PopupBlockData;
  onChange: (data: PopupBlockData) => void;
  isEditing?: boolean;
}

const DEFAULT_DATA: PopupBlockData = {
  title: 'Special Offer!',
  content: 'Sign up today and get 20% off your first order.',
  trigger: 'time',
  delaySeconds: 5,
  scrollPercentage: 50,
  showOnce: true,
  cookieDays: 7,
  size: 'md',
  position: 'center',
  overlayDark: true,
};

export function PopupBlockEditor({ data, onChange, isEditing }: PopupBlockEditorProps) {
  const popupData = { ...DEFAULT_DATA, ...data };

  const updateData = (updates: Partial<PopupBlockData>) => {
    onChange({ ...popupData, ...updates });
  };

  if (!isEditing) {
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              {popupData.trigger === 'scroll' && <ArrowUp className="h-5 w-5 text-primary" />}
              {popupData.trigger === 'time' && <Clock className="h-5 w-5 text-primary" />}
              {popupData.trigger === 'exit-intent' && <MousePointer className="h-5 w-5 text-primary" />}
            </div>
            <div>
              <p className="font-medium">{popupData.title}</p>
              <p className="text-sm text-muted-foreground">
                Trigger: {popupData.trigger === 'scroll' && `${popupData.scrollPercentage}% scroll`}
                {popupData.trigger === 'time' && `${popupData.delaySeconds}s delay`}
                {popupData.trigger === 'exit-intent' && 'Exit intent'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-4 bg-muted/30 rounded-lg">
      <Tabs defaultValue="content" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="trigger">Trigger</TabsTrigger>
          <TabsTrigger value="style">Style</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={popupData.title}
              onChange={(e) => updateData({ title: e.target.value })}
              placeholder="Popup title"
            />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              value={popupData.content}
              onChange={(e) => updateData({ content: e.target.value })}
              placeholder="Popup message..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Image (optional)</Label>
            <ImagePickerField
              value={popupData.image || ''}
              onChange={(value) => updateData({ image: value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Primary Button Text</Label>
              <Input
                value={popupData.buttonText || ''}
                onChange={(e) => updateData({ buttonText: e.target.value })}
                placeholder="Get Started"
              />
            </div>
            <div className="space-y-2">
              <Label>Button URL</Label>
              <Input
                value={popupData.buttonUrl || ''}
                onChange={(e) => updateData({ buttonUrl: e.target.value })}
                placeholder="/signup"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Secondary Button Text (optional)</Label>
            <Input
              value={popupData.secondaryButtonText || ''}
              onChange={(e) => updateData({ secondaryButtonText: e.target.value })}
              placeholder="No thanks"
            />
          </div>
        </TabsContent>

        <TabsContent value="trigger" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Trigger Type</Label>
            <Select
              value={popupData.trigger}
              onValueChange={(value) => updateData({ trigger: value as PopupTrigger })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Time Delay</span>
                  </div>
                </SelectItem>
                <SelectItem value="scroll">
                  <div className="flex items-center gap-2">
                    <ArrowUp className="h-4 w-4" />
                    <span>Scroll Position</span>
                  </div>
                </SelectItem>
                <SelectItem value="exit-intent">
                  <div className="flex items-center gap-2">
                    <MousePointer className="h-4 w-4" />
                    <span>Exit Intent</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {popupData.trigger === 'time' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Delay (seconds)</Label>
                <span className="text-sm text-muted-foreground">{popupData.delaySeconds}s</span>
              </div>
              <Slider
                value={[popupData.delaySeconds || 5]}
                onValueChange={([value]) => updateData({ delaySeconds: value })}
                min={1}
                max={60}
                step={1}
              />
            </div>
          )}

          {popupData.trigger === 'scroll' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Scroll Percentage</Label>
                <span className="text-sm text-muted-foreground">{popupData.scrollPercentage}%</span>
              </div>
              <Slider
                value={[popupData.scrollPercentage || 50]}
                onValueChange={([value]) => updateData({ scrollPercentage: value })}
                min={10}
                max={90}
                step={5}
              />
            </div>
          )}

          {popupData.trigger === 'exit-intent' && (
            <p className="text-sm text-muted-foreground">
              Popup will appear when the user moves their mouse towards the top of the browser window,
              indicating they might leave the page.
            </p>
          )}

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label>Show Once Per Session</Label>
                <p className="text-xs text-muted-foreground">Don't show again if dismissed</p>
              </div>
              <Switch
                checked={popupData.showOnce}
                onCheckedChange={(checked) => updateData({ showOnce: checked })}
              />
            </div>

            {popupData.showOnce && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Remember for (days)</Label>
                  <span className="text-sm text-muted-foreground">{popupData.cookieDays} days</span>
                </div>
                <Slider
                  value={[popupData.cookieDays || 7]}
                  onValueChange={([value]) => updateData({ cookieDays: value })}
                  min={1}
                  max={30}
                  step={1}
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="style" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Size</Label>
            <Select
              value={popupData.size}
              onValueChange={(value) => updateData({ size: value as 'sm' | 'md' | 'lg' })}
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

          <div className="space-y-2">
            <Label>Position</Label>
            <Select
              value={popupData.position}
              onValueChange={(value) => updateData({ position: value as 'center' | 'bottom-right' | 'bottom-left' })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="bottom-right">Bottom Right</SelectItem>
                <SelectItem value="bottom-left">Bottom Left</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Dark Overlay</Label>
              <p className="text-xs text-muted-foreground">Dim the background</p>
            </div>
            <Switch
              checked={popupData.overlayDark}
              onCheckedChange={(checked) => updateData({ overlayDark: checked })}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
