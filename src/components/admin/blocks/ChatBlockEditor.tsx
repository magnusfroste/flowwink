import { ChatBlockData } from '@/types/cms';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';

interface ChatBlockEditorProps {
  data: ChatBlockData;
  onChange: (data: ChatBlockData) => void;
  isEditing?: boolean;
}

export function ChatBlockEditor({ data, onChange, isEditing }: ChatBlockEditorProps) {
  // Preview mode
  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || "AI Chat Assistant"}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {data.variant === 'card' ? 'Card style' : 'Embedded'} • {data.height || 'md'} height
          {data.showSidebar && ' • With history'}
        </p>
        <div className="mt-4 max-w-sm mx-auto">
          <div className="h-24 rounded-lg border bg-background flex items-center justify-center text-muted-foreground text-sm">
            Chat interface preview
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="chat-title">Title (optional)</Label>
        <Input
          id="chat-title"
          value={data.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="e.g. Ask our AI assistant"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="chat-height">Height</Label>
          <Select
            value={data.height || 'md'}
            onValueChange={(value: 'sm' | 'md' | 'lg' | 'full') => 
              onChange({ ...data, height: value })
            }
          >
            <SelectTrigger id="chat-height">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small (300px)</SelectItem>
              <SelectItem value="md">Medium (450px)</SelectItem>
              <SelectItem value="lg">Large (600px)</SelectItem>
              <SelectItem value="full">Full height</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="chat-variant">Appearance</Label>
          <Select
            value={data.variant || 'embedded'}
            onValueChange={(value: 'embedded' | 'card') => 
              onChange({ ...data, variant: value })
            }
          >
            <SelectTrigger id="chat-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="embedded">Embedded</SelectItem>
              <SelectItem value="card">Card with shadow</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="chat-sidebar"
          checked={data.showSidebar || false}
          onCheckedChange={(checked) => onChange({ ...data, showSidebar: checked })}
        />
        <Label htmlFor="chat-sidebar">Show conversation history</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="chat-initial-prompt">Initial message (optional)</Label>
        <Textarea
          id="chat-initial-prompt"
          value={data.initialPrompt || ''}
          onChange={(e) => onChange({ ...data, initialPrompt: e.target.value })}
          placeholder="A predefined question shown as a suggestion..."
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          If provided, this will be shown as a suggestion before the user starts chatting.
        </p>
      </div>
    </div>
  );
}
