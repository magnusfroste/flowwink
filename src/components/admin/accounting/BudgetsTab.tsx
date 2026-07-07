import { useMemo, useState } from 'react';
import { AccountingTabHeader } from './AccountingTabHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  useBudgets,
  useUpsertBudget,
  useDeleteBudget,
  useBudgetVsActual,
  type Budget,
} from '@/hooks/useBudgets';

const fmtSEK = (cents: number | null | undefined) =>
  cents == null
    ? '—'
    : new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 2 })
        .format(cents / 100);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const periodLabel = (m: number | null) => (m == null ? 'Annual' : MONTHS[m - 1] ?? `M${m}`);

interface Draft {
  id?: string;
  account_code: string;
  fiscal_year: string;
  period_month: string; // '' = annual, '1'..'12'
  amount_sek: string;
  currency: string;
}

const emptyDraft = (): Draft => ({
  account_code: '',
  fiscal_year: String(new Date().getFullYear()),
  period_month: '',
  amount_sek: '',
  currency: 'SEK',
});

const toCents = (s: string): number => {
  const n = Number(s.trim().replace(',', '.'));
  return isFinite(n) ? Math.round(n * 100) : 0;
};

export function BudgetsTab() {
  const { data: budgets = [], isLoading } = useBudgets();
  const upsert = useUpsertBudget();
  const del = useDeleteBudget();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const currentYear = new Date().getFullYear();
  const [bvaYear, setBvaYear] = useState<number>(currentYear);
  const [bvaMonth, setBvaMonth] = useState<string>(''); // '' = full year

  const bva = useBudgetVsActual(
    bvaYear,
    bvaMonth === '' ? null : Number(bvaMonth),
  );

  const openCreate = () => {
    setDraft(emptyDraft());
    setOpen(true);
  };
  const openEdit = (b: Budget) => {
    setDraft({
      id: b.id,
      account_code: b.account_code,
      fiscal_year: String(b.fiscal_year),
      period_month: b.period_month == null ? '' : String(b.period_month),
      amount_sek: String(b.amount_cents / 100),
      currency: b.currency || 'SEK',
    });
    setOpen(true);
  };

  const submit = async () => {
    const fy = Number(draft.fiscal_year);
    if (!draft.account_code.trim() || !isFinite(fy) || fy < 1900) return;
    await upsert.mutateAsync({
      p_budget_id: draft.id ?? null,
      p_account_code: draft.account_code.trim(),
      p_fiscal_year: fy,
      p_period_month: draft.period_month === '' ? null : Number(draft.period_month),
      p_amount_cents: toCents(draft.amount_sek),
      p_currency: draft.currency || 'SEK',
    });
    setOpen(false);
  };

  // Group budgets by account_code, sort accounts ascending; within each: fiscal_year desc, annual first then month asc
  const grouped = useMemo(() => {
    const byAcc = new Map<string, Budget[]>();
    for (const b of budgets) {
      const arr = byAcc.get(b.account_code) ?? [];
      arr.push(b);
      byAcc.set(b.account_code, arr);
    }
    return Array.from(byAcc.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rows]) => ({
        code,
        rows: rows.sort((a, b) => {
          if (a.fiscal_year !== b.fiscal_year) return b.fiscal_year - a.fiscal_year;
          const am = a.period_month ?? 0;
          const bm = b.period_month ?? 0;
          return am - bm;
        }),
      }));
  }, [budgets]);

  const varianceClass = (variance: number) =>
    variance > 0
      ? 'text-success'
      : variance < 0
        ? 'text-destructive'
        : 'text-muted-foreground';

  // Year options: current-3 … current+2
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 3 + i);

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Budgets"
        description="Set per-account budgets for the whole fiscal year or a single month. Annual budgets are compared against the full year in Budget vs Actual."
        actions={
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            New budget
          </Button>
        }
      />

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Fiscal year</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : grouped.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No budgets configured yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  grouped.flatMap((g) =>
                    g.rows.map((b, idx) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          {idx === 0 ? (
                            <span className="font-mono font-medium">{g.code}</span>
                          ) : (
                            <span className="font-mono text-muted-foreground">{g.code}</span>
                          )}
                        </TableCell>
                        <TableCell>{b.fiscal_year}</TableCell>
                        <TableCell>
                          {b.period_month == null ? (
                            <Badge variant="secondary">Annual</Badge>
                          ) : (
                            <span>{periodLabel(b.period_month)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmtSEK(b.amount_cents)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{b.currency}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete budget for ${b.account_code} (${b.fiscal_year} ${periodLabel(b.period_month)})?`,
                                  )
                                ) {
                                  del.mutate(b.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )),
                  )
                )}
              </TableBody>
            </Table>
        </div>
      </div>

      <AccountingTabHeader
        title="Budget vs Actual"
        description="Compares budgeted amounts to posted journal activity (Σ debit − credit) per account. Positive variance = under budget, negative = over budget."
      />

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="grid gap-2">
              <Label>Fiscal year</Label>
              <Select value={String(bvaYear)} onValueChange={(v) => setBvaYear(Number(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Period</Label>
              <Select value={bvaMonth || 'all'} onValueChange={(v) => setBvaMonth(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Full year</SelectItem>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bva.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (bva.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No data for the selected period.
                    </TableCell>
                  </TableRow>
                ) : (
                  (bva.data ?? []).map((r) => (
                    <TableRow key={r.account_code}>
                      <TableCell>
                        <span className="font-mono font-medium">{r.account_code}</span>
                        {r.account_name && (
                          <span className="text-muted-foreground ml-2 text-sm">{r.account_name}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtSEK(r.budget_cents)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtSEK(r.actual_cents)}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${varianceClass(r.variance_cents)}`}>
                        {fmtSEK(r.variance_cents)}
                      </TableCell>
                      <TableCell>
                        {r.variance_cents > 0 ? (
                          <span className="text-emerald-600 text-sm">Under budget</span>
                        ) : r.variance_cents < 0 ? (
                          <span className="text-destructive text-sm">Over budget</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">On budget</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit budget' : 'New budget'}</DialogTitle>
            <DialogDescription>
              Choose a period of "Annual" for a full-year budget or a specific month.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bud-acc">Account code</Label>
                <Input
                  id="bud-acc"
                  value={draft.account_code}
                  onChange={(e) => setDraft({ ...draft, account_code: e.target.value })}
                  placeholder="e.g. 3010"
                  className="font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bud-fy">Fiscal year</Label>
                <Input
                  id="bud-fy"
                  type="number"
                  value={draft.fiscal_year}
                  onChange={(e) => setDraft({ ...draft, fiscal_year: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Period</Label>
                <Select
                  value={draft.period_month === '' ? 'annual' : draft.period_month}
                  onValueChange={(v) => setDraft({ ...draft, period_month: v === 'annual' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bud-amt">Amount (SEK)</Label>
                <Input
                  id="bud-amt"
                  type="number"
                  step="0.01"
                  value={draft.amount_sek}
                  onChange={(e) => setDraft({ ...draft, amount_sek: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bud-cur">Currency</Label>
              <Input
                id="bud-cur"
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
                maxLength={3}
                className="w-24 font-mono uppercase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!draft.account_code.trim() || !draft.fiscal_year || upsert.isPending}
            >
              {upsert.isPending ? 'Saving…' : draft.id ? 'Save changes' : 'Create budget'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
