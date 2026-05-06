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
import { toast } from 'sonner';
import { Calculator, Plus, Trash2 } from 'lucide-react';

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
  depreciation_method: 'straight_line' | 'declining';
  declining_rate: number | null;
  status: 'active' | 'fully_depreciated' | 'disposed';
  asset_account: string;
  depreciation_account: string;
  accumulated_account: string;
  disposed_at: string | null;
  disposed_amount_cents: number | null;
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
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Accum.</TableHead>
                      <TableHead className="text-right">NBV</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(assets ?? []).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="font-medium">{a.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.purchase_date} · {a.useful_life_months} mo
                          </div>
                        </TableCell>
                        <TableCell className="capitalize text-sm">
                          {a.depreciation_method.replace('_', ' ')}
                          {a.depreciation_method === 'declining' && a.declining_rate
                            ? ` ${(Number(a.declining_rate) * 100).toFixed(0)}%`
                            : ''}
                        </TableCell>
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
                          {a.status !== 'disposed' && <DisposeDialog asset={a} onDone={() => {
                            qc.invalidateQueries({ queryKey: ['fixed_assets'] });
                            qc.invalidateQueries({ queryKey: ['depreciation_entries'] });
                          }} />}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!assets || assets.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                qc.invalidateQueries({ queryKey: ['fixed_assets'] });
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
  const [method, setMethod] = useState<'straight_line' | 'declining'>('straight_line');
  const [decliningRate, setDecliningRate] = useState('0.30');
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
    setBusy(true);
    const { error } = await supabase.rpc('register_fixed_asset' as any, {
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
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Registered "${name}"`);
    setName(''); setDescription(''); setCost(''); setSalvage('0');
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register new asset</CardTitle>
        <CardDescription>
          Posts an acquisition journal entry: Dt {1210} (asset) / Cr {creditAccount} (counter-account).
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
              <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="straight_line">Straight line</SelectItem>
                  <SelectItem value="declining">Declining balance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {method === 'declining' && (
              <div className="space-y-1">
                <Label>Annual rate (e.g. 0.30)</Label>
                <Input type="number" step="0.01" value={decliningRate} onChange={(e) => setDecliningRate(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Purchase date</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Counter-account (1930 = bank, 2440 = vendor bill)</Label>
            <Input value={creditAccount} onChange={(e) => setCreditAccount(e.target.value)} />
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

function DisposeDialog({ asset, onDone }: { asset: FixedAsset; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [sale, setSale] = useState('0');
  const [busy, setBusy] = useState(false);

  const dispose = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('dispose_fixed_asset' as any, {
      p_asset_id: asset.id,
      p_sale_amount_cents: Math.round(parseFloat(sale || '0') * 100),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = data as any;
    toast.success(
      `Disposed. NBV ${fmtSEK(r?.nbv_cents ?? 0)}, gain/loss ${fmtSEK(r?.gain_loss_cents ?? 0)}.`,
    );
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispose: {asset.name}</DialogTitle>
        </DialogHeader>
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
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={dispose} disabled={busy}>Dispose</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
