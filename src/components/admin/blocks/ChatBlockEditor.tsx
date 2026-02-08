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
  // Preview mode — mock chat UI matching public ChatBlock
  if (!isEditing) {
    const heightMap = { sm: 'h-[160px]', md: 'h-[220px]', lg: 'h-[280px]', full: 'h-[280px]' };
    const h = heightMap[data.height || 'md'];
    const isCard = data.variant === 'card';

    const chatMockup = (
      <div className={`${h} flex flex-col rounded-lg overflow-hidden border bg-background`}>
        {/* Messages area */}
        <div className="flex-1 p-3 space-y-2 overflow-hidden">
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-1.5 max-w-[70%]">
              <p className="text-[11px] text-muted-foreground">
                {data.initialPrompt || 'Hi! How can I help you today?'}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <div className="bg-primary/10 rounded-lg px-3 py-1.5 max-w-[70%]">
              <p className="text-[11px] text-muted-foreground">Tell me more about your services</p>
            </div>
          </div>
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-1.5 max-w-[70%]">
              <p className="text-[11px] text-muted-foreground">Of course! We offer a wide range of...</p>
            </div>
          </div>
        </div>
        {/* Input area */}
        <div className="border-t p-2 flex gap-2">
          <div className="flex-1 h-8 rounded-md border border-input bg-background px-3 flex items-center">
            <span className="text-[11px] text-muted-foreground">Type a message...</span>
          </div>
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <MessageSquare className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
        </div>
      </div>
    );

    if (isCard) {
      return (
        <div className="py-6">
          <div className="max-w-lg mx-auto">
            {data.title && (
              <h3 className="text-xl font-serif font-semibold text-center mb-4">{data.title}</h3>
            )}
            <div className="rounded-xl shadow-lg overflow-hidden border">
              {chatMockup}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="py-6">
        <div className="max-w-lg mx-auto">
          {data.title && (
            <h3 className="text-xl font-serif font-semibold text-center mb-4">{data.title}</h3>
          )}
          {chatMockup}
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
