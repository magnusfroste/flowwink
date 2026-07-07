import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Calculator, Plus, MoreHorizontal } from 'lucide-react';

type DepMethod = 'straight_line' | 'declining' | 'sum_of_years' | 'units_of_production';

interface FixedAsset {
  id: string;
  name: string;
  description: string | null;
  cost_cents: number;
  salvage_cents: number;
  accumulated_cents: number;
  purchase_date: string;
  in_service_date: string;
  useful_life_months: number;
  depreciation_method: DepMethod;
  declining_rate: number | null;
  status: 'active' | 'fully_depreciated' | 'disposed';
  asset_account: string;
  depreciation_account: string;
  accumulated_account: string;
  disposed_at: string | null;
  disposed_amount_cents: number | null;
  location: string | null;
  parent_asset_id: string | null;
  total_expected_units: number | null;
  units_depreciated: number | null;
}

interface DepreciationEntry {
  id: string;
  asset_id: string;
  period_date: string;
  amount_cents: number;
  journal_entry_id: string | null;
  created_at: string;
}

const fmtSEK = (cents: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format((cents ?? 0) / 100);

const METHOD_LABELS: Record<DepMethod, string> = {
  straight_line: 'Straight line',
  declining: 'Declining balance',
  sum_of_years: 'Sum-of-years digits',
  units_of_production: 'Units of production',
};

export default function FixedAssetsPage() {
  const [tab, setTab] = useState('register');
  const qc = useQueryClient();

  const { data: assets } = useQuery({
    queryKey: ['fixed_assets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_assets' as any)
        .select('*')
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FixedAsset[];
    },
  });

  const { data: entries } = useQuery({
    queryKey: ['depreciation_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('depreciation_entries' as any)
        .select('*')
        .order('period_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as DepreciationEntry[];
    },
  });

  const runDepr = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('run_monthly_depreciation' as any, {});
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data: any) => {
      toast.success(
        `Period ${data?.period}: posted ${data?.processed} assets (${fmtSEK(data?.total_depreciation_cents ?? 0)}), skipped ${data?.skipped}`,
      );
      qc.invalidateQueries({ queryKey: ['fixed_assets'] });
      qc.invalidateQueries({ queryKey: ['depreciation_entries'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const totals = (assets ?? []).reduce(
    (acc, a) => {
      acc.cost += a.cost_cents;
      acc.accum += a.accumulated_cents;
      if (a.status === 'active') acc.activeCount++;
      return acc;
    },
    { cost: 0, accum: 0, activeCount: 0 },
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['fixed_assets'] });
    qc.invalidateQueries({ queryKey: ['depreciation_entries'] });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <AdminPageHeader
            title="Fixed Assets"
            description="Capitalize equipment, run monthly depreciation, dispose at end of life. Posts to BAS 2024."
          />
          <div className="flex gap-2 pt-1">
            <Button onClick={() => runDepr.mutate()} disabled={runDepr.isPending}>
              <Calculator className="mr-2 h-4 w-4" />
              Run this month's depreciation
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Active assets</CardDescription></CardHeader>
            <CardContent className="text-2xl font-semibold">{totals.activeCount}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Total cost</CardDescription></CardHeader>
            <CardContent className="text-2xl font-semibold">{fmtSEK(totals.cost)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Net book value</CardDescription></CardHeader>
            <CardContent className="text-2xl font-semibold">{fmtSEK(totals.cost - totals.accum)}</CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="register">Asset register</TabsTrigger>
            <TabsTrigger value="log">Depreciation log</TabsTrigger>
            <TabsTrigger value="new">Register new</TabsTrigger>
          </TabsList>

          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle>Asset register</CardTitle>
                <CardDescription>Cost, accumulated depreciation, and net book value per asset.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Accum.</TableHead>
                      <TableHead className="text-right">NBV</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(assets ?? []).map((a) => {
                      const parent = a.parent_asset_id ? assets?.find((p) => p.id === a.parent_asset_id) : null;
                      return (
                        <TableRow key={a.id}>
                          <TableCell>
                            <div className="font-medium">{a.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {a.purchase_date} · {a.useful_life_months} mo
                            </div>
                            {parent && (
                              <div className="text-xs text-muted-foreground italic">component of {parent.name}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {METHOD_LABELS[a.depreciation_method] ?? a.depreciation_method}
                            {a.depreciation_method === 'declining' && a.declining_rate
                              ? ` ${(Number(a.declining_rate) * 100).toFixed(0)}%`
                              : ''}
                            {a.depreciation_method === 'units_of_production' && a.total_expected_units
                              ? ` · ${a.units_depreciated ?? 0}/${a.total_expected_units} u`
                              : ''}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{a.location ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono">{fmtSEK(a.cost_cents)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtSEK(a.accumulated_cents)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtSEK(a.cost_cents - a.accumulated_cents)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={a.status === 'active' ? 'default' : 'outline'}
                              className="capitalize"
                            >
                              {a.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <AssetActionsMenu asset={a} allAssets={assets ?? []} onDone={refresh} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!assets || assets.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No fixed assets yet. Switch to "Register new" to add your first asset.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="log">
            <Card>
              <CardHeader>
                <CardTitle>Depreciation log</CardTitle>
                <CardDescription>Last 200 monthly postings.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>JE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(entries ?? []).map((e) => {
                      const asset = assets?.find((a) => a.id === e.asset_id);
                      return (
                        <TableRow key={e.id}>
                          <TableCell>{e.period_date}</TableCell>
                          <TableCell>{asset?.name ?? e.asset_id.slice(0, 8)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtSEK(e.amount_cents)}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {e.journal_entry_id?.slice(0, 8) ?? '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!entries || entries.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No depreciation posted yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="new">
            <RegisterAssetForm
              onSaved={() => {
                refresh();
                setTab('register');
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function RegisterAssetForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [life, setLife] = useState('60');
  const [salvage, setSalvage] = useState('0');
  const [method, setMethod] = useState<DepMethod>('straight_line');
  const [decliningRate, setDecliningRate] = useState('0.30');
  const [totalUnits, setTotalUnits] = useState('');
  const [location, setLocation] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [creditAccount, setCreditAccount] = useState('1930');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const costNum = Math.round(parseFloat(cost) * 100);
    if (!Number.isFinite(costNum) || costNum <= 0) {
      toast.error('Cost must be a positive number');
      return;
    }
    if (method === 'units_of_production' && !(parseInt(totalUnits, 10) > 0)) {
      toast.error('Total expected units is required for units-of-production');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('register_fixed_asset' as any, {
      p_name: name,
      p_cost_cents: costNum,
      p_useful_life_months: parseInt(life, 10),
      p_purchase_date: purchaseDate,
      p_salvage_cents: Math.round(parseFloat(salvage || '0') * 100),
      p_method: method,
      p_declining_rate: method === 'declining' ? parseFloat(decliningRate) : null,
      p_credit_account: creditAccount,
      p_description: description || null,
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    const assetId = (data as any)?.asset_id ?? (data as any)?.id;
    if (assetId && (location || method === 'units_of_production')) {
      const { error: upErr } = await supabase.rpc('update_fixed_asset' as any, {
        p_asset_id: assetId,
        p_location: location || null,
        p_total_expected_units: method === 'units_of_production' ? parseInt(totalUnits, 10) : null,
      });
      if (upErr) toast.error(`Registered, but update failed: ${upErr.message}`);
    }
    setBusy(false);
    toast.success(`Registered "${name}"`);
    setName(''); setDescription(''); setCost(''); setSalvage('0'); setLocation(''); setTotalUnits('');
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register new asset</CardTitle>
        <CardDescription>
          Posts an acquisition journal entry: Dt 1210 (asset) / Cr {creditAccount} (counter-account).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 max-w-2xl">
          <div className="space-y-1">
            <Label>Asset name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder='e.g. "MacBook Pro 16 — Anna"' />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Cost (SEK, ex VAT) *</Label>
              <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Useful life (months) *</Label>
              <Input type="number" value={life} onChange={(e) => setLife(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Salvage value (SEK)</Label>
              <Input type="number" step="0.01" value={salvage} onChange={(e) => setSalvage(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v: DepMethod) => setMethod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="straight_line">Straight line</SelectItem>
                  <SelectItem value="declining">Declining balance</SelectItem>
                  <SelectItem value="sum_of_years">Sum-of-years digits</SelectItem>
                  <SelectItem value="units_of_production">Units of production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {method === 'declining' && (
              <div className="space-y-1">
                <Label>Annual rate (e.g. 0.30)</Label>
                <Input type="number" step="0.01" value={decliningRate} onChange={(e) => setDecliningRate(e.target.value)} />
              </div>
            )}
            {method === 'units_of_production' && (
              <div className="space-y-1">
                <Label>Total expected units *</Label>
                <Input type="number" value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1">
              <Label>Purchase date</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Stockholm HQ / Warehouse 2" />
            </div>
            <div className="space-y-1">
              <Label>Counter-account (1930 = bank, 2440 = vendor bill)</Label>
              <Input value={creditAccount} onChange={(e) => setCreditAccount(e.target.value)} />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={busy}>
              <Plus className="mr-2 h-4 w-4" />
              Register asset
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AssetActionsMenu({
  asset, allAssets, onDone,
}: { asset: FixedAsset; allAssets: FixedAsset[]; onDone: () => void }) {
  const [dialog, setDialog] = useState<null | 'revalue' | 'manual' | 'units' | 'schedule' | 'edit' | 'dispose'>(null);
  const canDispose = asset.status !== 'disposed';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDialog('revalue')}>Revalue / Impair…</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog('manual')}>Manual depreciation…</DropdownMenuItem>
          {asset.depreciation_method === 'units_of_production' && (
            <DropdownMenuItem onClick={() => setDialog('units')}>Post units…</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDialog('schedule')}>Depreciation schedule</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog('edit')}>Edit…</DropdownMenuItem>
          {canDispose && <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setDialog('dispose')} className="text-destructive">Dispose…</DropdownMenuItem>
          </>}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === 'revalue' && <RevalueDialog asset={asset} onClose={() => setDialog(null)} onDone={onDone} />}
      {dialog === 'manual' && <ManualDepDialog asset={asset} onClose={() => setDialog(null)} onDone={onDone} />}
      {dialog === 'units' && <UnitsDepDialog asset={asset} onClose={() => setDialog(null)} onDone={onDone} />}
      {dialog === 'schedule' && <ScheduleDialog asset={asset} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && <EditDialog asset={asset} allAssets={allAssets} onClose={() => setDialog(null)} onDone={onDone} />}
      {dialog === 'dispose' && <DisposeDialog asset={asset} onClose={() => setDialog(null)} onDone={onDone} />}
    </>
  );
}

function RevalueDialog({ asset, onClose, onDone }: { asset: FixedAsset; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState(String(((asset.cost_cents - asset.accumulated_cents) / 100).toFixed(2)));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('revalue_fixed_asset' as any, {
      p_asset_id: asset.id,
      p_new_value_cents: Math.round(parseFloat(value) * 100),
      p_reason: reason || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(`${r?.kind ?? 'Revalued'}: ${fmtSEK(r?.amount_cents ?? 0)}`);
    onClose(); onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Revalue / impair — {asset.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Current NBV: {fmtSEK(asset.cost_cents - asset.accumulated_cents)}</div>
          <div className="space-y-1">
            <Label>New value (SEK)</Label>
            <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Revalue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualDepDialog({ asset, onClose, onDone }: { asset: FixedAsset; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('post_manual_depreciation' as any, {
      p_asset_id: asset.id,
      p_amount_cents: Math.round(parseFloat(amount) * 100),
      p_reason: reason || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Posted ${fmtSEK(Math.round(parseFloat(amount) * 100))}`);
    onClose(); onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Manual depreciation — {asset.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Amount (SEK)</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !amount}>Post</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitsDepDialog({ asset, onClose, onDone }: { asset: FixedAsset; onClose: () => void; onDone: () => void }) {
  const [units, setUnits] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('post_units_depreciation' as any, {
      p_asset_id: asset.id,
      p_units: parseInt(units, 10),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Posted ${units} units`);
    onClose(); onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Post units — {asset.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Used: {asset.units_depreciated ?? 0} / {asset.total_expected_units ?? '—'} units
          </div>
          <div className="space-y-1">
            <Label>Units produced this period</Label>
            <Input type="number" value={units} onChange={(e) => setUnits(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !units}>Post</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ asset, onClose }: { asset: FixedAsset; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dep_schedule', asset.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_depreciation_schedule' as any, { p_asset_id: asset.id });
      if (error) throw error;
      return data as any;
    },
  });
  const schedule: any[] = data?.assets?.[0]?.schedule ?? data?.schedule ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Depreciation schedule — {asset.name}</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6">Loading…</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Accumulated</TableHead>
                  <TableHead className="text-right">NBV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No schedule available.</TableCell></TableRow>
                )}
                {schedule.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.period}</TableCell>
                    <TableCell className="text-right font-mono">{fmtSEK(r.amount_cents)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtSEK(r.accumulated_cents)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtSEK(r.nbv_cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ asset, allAssets, onClose, onDone }: { asset: FixedAsset; allAssets: FixedAsset[]; onClose: () => void; onDone: () => void }) {
  const [location, setLocation] = useState(asset.location ?? '');
  const [parent, setParent] = useState(asset.parent_asset_id ?? '__none__');
  const [totalUnits, setTotalUnits] = useState(asset.total_expected_units ? String(asset.total_expected_units) : '');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('update_fixed_asset' as any, {
      p_asset_id: asset.id,
      p_location: location || null,
      p_parent_asset_id: parent === '__none__' ? null : parent,
      p_total_expected_units: totalUnits ? parseInt(totalUnits, 10) : null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Asset updated');
    onClose(); onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit — {asset.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Parent asset (component of)</Label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {allAssets.filter((a) => a.id !== asset.id).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {asset.depreciation_method === 'units_of_production' && (
            <div className="space-y-1">
              <Label>Total expected units</Label>
              <Input type="number" value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisposeDialog({ asset, onClose, onDone }: { asset: FixedAsset; onClose: () => void; onDone: () => void }) {
  const [sale, setSale] = useState('0');
  const [busy, setBusy] = useState(false);

  const dispose = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('dispose_fixed_asset' as any, {
      p_asset_id: asset.id,
      p_sale_amount_cents: Math.round(parseFloat(sale || '0') * 100),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(`Disposed. NBV ${fmtSEK(r?.nbv_cents ?? 0)}, gain/loss ${fmtSEK(r?.gain_loss_cents ?? 0)}.`);
    onClose(); onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Dispose: {asset.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>Cost: <span className="font-mono">{fmtSEK(asset.cost_cents)}</span></div>
          <div>Accumulated: <span className="font-mono">{fmtSEK(asset.accumulated_cents)}</span></div>
          <div>NBV: <span className="font-mono">{fmtSEK(asset.cost_cents - asset.accumulated_cents)}</span></div>
          <div className="space-y-1 pt-2">
            <Label>Sale proceeds (SEK, 0 for scrap)</Label>
            <Input type="number" step="0.01" value={sale} onChange={(e) => setSale(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={dispose} disabled={busy}>Dispose</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
