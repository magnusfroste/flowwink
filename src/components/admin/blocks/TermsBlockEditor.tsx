import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { TermsBlock } from '@/components/public/blocks/TermsBlock';
import type { TermsBlockData } from '@/components/public/blocks/TermsBlock';

interface TermsBlockEditorProps {
  data: TermsBlockData;
  onChange: (data: TermsBlockData) => void;
  isEditing?: boolean;
}

export function TermsBlockEditor({ data, onChange, isEditing }: TermsBlockEditorProps) {
  if (!isEditing) {
    return <TermsBlock data={data} />;
  }

  const handleChange = (field: keyof TermsBlockData, value: unknown) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="terms-title">Title</Label>
        <Input
          id="terms-title"
          value={data.title || ''}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Contract terms"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="terms-subtitle">Subtitle</Label>
        <Input
          id="terms-subtitle"
          value={data.subtitle || ''}
          onChange={(e) => handleChange('subtitle', e.target.value)}
          placeholder="The terms versions our agreements refer to are published here."
        />
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label>Allow save as PDF</Label>
          <p className="text-xs text-muted-foreground">
            Each document gets a print-friendly copy with a version stamp.
          </p>
        </div>
        <Switch
          checked={data.showPrint ?? true}
          onCheckedChange={(v) => handleChange('showPrint', v)}
        />
      </div>
      <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/40">
        The block lists every contract template marked <span className="font-medium">public</span> under
        Contracts → Templates. Publishing and versioning happen there — this block is only the surface.
        Remember to point <span className="font-mono">Terms page slug</span> in Site Settings at the page
        holding this block, so generated agreements link here.
      </p>
    </div>
  );
}
