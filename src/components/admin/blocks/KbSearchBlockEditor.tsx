import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface KbSearchBlockData {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  buttonText?: string;
  variant?: 'default' | 'minimal' | 'hero';
  showButton?: boolean;
}

interface KbSearchBlockEditorProps {
  data: KbSearchBlockData;
  onChange: (data: KbSearchBlockData) => void;
}

export function KbSearchBlockEditor({ data, onChange }: KbSearchBlockEditorProps) {
  const updateField = <K extends keyof KbSearchBlockData>(
    field: K,
    value: KbSearchBlockData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Variant</Label>
        <Select
          value={data.variant || 'default'}
          onValueChange={(value) => updateField('variant', value as KbSearchBlockData['variant'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
            <SelectItem value="hero">Hero</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Hero: Large centered with title. Default: With optional title. Minimal: Just search field.
        </p>
      </div>

      {data.variant !== 'minimal' && (
        <>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={data.title || ''}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="How can we help?"
            />
          </div>

          <div className="space-y-2">
            <Label>Subtitle</Label>
            <Input
              value={data.subtitle || ''}
              onChange={(e) => updateField('subtitle', e.target.value)}
              placeholder="Search our knowledge base..."
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>Placeholder</Label>
        <Input
          value={data.placeholder || ''}
          onChange={(e) => updateField('placeholder', e.target.value)}
          placeholder="Search for answers..."
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Show Search Button</Label>
        <Switch
          checked={data.showButton !== false}
          onCheckedChange={(checked) => updateField('showButton', checked)}
        />
      </div>

      {data.showButton !== false && (
        <div className="space-y-2">
          <Label>Button Text</Label>
          <Input
            value={data.buttonText || ''}
            onChange={(e) => updateField('buttonText', e.target.value)}
            placeholder="Search"
          />
        </div>
      )}
    </div>
  );
}
