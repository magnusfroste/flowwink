import { useState } from 'react';
import { homeCurrency, businessToday } from '@/lib/platform-fallbacks';
import {
  useExpenseRates,
  useUpsertExpenseRate,
  useToggleExpenseRate,
  type ExpenseRate,
} from '@/hooks/useExpenseRates';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Gauge } from 'lucide-react';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { currencyOptions } from '@/lib/currency-options';

interface EditorState {
  id?: string;
  code: string;
  kind: 'mileage' | 'per_diem';
  label: string;
  rate_kr: string;   // human-entered kronor (converted to cents on save)
  unit: string;
  currency: string;
  account_code: string;
  valid_from: string;
  active: boolean;
  notes: string;
}

const BLANK: EditorState = {
  code: '',
  kind: 'mileage',
  label: '',
  rate_kr: '',
  unit: 'mil',
  currency: 'SEK',
  account_code: '',
  valid_from: businessToday(),
  active: true,
  notes: '',
};

export function ExpenseRatesTab() {
  const { data: rates, isLoading } = useExpenseRates();
  const upsert = useUpsertExpenseRate();
  const toggle = useToggleExpenseRate();
  const { formatCurrency } = usePlatformFormat();
  const formatRate = (cents: number, currency: string) => formatCurrency(cents, currency);

  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ ...BLANK, currency: homeCurrency() });

  function openCreate() {
    setEditor({ ...BLANK, currency: homeCurrency() });
    setOpen(true);
  }

  function openEdit(r: ExpenseRate) {
    setEditor({
      id: r.id,
      code: r.code,
      kind: r.kind,
      label: r.label,
      rate_kr: (r.rate_cents / 100).toString(),
      unit: r.unit,
      currency: r.currency,
      account_code: r.account_code ?? '',
      valid_from: r.valid_from,
      active: r.active,
      notes: r.notes ?? '',
    });
    setOpen(true);
  }

  function openNewVersion(r: ExpenseRate) {
    // Create a new effective-dated version of the same code
    setEditor({
      code: r.code,
      kind: r.kind,
      label: r.label,
      rate_kr: (r.rate_cents / 100).toString(),
      unit: r.unit,
      currency: r.currency,
      account_code: r.account_code ?? '',
      valid_from: businessToday(),
      active: true,
      notes: '',
    });
    setOpen(true);
  }

  async function handleSave() {
    const kr = parseFloat(editor.rate_kr);
    if (!editor.code.trim() || !editor.label.trim() || isNaN(kr)) return;
    await upsert.mutateAsync({
      id: editor.id,
      code: editor.code.trim(),
      kind: editor.kind,
      label: editor.label.trim(),
      rate_cents: Math.round(kr * 100),
      unit: editor.unit.trim() || 'unit',
      currency: editor.currency,
      account_code: editor.account_code.trim() || null,
      valid_from: editor.valid_from,
      active: editor.active,
      notes: editor.notes.trim() || null,
    });
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Mileage & per-diem rates</h3>
          <p className="text-xs text-muted-foreground">
            Editable schablon rates (Skatteverket). Rates are effective-dated —
            add a new version when the yearly rate changes.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" /> New rate
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Valid from</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Loading rates…
                  </TableCell>
                </TableRow>
              ) : !rates?.length ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Gauge className="h-8 w-8 text-muted-foreground/50" />
                      <p>No rates configured</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{r.code}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.kind === 'mileage' ? 'Mileage' : 'Per diem'}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(r.rate_cents, r.currency)} / {r.unit}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.unit}</TableCell>
                    <TableCell className="text-muted-foreground">{r.account_code ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.valid_from}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={r.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}
                      >
                        {r.active ? 'Active' : 'Archived'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openNewVersion(r)}>
                          + version
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
                        >
                          {r.active ? 'Archive' : 'Restore'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editor.id ? 'Edit rate' : 'New rate'}</DialogTitle>
            <DialogDescription>
              Rates change yearly. Add a new effective-dated version rather than editing
              a historical rate that was already applied to expenses.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input
                  value={editor.code}
                  onChange={(e) => setEditor({ ...editor, code: e.target.value })}
                  placeholder="mileage_car_se"
                  disabled={!!editor.id}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kind</Label>
                <Select
                  value={editor.kind}
                  onValueChange={(v) => setEditor({ ...editor, kind: v as 'mileage' | 'per_diem' })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mileage">Mileage</SelectItem>
                    <SelectItem value="per_diem">Per diem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={editor.label}
                onChange={(e) => setEditor({ ...editor, label: e.target.value })}
                placeholder="Milersättning – egen bil i tjänst"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Rate ({editor.currency})</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={editor.rate_kr}
                  onChange={(e) => setEditor({ ...editor, rate_kr: e.target.value })}
                  placeholder="25.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input
                  value={editor.unit}
                  onChange={(e) => setEditor({ ...editor, unit: e.target.value })}
                  placeholder="mil / km / day"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={editor.currency} onValueChange={(v) => setEditor({ ...editor, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyOptions(editor.currency).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Account (BAS)</Label>
                <Input
                  value={editor.account_code}
                  onChange={(e) => setEditor({ ...editor, account_code: e.target.value })}
                  placeholder="7331 / 7321"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valid from</Label>
                <Input
                  type="date"
                  value={editor.valid_from}
                  onChange={(e) => setEditor({ ...editor, valid_from: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={editor.notes}
                onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                rows={2}
                placeholder="Optional context (e.g. Skattefri schablon)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : 'Save rate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
