import { useState } from 'react';
import { homeCurrency, businessToday } from '@/lib/platform-fallbacks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw, Plus, Calculator } from 'lucide-react';

interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_base: boolean;
  enabled: boolean;
}

interface ExchangeRate {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  rate_date: string;
  source: string;
}

export default function CurrenciesPage() {
  const [tab, setTab] = useState('rates');
  const qc = useQueryClient();

  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('currencies' as any)
        .select('*')
        .order('is_base', { ascending: false })
        .order('code');
      if (error) throw error;
      return (data ?? []) as unknown as Currency[];
    },
  });

  const { data: rates } = useQuery({
    queryKey: ['exchange_rates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exchange_rates' as any)
        .select('*')
        .order('rate_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as ExchangeRate[];
    },
  });

  const fetchEcb = useMutation({
    mutationFn: async () => {
      return await callSkill('fetch_ecb_rates');
    },
    onSuccess: (data: any) => {
      toast.success(`Imported ${data?.rows_upserted ?? 0} rates from ECB`);
      qc.invalidateQueries({ queryKey: ['exchange_rates'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revalue = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('revalue_open_balances' as any, {});
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data: any) => {
      toast.success(
        `Revaluation done — gain ${data?.total_gain ?? 0}, loss ${data?.total_loss ?? 0}`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <AdminPageHeader
            title="Currencies & FX"
            description="Sell and bill in multiple currencies. Daily ECB rates and FX revaluation of open AR/AP."
          />
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => fetchEcb.mutate()}
              disabled={fetchEcb.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Fetch ECB rates
            </Button>
            <Button onClick={() => revalue.mutate()} disabled={revalue.isPending}>
              <Calculator className="mr-2 h-4 w-4" />
              Revalue open balances
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="rates">Exchange rates</TabsTrigger>
            <TabsTrigger value="currencies">Currencies</TabsTrigger>
            <TabsTrigger value="manual">Manual rate</TabsTrigger>
          </TabsList>

          <TabsContent value="rates">
            <Card>
              <CardHeader>
                <CardTitle>Recent rates</CardTitle>
                <CardDescription>Latest 200 entries — newest first</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Quote</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rates ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.rate_date}</TableCell>
                        <TableCell>{r.base_currency}</TableCell>
                        <TableCell>{r.quote_currency}</TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(r.rate).toFixed(6)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.source}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!rates || rates.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No rates yet — click "Fetch ECB rates" to import today's reference rates.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="currencies">
            <Card>
              <CardHeader>
                <CardTitle>Currency catalog</CardTitle>
                <CardDescription>
                  The base currency is what your books are kept in. Only one base allowed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Decimals</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(currencies ?? []).map((c) => (
                      <TableRow key={c.code}>
                        <TableCell className="font-mono">{c.code}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.symbol}</TableCell>
                        <TableCell>{c.decimals}</TableCell>
                        <TableCell>
                          {c.is_base ? <Badge>Base</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {c.enabled ? <Badge variant="outline">Yes</Badge> : <span className="text-muted-foreground">No</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manual">
            <ManualRateForm
              currencies={currencies ?? []}
              onSaved={() => qc.invalidateQueries({ queryKey: ['exchange_rates'] })}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function ManualRateForm({
  currencies,
  onSaved,
}: {
  currencies: Currency[];
  onSaved: () => void;
}) {
  const base = currencies.find((c) => c.is_base)?.code ?? homeCurrency();
  const [baseCode, setBaseCode] = useState(base);
  // The other side of a rate: not the business's own currency.
  const [quoteCode, setQuoteCode] = useState(() => (homeCurrency() === 'EUR' ? 'USD' : 'EUR'));
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(businessToday());
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = parseFloat(rate);
    if (!Number.isFinite(r) || r <= 0) {
      toast.error('Rate must be a positive number');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('set_exchange_rate' as any, {
      p_base: baseCode,
      p_quote: quoteCode,
      p_rate: r,
      p_rate_date: date,
      p_source: 'manual',
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Saved ${baseCode}→${quoteCode} = ${r}`);
    setRate('');
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual exchange rate</CardTitle>
        <CardDescription>
          Override or pin a rate (e.g. for a long-term contract).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 max-w-xl">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Base currency</Label>
              <Select value={baseCode} onValueChange={setBaseCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Quote currency</Label>
              <Select value={quoteCode} onValueChange={setQuoteCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Rate (1 base → quote)</Label>
              <Input
                type="number"
                step="0.000001"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="e.g. 0.087"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={busy}>
              <Plus className="mr-2 h-4 w-4" />
              Save rate
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
