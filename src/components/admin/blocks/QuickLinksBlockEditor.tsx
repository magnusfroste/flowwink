import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { QuickLinksBlockData, QuickLink } from '@/components/public/blocks/QuickLinksBlock';
import { QuickLinksBlock } from '@/components/public/blocks/QuickLinksBlock';

interface Props {
  data: QuickLinksBlockData;
  isEditing: boolean;
  onChange: (data: QuickLinksBlockData) => void;
}

function uid() {
  return `ql-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function QuickLinksBlockEditor({ data, isEditing, onChange }: Props) {
  const links: QuickLink[] = data.links || [];
  const variant = data.variant || 'dark';
  const layout = data.layout || 'split';

  const update = (patch: Partial<QuickLinksBlockData>) =>
    onChange({ ...data, links, variant, layout, ...patch });

  const updateLink = (idx: number, patch: Partial<QuickLink>) => {
    const next = links.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    update({ links: next });
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= links.length) return;
    const next = [...links];
    [next[idx], next[target]] = [next[target], next[idx]];
    update({ links: next });
  };

  const add = () =>
    update({ links: [...links, { id: uid(), label: 'New link', url: '#' }] });

  const remove = (idx: number) =>
    update({ links: links.filter((_, i) => i !== idx) });

  if (!isEditing) {
    return <QuickLinksBlock data={{ ...data, links, variant, layout }} />;
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <Label>Heading (optional)</Label>
        <Input
          value={data.heading || ''}
          onChange={(e) => update({ heading: e.target.value })}
          placeholder="How can we help you?"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Background variant</Label>
          <Select value={variant} onValueChange={(v) => update({ variant: v as QuickLinksBlockData['variant'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="primary">Primary</SelectItem>
              <SelectItem value="muted">Muted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Layout</Label>
          <Select value={layout} onValueChange={(v) => update({ layout: v as QuickLinksBlockData['layout'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="split">Split (heading left)</SelectItem>
              <SelectItem value="centered">Centered</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Links</Label>
        {links.map((link, idx) => (
          <div key={link.id || idx} className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Link {idx + 1}</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => move(idx, -1)} disabled={idx === 0}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => move(idx, 1)} disabled={idx === links.length - 1}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(idx)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={link.label}
                onChange={(e) => updateLink(idx, { label: e.target.value })}
                placeholder="Label"
              />
              <Input
                value={link.url}
                onChange={(e) => updateLink(idx, { url: e.target.value })}
                placeholder="/path or https://…"
              />
            </div>
          </div>
        ))}
        <Button variant="outline" onClick={add} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add link
        </Button>
      </div>
    </div>
  );
}
