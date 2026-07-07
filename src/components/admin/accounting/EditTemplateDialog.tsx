import { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
  /** when set, sheet opens as "clone" of given template (new id, is_system=false) */
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

/** Editor-local line shape — always canonical debit_pct/credit_pct. */
interface EditorLine {
  account_code: string;
  account_name: string;
  debit_pct: number;
  credit_pct: number;
  description?: string;
}

/** Normalise incoming lines (may carry legacy `type` field) to canonical shape. */
function toEditorLine(l: TemplateLine): EditorLine {
  const debit_pct = typeof l.debit_pct === 'number' ? l.debit_pct : l.type === 'debit' ? 100 : 0;
  const credit_pct = typeof l.credit_pct === 'number' ? l.credit_pct : l.type === 'credit' ? 100 : 0;
  return {
    account_code: l.account_code || '',
    account_name: l.account_name || '',
    debit_pct,
    credit_pct,
    description: l.description || '',
  };
}

export function EditTemplateDialog({ open, onOpenChange, template, cloneFrom }: Props) {
  const { locale } = useAccountingLocale();
  const { data: accounts } = useChartOfAccounts(locale);
  const upsert = useUpsertAccountingTemplate();

  const seed = cloneFrom || template;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [keywords, setKeywords] = useState('');
  const [lines, setLines] = useState<EditorLine[]>([]);

  useEffect(() => {
    if (!open) return;
    if (seed) {
      setName(cloneFrom ? `${seed.template_name} (copy)` : seed.template_name);
      setDescription(seed.description || '');
      setCategory(seed.category || 'general');
      setKeywords((seed.keywords || []).join(', '));
      setLines((seed.template_lines || []).map(toEditorLine));
    } else {
      setName('');
      setDescription('');
      setCategory('general');
      setKeywords('');
      setLines([
        { account_code: '', account_name: '', debit_pct: 100, credit_pct: 0, description: '' },
        { account_code: '', account_name: '', debit_pct: 0, credit_pct: 100, description: '' },
      ]);
    }
  }, [open, seed?.id, cloneFrom?.id]);

  const updateLine = (i: number, patch: Partial<EditorLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const handlePickAccount = (i: number, code: string) => {
    const acc = accounts?.find((a) => a.account_code === code);
    updateLine(i, {
      account_code: code,
      account_name: acc?.account_name || '',
    });
  };

  const setSide = (i: number, side: 'debit' | 'credit') => {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        const active = l.debit_pct > 0 ? l.debit_pct : l.credit_pct > 0 ? l.credit_pct : 100;
        return side === 'debit'
          ? { ...l, debit_pct: active, credit_pct: 0 }
          : { ...l, debit_pct: 0, credit_pct: active };
      }),
    );
  };

  const setPct = (i: number, pct: number) => {
    const safe = Number.isFinite(pct) ? Math.max(0, pct) : 0;
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        const side: 'debit' | 'credit' = l.credit_pct > 0 && l.debit_pct === 0 ? 'credit' : 'debit';
        return side === 'debit'
          ? { ...l, debit_pct: safe, credit_pct: 0 }
          : { ...l, debit_pct: 0, credit_pct: safe };
      }),
    );
  };

  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + (Number(l.debit_pct) || 0), 0);
    const c = lines.reduce((s, l) => s + (Number(l.credit_pct) || 0), 0);
    return { d, c, balanced: d === c };
  }, [lines]);

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
      template_lines: lines
        .filter((l) => l.account_code)
        .map((l) => ({
          account_code: l.account_code,
          account_name: l.account_name,
          debit_pct: Number(l.debit_pct) || 0,
          credit_pct: Number(l.credit_pct) || 0,
          ...(l.description ? { description: l.description } : {}),
        })) as unknown as TemplateLine[],
      locale,
      // Cloning a system template creates a custom user template
      is_system: cloneFrom ? false : template?.is_system ?? false,
    });
    onOpenChange(false);
  };

  const isSystemEdit = !cloneFrom && template?.is_system;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[540px] flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>
            {cloneFrom ? 'Clone template' : template ? 'Edit template' : 'New template'}
          </SheetTitle>
          <SheetDescription>
            Templates pre-fill journal entries when bookkeeping common transactions.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {isSystemEdit && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              This is a system template. Editing is allowed but consider cloning to keep the
              original intact.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-normal">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-normal">Category</Label>
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

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-normal">Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-normal">
              Keywords (comma-separated)
            </Label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="vat, invoice, sek"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground font-normal">Lines</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setLines((p) => [
                    ...p,
                    {
                      account_code: '',
                      account_name: '',
                      debit_pct: 100,
                      credit_pct: 0,
                      description: '',
                    },
                  ])
                }
              >
                <Plus className="h-3 w-3 mr-1" /> Add line
              </Button>
            </div>

            {lines.map((line, i) => {
              const side: 'debit' | 'credit' =
                line.credit_pct > 0 && line.debit_pct === 0 ? 'credit' : 'debit';
              const pct = side === 'debit' ? line.debit_pct : line.credit_pct;
              return (
                <div
                  key={i}
                  className="grid grid-cols-[88px_1fr_72px_auto] gap-2 items-start border rounded p-2"
                >
                  <Select value={side} onValueChange={(v) => setSide(i, v as 'debit' | 'credit')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debit">Debit</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="space-y-1">
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
                    <Input
                      placeholder="Description"
                      value={line.description || ''}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                    />
                    {line.account_name && (
                      <Badge variant="outline" className="text-xs">
                        {line.account_name}
                      </Badge>
                    )}
                  </div>

                  <div className="relative">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="tabular-nums pr-6 text-right"
                      value={Number.isFinite(pct) ? pct : 0}
                      onChange={(e) => setPct(i, Number(e.target.value))}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
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
              );
            })}

            <div
              className={cn(
                'text-xs tabular-nums px-1 pt-1 text-muted-foreground',
                !totals.balanced && 'text-amber-600 dark:text-amber-500',
              )}
            >
              Σ debit % = {totals.d} · Σ credit % = {totals.c}
              {!totals.balanced && ' — unbalanced (save allowed)'}
            </div>
          </div>
        </div>

        <SheetFooter className="px-6 py-4 border-t flex-row justify-end gap-2 sm:space-x-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={upsert.isPending || !name.trim()}>
            {upsert.isPending ? 'Saving...' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
