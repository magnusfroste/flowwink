import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import {
  useShippingRates,
  useCarriersList,
  useCreateShippingRate,
  useUpdateShippingRate,
  useDeleteShippingRate,
  calcShippingRate,
  type ShippingRate,
  type CalcRateResult,
} from '@/hooks/useShippingRates';

const fmtSEK = (cents: number | null | undefined, currency = 'SEK') =>
  cents == null
    ? '—'
    : new Intl.NumberFormat('sv-SE', { style: 'currency', currency, maximumFractionDigits: 2 })
        .format(cents / 100);

const toCents = (s: string): number => {
  const n = Number(s.trim().replace(',', '.'));
  return isFinite(n) ? Math.round(n * 100) : 0;
};

const toNumOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return isFinite(n) ? n : null;
};

interface Draft {
  id?: string;
  carrier_id: string;
  name: string;
  min_weight_grams: string;
  max_weight_grams: string; // '' = no upper bound
  price_sek: string;
  currency: string;
  dim_divisor: string;
}

const emptyDraft = (carrierId = ''): Draft => ({
  carrier_id: carrierId,
  name: '',
  min_weight_grams: '0',
  max_weight_grams: '',
  price_sek: '',
  currency: 'SEK',
  dim_divisor: '',
});

export function ShippingRatesPanel() {
  const { data: rates = [], isLoading } = useShippingRates();
  const { data: carriers = [] } = useCarriersList();
  const create = useCreateShippingRate();
  const update = useUpdateShippingRate();
  const del = useDeleteShippingRate();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const carrierName = (id: string) =>
    carriers.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  const grouped = useMemo(() => {
    const byCarrier = new Map<string, ShippingRate[]>();
    for (const r of rates) {
      const arr = byCarrier.get(r.carrier_id) ?? [];
      arr.push(r);
      byCarrier.set(r.carrier_id, arr);
    }
    return Array.from(byCarrier.entries())
      .sort(([a], [b]) => carrierName(a).localeCompare(carrierName(b)))
      .map(([carrier_id, rows]) => ({
        carrier_id,
        rows: rows.sort((a, b) => a.min_weight_grams - b.min_weight_grams),
      }));
  }, [rates, carriers]);

  const openCreate = () => {
    setDraft(emptyDraft(carriers[0]?.id ?? ''));
    setOpen(true);
  };
  const openEdit = (r: ShippingRate) => {
    setDraft({
      id: r.id,
      carrier_id: r.carrier_id,
      name: r.name,
      min_weight_grams: String(r.min_weight_grams),
      max_weight_grams: r.max_weight_grams == null ? '' : String(r.max_weight_grams),
      price_sek: String(r.price_cents / 100),
      currency: r.currency || 'SEK',
      dim_divisor: r.dim_divisor == null ? '' : String(r.dim_divisor),
    });
    setOpen(true);
  };

  const canSubmit =
    !!draft.carrier_id &&
    !!draft.name.trim() &&
    draft.min_weight_grams.trim() !== '' &&
    draft.price_sek.trim() !== '';

  const submit = async () => {
    if (!canSubmit) return;
    const payload = {
      p_carrier_id: draft.carrier_id,
      p_name: draft.name.trim(),
      p_min_weight_grams: Number(draft.min_weight_grams),
      p_max_weight_grams:
        draft.max_weight_grams.trim() === '' ? null : Number(draft.max_weight_grams),
      p_price_cents: toCents(draft.price_sek),
      p_currency: draft.currency || 'SEK',
      p_dim_divisor: toNumOrNull(draft.dim_divisor),
    };
    if (draft.id) {
      await update.mutateAsync({ p_rate_id: draft.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    setOpen(false);
  };

  // --- Rate calculator ---
  const [calcCarrier, setCalcCarrier] = useState('');
  const [calcWeight, setCalcWeight] = useState('');
  const [calcL, setCalcL] = useState('');
  const [calcW, setCalcW] = useState('');
  const [calcH, setCalcH] = useState('');
  const [calcResult, setCalcResult] = useState<CalcRateResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  const runCalc = async () => {
    if (!calcCarrier || !calcWeight.trim()) return;
    setCalcLoading(true);
    setCalcResult(null);
    try {
      const r = await calcShippingRate({
        p_carrier_id: calcCarrier,
        p_weight_grams: Number(calcWeight),
        p_length_cm: toNumOrNull(calcL),
        p_width_cm: toNumOrNull(calcW),
        p_height_cm: toNumOrNull(calcH),
      });
      setCalcResult(r);
    } catch (e: any) {
      toast.error(e?.message ?? 'Calculation failed');
    } finally {
      setCalcLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Shipping rates</CardTitle>
            <CardDescription>
              Weight bands per carrier (min–max grams → price). Empty max = no upper bound.
            </CardDescription>
          </div>
          <Button onClick={openCreate} disabled={carriers.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            New rate
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No shipping rates configured yet.
            </p>
          ) : (
            <div className="space-y-6">
              {grouped.map((g) => (
                <div key={g.carrier_id}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold">{carrierName(g.carrier_id)}</h3>
                    <Badge variant="outline" className="text-xs">
                      {g.rows.length} band{g.rows.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Min (g)</TableHead>
                          <TableHead className="text-right">Max (g)</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Dim divisor</TableHead>
                          <TableHead className="w-24" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {r.min_weight_grams}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {r.max_weight_grams == null ? (
                                <span className="text-muted-foreground">∞</span>
                              ) : (
                                r.max_weight_grams
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {fmtSEK(r.price_cents, r.currency)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {r.dim_divisor ?? '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm(`Delete rate "${r.name}"?`)) del.mutate(r.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" /> Rate calculator
          </CardTitle>
          <CardDescription>
            Bills on the greater of actual weight and dimensional weight
            (L×W×H cm ÷ divisor × 1000). Provide all three dimensions to trigger
            dimensional-weight billing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2 grid gap-2">
              <Label>Carrier</Label>
              <Select value={calcCarrier} onValueChange={setCalcCarrier}>
                <SelectTrigger>
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  {carriers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Weight (g)</Label>
              <Input
                type="number" min="0" value={calcWeight}
                onChange={(e) => setCalcWeight(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>L (cm)</Label>
              <Input type="number" min="0" value={calcL} onChange={(e) => setCalcL(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>W (cm)</Label>
              <Input type="number" min="0" value={calcW} onChange={(e) => setCalcW(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>H (cm)</Label>
              <Input type="number" min="0" value={calcH} onChange={(e) => setCalcH(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={runCalc}
              disabled={!calcCarrier || !calcWeight.trim() || calcLoading}
            >
              {calcLoading ? 'Calculating…' : 'Calculate'}
            </Button>
          </div>
          {calcResult && (
            <div className="rounded-lg border p-4">
              {calcResult.success === false ? (
                <p className="text-destructive text-sm">
                  No matching rate — {calcResult.reason ?? 'weight outside all bands'}.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Price</div>
                    <div className="text-xl font-semibold font-mono">
                      {fmtSEK(calcResult.price_cents, calcResult.currency || 'SEK')}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Billable weight</div>
                    <div className="text-xl font-semibold font-mono">
                      {calcResult.billable_grams ?? '—'} g
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Billed on</div>
                    <div className="text-xl font-semibold">
                      {calcResult.billed_on === 'dimensional' ? (
                        <Badge className="text-sm">Dimensional</Badge>
                      ) : (
                        <Badge variant="outline" className="text-sm">Actual</Badge>
                      )}
                    </div>
                  </div>
                  {calcResult.matched_rate_name && (
                    <div>
                      <div className="text-xs text-muted-foreground">Matched band</div>
                      <div className="text-sm font-medium mt-1">{calcResult.matched_rate_name}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit shipping rate' : 'New shipping rate'}</DialogTitle>
            <DialogDescription>
              A weight band matches when min ≤ weight ≤ max. Leave max empty for the top band.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Carrier</Label>
              <Select
                value={draft.carrier_id}
                onValueChange={(v) => setDraft({ ...draft, carrier_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  {carriers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rate-name">Name</Label>
              <Input
                id="rate-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Small parcel"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Min weight (g)</Label>
                <Input
                  type="number" min="0"
                  value={draft.min_weight_grams}
                  onChange={(e) => setDraft({ ...draft, min_weight_grams: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Max weight (g)</Label>
                <Input
                  type="number" min="0"
                  value={draft.max_weight_grams}
                  onChange={(e) => setDraft({ ...draft, max_weight_grams: e.target.value })}
                  placeholder="Empty = no upper bound"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 grid gap-2">
                <Label>Price (SEK)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={draft.price_sek}
                  onChange={(e) => setDraft({ ...draft, price_sek: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <Input
                  value={draft.currency}
                  onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
                  maxLength={3}
                  className="font-mono uppercase"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Dim divisor (cm³/kg)</Label>
              <Input
                type="number" min="0"
                value={draft.dim_divisor}
                onChange={(e) => setDraft({ ...draft, dim_divisor: e.target.value })}
                placeholder="Empty = carrier default (usually 5000)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={!canSubmit || create.isPending || update.isPending}
            >
              {create.isPending || update.isPending
                ? 'Saving…'
                : draft.id ? 'Save changes' : 'Create rate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
