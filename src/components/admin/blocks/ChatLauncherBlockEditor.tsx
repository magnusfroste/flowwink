import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import type { ChatLauncherBlockData } from '@/components/public/blocks/ChatLauncherBlock';

interface ChatLauncherBlockEditorProps {
  data: ChatLauncherBlockData;
  onChange: (data: ChatLauncherBlockData) => void;
}

export function ChatLauncherBlockEditor({ data, onChange }: ChatLauncherBlockEditorProps) {
  const handleChange = (key: keyof ChatLauncherBlockData, value: unknown) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This block creates a ChatGPT/Claude-style launcher that routes users to <code className="text-xs bg-muted px-1 rounded">/chat</code> when they interact with it. Quick actions are pulled from Chat Settings.
        </AlertDescription>
      </Alert>

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={data.title || ''}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="What can I help you with?"
        />
      </div>

      {/* Subtitle */}
      <div className="space-y-2">
        <Label htmlFor="subtitle">Subtitle (optional)</Label>
        <Input
          id="subtitle"
          value={data.subtitle || ''}
          onChange={(e) => handleChange('subtitle', e.target.value)}
          placeholder="Ask me anything about our services"
        />
      </div>

      {/* Placeholder */}
      <div className="space-y-2">
        <Label htmlFor="placeholder">Input Placeholder</Label>
        <Input
          id="placeholder"
          value={data.placeholder || ''}
          onChange={(e) => handleChange('placeholder', e.target.value)}
          placeholder="Message AI Assistant..."
        />
      </div>

      {/* Variant */}
      <div className="space-y-2">
        <Label htmlFor="variant">Style Variant</Label>
        <Select
          value={data.variant || 'card'}
          onValueChange={(value) => handleChange('variant', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minimal">Minimal</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="hero-integrated">Hero Integrated</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Choose how the launcher appears on the page
        </p>
      </div>

      {/* Quick Actions Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Show Quick Actions</Label>
          <p className="text-xs text-muted-foreground">
            Display suggested prompts from Chat Settings
          </p>
        </div>
        <Switch
          checked={data.showQuickActions !== false}
          onCheckedChange={(checked) => handleChange('showQuickActions', checked)}
        />
      </div>

      {/* Quick Action Count */}
      {data.showQuickActions !== false && (
        <div className="space-y-2">
          <Label htmlFor="quickActionCount">Number of Quick Actions</Label>
          <Select
            value={String(data.quickActionCount || 4)}
            onValueChange={(value) => handleChange('quickActionCount', parseInt(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 actions</SelectItem>
              <SelectItem value="3">3 actions</SelectItem>
              <SelectItem value="4">4 actions</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
