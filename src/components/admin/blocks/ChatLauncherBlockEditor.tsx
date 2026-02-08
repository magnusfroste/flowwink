import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatLauncherBlockData } from '@/components/public/blocks/ChatLauncherBlock';

interface ChatLauncherBlockEditorProps {
  data: ChatLauncherBlockData;
  onChange: (data: ChatLauncherBlockData) => void;
  isEditing?: boolean;
}

export function ChatLauncherBlockEditor({ data, onChange, isEditing }: ChatLauncherBlockEditorProps) {
  const handleChange = (key: keyof ChatLauncherBlockData, value: unknown) => {
    onChange({ ...data, [key]: value });
  };

  // Preview mode — match public ChatLauncherBlock
  if (!isEditing) {
    const variant = data.variant || 'card';
    const title = data.title || 'What can I help you with?';
    const placeholder = data.placeholder || 'Message AI Assistant...';
    const showActions = data.showQuickActions !== false;
    const actionCount = data.quickActionCount || 4;
    const mockActions = ['Tell me about your services', 'How does pricing work?', 'Book a consultation', 'Contact support'].slice(0, actionCount);

    return (
      <div className="py-6 px-4">
        <div className={cn(
          'w-full max-w-xl mx-auto',
          variant === 'card' && 'bg-card rounded-2xl border shadow-lg p-6',
          variant === 'hero-integrated' && 'py-8',
          variant === 'minimal' && 'py-4'
        )}>
          <div className="text-center mb-4">
            <h3 className={cn(
              'font-serif tracking-tight',
              variant === 'hero-integrated' ? 'text-3xl' : 'text-xl'
            )}>
              {title}
            </h3>
            {data.subtitle && (
              <p className="text-muted-foreground mt-1 text-sm">{data.subtitle}</p>
            )}
          </div>
          <div className="relative flex items-center gap-2 rounded-xl border bg-background px-4 py-3">
            <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1 text-sm text-muted-foreground">{placeholder}</span>
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <ArrowRight className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
          {showActions && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {mockActions.map((action, i) => (
                <span key={i} className="px-3 py-1 rounded-full border text-[11px] text-muted-foreground">
                  {action}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

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
