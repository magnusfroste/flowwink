import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  useExpensePolicies,
  useUpsertExpensePolicy,
  useDeleteExpensePolicy,
  type ExpensePolicy,
} from '@/hooks/useExpensePolicies';

const fmtSEK = (cents: number | null | undefined) =>
  cents == null
    ? '—'
    : new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 2 })
        .format(cents / 100);

interface Draft {
  id?: string;
  category: string;
  max_amount_sek: string;
  requires_receipt: boolean;
  requires_approval_over_sek: string;
}

const emptyDraft = (): Draft => ({
  category: '',
  max_amount_sek: '',
  requires_receipt: false,
  requires_approval_over_sek: '',
});

const toCents = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
};

export function ExpensePoliciesTab() {
  const { data: policies = [], isLoading } = useExpensePolicies();
  const upsert = useUpsertExpensePolicy();
  const del = useDeleteExpensePolicy();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const openCreate = () => {
    setDraft(emptyDraft());
    setOpen(true);
  };
  const openEdit = (p: ExpensePolicy) => {
    setDraft({
      id: p.id,
      category: p.category,
      max_amount_sek: p.max_amount_cents != null ? String(p.max_amount_cents / 100) : '',
      requires_receipt: p.requires_receipt,
      requires_approval_over_sek:
        p.requires_approval_over_cents != null ? String(p.requires_approval_over_cents / 100) : '',
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!draft.category.trim()) return;
    await upsert.mutateAsync({
      p_policy_id: draft.id,
      p_category: draft.category.trim(),
      p_max_amount_cents: toCents(draft.max_amount_sek),
      p_requires_receipt: draft.requires_receipt,
      p_requires_approval_over_cents: toCents(draft.requires_approval_over_sek),
    });
    setOpen(false);
  };

  // Sort: baseline "*" first, then alphabetical
  const sorted = [...policies].sort((a, b) => {
    if (a.category === '*') return -1;
    if (b.category === '*') return 1;
    return a.category.localeCompare(b.category);
  });

  return (
    <>
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Expense policies</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Baseline <code className="font-mono">*</code> applies to every category. Per-category
              policies override the baseline for that category only.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New policy
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Max amount</TableHead>
                  <TableHead>Receipt required</TableHead>
                  <TableHead className="text-right">Approval over</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No policies configured — create <code className="font-mono">*</code> for a baseline.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        {p.category === '*' ? (
                          <Badge variant="secondary">All categories (baseline)</Badge>
                        ) : (
                          <span className="font-medium">{p.category}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtSEK(p.max_amount_cents)}
                      </TableCell>
                      <TableCell>
                        {p.requires_receipt ? (
                          <Badge variant="outline">Required</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Optional</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtSEK(p.requires_approval_over_cents)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const label = p.category === '*' ? 'baseline policy' : `policy "${p.category}"`;
                              if (confirm(`Delete ${label}?`)) del.mutate(p.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
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
            <DialogTitle>{draft.id ? 'Edit policy' : 'New policy'}</DialogTitle>
            <DialogDescription>
              Use <code className="font-mono">*</code> as category for the baseline that applies to
              everything. Leave a field empty for no limit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pol-cat">Category</Label>
              <Input
                id="pol-cat"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                placeholder='e.g. travel, meals, or "*" for baseline'
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pol-max">Max amount (SEK)</Label>
                <Input
                  id="pol-max"
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.max_amount_sek}
                  onChange={(e) => setDraft({ ...draft, max_amount_sek: e.target.value })}
                  placeholder="Empty = no cap"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pol-appr">Approval required over (SEK)</Label>
                <Input
                  id="pol-appr"
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.requires_approval_over_sek}
                  onChange={(e) => setDraft({ ...draft, requires_approval_over_sek: e.target.value })}
                  placeholder="Empty = never"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="pol-rec"
                checked={draft.requires_receipt}
                onCheckedChange={(v) => setDraft({ ...draft, requires_receipt: v })}
              />
              <Label htmlFor="pol-rec">Requires receipt</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!draft.category.trim() || upsert.isPending}>
              {upsert.isPending ? 'Saving…' : draft.id ? 'Save changes' : 'Create policy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
