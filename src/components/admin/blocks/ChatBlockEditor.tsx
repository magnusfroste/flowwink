import { ChatBlockData } from '@/types/cms';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface ChatBlockEditorProps {
  data: ChatBlockData;
  onChange: (data: ChatBlockData) => void;
}

export function ChatBlockEditor({ data, onChange }: ChatBlockEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="chat-title">Rubrik (valfri)</Label>
        <Input
          id="chat-title"
          value={data.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="t.ex. Fråga vår AI-assistent"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="chat-height">Höjd</Label>
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
              <SelectItem value="sm">Liten (300px)</SelectItem>
              <SelectItem value="md">Medium (450px)</SelectItem>
              <SelectItem value="lg">Stor (600px)</SelectItem>
              <SelectItem value="full">Fullhöjd</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="chat-variant">Utseende</Label>
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
              <SelectItem value="embedded">Inbäddad</SelectItem>
              <SelectItem value="card">Kort med skugga</SelectItem>
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
        <Label htmlFor="chat-sidebar">Visa konversationshistorik</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="chat-initial-prompt">Startmeddelande (valfri)</Label>
        <Textarea
          id="chat-initial-prompt"
          value={data.initialPrompt || ''}
          onChange={(e) => onChange({ ...data, initialPrompt: e.target.value })}
          placeholder="En fördefinierad fråga som visas som förslag..."
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Om angivet visas detta som ett förslag innan användaren börjar chatta.
        </p>
      </div>
    </div>
  );
}
