import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HandbookBlock } from '@/components/public/blocks/HandbookBlock';
import type { HandbookBlockData } from '@/components/public/blocks/HandbookBlock';

interface HandbookBlockEditorProps {
  data: HandbookBlockData;
  onChange: (data: HandbookBlockData) => void;
  isEditing: boolean;
}

export function HandbookBlockEditor({ data, onChange, isEditing }: HandbookBlockEditorProps) {
  if (!isEditing) {
    return <HandbookBlock data={data} />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={data.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="Handbook"
        />
      </div>

      <div className="space-y-2">
        <Label>Subtitle</Label>
        <Input
          value={data.subtitle || ''}
          onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
          placeholder="Optional description"
        />
      </div>

      <div className="space-y-2">
        <Label>Layout</Label>
        <Select
          value={data.layout || 'sidebar'}
          onValueChange={(v) => onChange({ ...data, layout: v as 'sidebar' | 'accordion' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sidebar">Sidebar + Reader</SelectItem>
            <SelectItem value="accordion">Accordion</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label>Show Search</Label>
        <Switch
          checked={data.showSearch !== false}
          onCheckedChange={(v) => onChange({ ...data, showSearch: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Show Table of Contents</Label>
        <Switch
          checked={data.showToc !== false}
          onCheckedChange={(v) => onChange({ ...data, showToc: v })}
        />
      </div>

      <div className="space-y-2">
        <Label>Max Chapters (0 = all)</Label>
        <Input
          type="number"
          value={data.maxChapters || 0}
          onChange={(e) => onChange({ ...data, maxChapters: parseInt(e.target.value) || undefined })}
          min={0}
        />
      </div>
    </div>
  );
}
