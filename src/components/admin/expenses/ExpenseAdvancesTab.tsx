import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/ui/money-input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useExpenseAdvance, useExpenseAdvances, useGrantExpenseAdvance, useRepayExpenseAdvance, type ExpenseAdvance } from '@/hooks/useExpenseAdvances';

interface ProfileRow { id: string; email: string | null; full_name: string | null }

function useProfilesForAdvances() {
  return useQuery({
    queryKey: ['profiles', 'advance-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .order('full_name', { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });
}

export function ExpenseAdvancesTab() {
  const { formatCurrency } = usePlatformFormat();
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | 'all'>('open');
  const { data, isLoading } = useExpenseAdvances(statusFilter === 'all' ? undefined : statusFilter);
  const { data: profiles } = useProfilesForAdvances();
  const grant = useGrantExpenseAdvance();
  const repay = useRepayExpenseAdvance();

  const [grantOpen, setGrantOpen] = useState(false);
  const [form, setForm] = useState({ user_id: '', amount_cents: 0, purpose: '', method: 'bankgiro', reference: '' });
  const [repaying, setRepaying] = useState<ExpenseAdvance | null>(null);
  const [repayCents, setRepayCents] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useExpenseAdvance(detailId);

  const submitGrant = async () => {
    try {
      await grant.mutateAsync({ p_user_id: form.user_id, p_amount_cents: form.amount_cents, p_purpose: form.purpose || null, p_method: form.method || null, p_reference: form.reference || null });
      setGrantOpen(false);
      setForm({ user_id: '', amount_cents: 0, purpose: '', method: 'bankgiro', reference: '' });
    } catch { /* toast in hook */ }
  };
  const submitRepay = async () => {
    if (!repaying) return;
    try {
      await repay.mutateAsync({ p_advance_id: repaying.id, p_amount_cents: repayCents > 0 ? repayCents : null });
      setRepaying(null);
    } catch { /* toast in hook */ }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Expense advances</CardTitle>
            <CardDescription>
              Money paid out before a trip. It is settled against the employee's next booked expense report; the payout is only what the advance did not cover.
              {data && <> Open right now: <span className="font-medium text-foreground">{formatCurrency(data.open_cents, undefined, { maximumFractionDigits: 0 })}</span>.</>}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'open' | 'closed' | 'all')}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> Grant advance</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Grant an expense advance</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Employee</Label>
                    <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        {profiles?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id.slice(0, 8)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Amount</Label>
                      <MoneyInput value={form.amount_cents} onChange={(c) => setForm({ ...form, amount_cents: c })} step="1" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Paid via</Label>
                      <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bankgiro">Bankgiro</SelectItem>
                          <SelectItem value="swish">Swish</SelectItem>
                          <SelectItem value="sepa">SEPA</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Purpose</Label>
                    <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Conference trip Oslo" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bank reference (optional)</Label>
                    <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                  </div>
                  <p className="text-xs text-muted-foreground">Books the payout (employee advance / bank) and opens the advance. It settles itself when the employee's next expense report is booked.</p>
                </div>
                <DialogFooter>
                  <Button onClick={submitGrant} disabled={!form.user_id || form.amount_cents <= 0 || grant.isPending}>Pay out and book</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !data?.advances.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No {statusFilter === 'all' ? '' : statusFilter} advances.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Settled</TableHead>
                  <TableHead className="text-right">Repaid</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.advances.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => setDetailId(a.id)}>
                    <TableCell className="font-medium">{a.employee_name ?? a.user_id.slice(0, 8) + '…'}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(a.granted_at), 'yyyy-MM-dd')}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{a.purpose ?? '—'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(a.amount_cents, a.currency, { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(a.settled_cents, a.currency, { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(a.repaid_cents, a.currency, { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(a.remaining_cents, a.currency, { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell><Badge variant={a.status === 'open' ? 'default' : 'outline'}>{a.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {a.status === 'open' && (
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setRepaying(a); setRepayCents(a.remaining_cents); }}>Repay</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!repaying} onOpenChange={(o) => !o && setRepaying(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record a repayment</DialogTitle></DialogHeader>
          {repaying && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {repaying.employee_name ?? 'The employee'} holds {formatCurrency(repaying.remaining_cents, repaying.currency, { maximumFractionDigits: 0 })} of this advance that no report has used.
              </p>
              <div className="space-y-1.5">
                <Label>Amount paid back</Label>
                <MoneyInput value={repayCents} onChange={setRepayCents} step="1" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={submitRepay} disabled={repayCents <= 0 || repay.isPending}>Book repayment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Advance</DialogTitle></DialogHeader>
          {detail.data ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium">{formatCurrency(detail.data.advance.amount_cents, detail.data.advance.currency, { maximumFractionDigits: 0 })}</span>
                {detail.data.advance.purpose && <> · {detail.data.advance.purpose}</>}
                {' '}· granted {format(new Date(detail.data.advance.granted_at), 'yyyy-MM-dd')}
                {detail.data.advance.method && <> via {detail.data.advance.method}</>}
              </p>
              {detail.data.settlements.length === 0 ? (
                <p className="text-muted-foreground">No expense report has been settled against it yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Report period</TableHead><TableHead className="text-right">Settled</TableHead><TableHead>Booked</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.data.settlements.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.period}</TableCell>
                        <TableCell className="text-right">{formatCurrency(s.amount_cents, detail.data!.advance.currency, { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="text-muted-foreground">{format(new Date(s.created_at), 'yyyy-MM-dd')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="text-muted-foreground">
                Remaining {formatCurrency(detail.data.advance.remaining_cents, detail.data.advance.currency, { maximumFractionDigits: 0 })}
                {detail.data.advance.repaid_cents > 0 && <> · repaid {formatCurrency(detail.data.advance.repaid_cents, detail.data.advance.currency, { maximumFractionDigits: 0 })}</>}
              </p>
            </div>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
