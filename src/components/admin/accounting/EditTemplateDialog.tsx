import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useUpsertAccountingTemplate,
  type AccountingTemplate,
  type TemplateLine,
  useChartOfAccounts,
} from '@/hooks/useAccounting';
import { useAccountingLocale } from '@/hooks/useAccountingLocale';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template?: AccountingTemplate | null;
  /** when set, dialog opens as "clone" of given template (new id, is_system=false) */
  cloneFrom?: AccountingTemplate | null;
}

const CATEGORIES = [
  'sales',
  'purchases',
  'payroll',
  'expenses',
  'depreciation',
  'tax',
  'bank',
  'premises',
  'year_end',
  'general',
];

export function EditTemplateDialog({ open, onOpenChange, template, cloneFrom }: Props) {
  const { locale } = useAccountingLocale();
  const { data: accounts } = useChartOfAccounts(locale);
  const upsert = useUpsertAccountingTemplate();

  const seed = cloneFrom || template;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [keywords, setKeywords] = useState('');
  const [lines, setLines] = useState<TemplateLine[]>([]);

  useEffect(() => {
    if (!open) return;
    if (seed) {
      setName(cloneFrom ? `${seed.template_name} (copy)` : seed.template_name);
      setDescription(seed.description || '');
      setCategory(seed.category || 'general');
      setKeywords((seed.keywords || []).join(', '));
      setLines(seed.template_lines || []);
    } else {
      setName('');
      setDescription('');
      setCategory('general');
      setKeywords('');
      setLines([
        { type: 'debit', account_code: '', account_name: '', description: '' },
        { type: 'credit', account_code: '', account_name: '', description: '' },
      ]);
    }
  }, [open, seed?.id, cloneFrom?.id]);

  const updateLine = (i: number, patch: Partial<TemplateLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const handlePickAccount = (i: number, code: string) => {
    const acc = accounts?.find((a) => a.account_code === code);
    updateLine(i, {
      account_code: code,
      account_name: acc?.account_name || '',
    });
  };

  const handleSave = async () => {
    if (!name.trim() || lines.length === 0) return;
    await upsert.mutateAsync({
      id: cloneFrom ? undefined : template?.id,
      template_name: name.trim(),
      description: description.trim(),
      category,
      keywords: keywords
        ? keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : null,
      template_lines: lines.filter((l) => l.account_code),
      locale,
      // Cloning a system template creates a custom user template
      is_system: cloneFrom ? false : template?.is_system ?? false,
    });
    onOpenChange(false);
  };

  const isSystemEdit = !cloneFrom && template?.is_system;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {cloneFrom
              ? 'Clone template'
              : template
              ? 'Edit template'
              : 'New template'}
          </DialogTitle>
          <DialogDescription>
            Templates pre-fill journal entries when bookkeeping common transactions.
          </DialogDescription>
        </DialogHeader>

        {isSystemEdit && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            This is a system template. Editing is allowed but consider cloning to keep the
            original intact.
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Label>Keywords (comma-separated)</Label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="vat, invoice, sek"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lines</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setLines((p) => [
                    ...p,
                    { type: 'debit', account_code: '', account_name: '', description: '' },
                  ])
                }
              >
                <Plus className="h-3 w-3 mr-1" /> Add line
              </Button>
            </div>

            {lines.map((line, i) => (
              <div
                key={i}
                className="grid grid-cols-[80px_140px_1fr_auto] gap-2 items-start border rounded p-2"
              >
                <Select
                  value={line.type}
                  onValueChange={(v) => updateLine(i, { type: v as 'debit' | 'credit' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={line.account_code}
                  onValueChange={(v) => handlePickAccount(i, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {accounts?.map((a) => (
                      <SelectItem key={a.account_code} value={a.account_code}>
                        {a.account_code} — {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="space-y-1">
                  <Input
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                  />
                  {line.account_name && (
                    <Badge variant="outline" className="text-xs">
                      {line.account_name}
                    </Badge>
                  )}
                </div>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={upsert.isPending || !name.trim()}>
            {upsert.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
