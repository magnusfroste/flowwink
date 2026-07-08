import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Lock, Unlock } from 'lucide-react';
import { useBankAccounts } from '@/hooks/useBankAccounts';
import { useReconciliationSignoffs, useSignoffReconciliation, useUnlockSignoff } from '@/hooks/useReconciliationParity';

export function ReconciliationSignoffPanel() {
  const today = new Date();
  const { data: accounts = [] } = useBankAccounts();
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [periodStart, setPeriodStart] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
  const [statementBalance, setStatementBalance] = useState('');
  const [notes, setNotes] = useState('');

  const { data: signoffs = [] } = useReconciliationSignoffs(bankAccountId || undefined);
  const signoff = useSignoffReconciliation();
  const unlock = useUnlockSignoff();

  const effectiveAccount = bankAccountId || accounts[0]?.id || '';
  const currency = accounts.find((a) => a.id === effectiveAccount)?.currency || 'SEK';
  const fmt = (c: number, ccy = currency) =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency: ccy }).format(c / 100);

  const submit = async () => {
    if (!effectiveAccount) return;
    await signoff.mutateAsync({
      bank_account_id: effectiveAccount,
      period_start: periodStart,
      period_end: periodEnd,
      statement_balance_cents: Math.round(parseFloat(statementBalance || '0') * 100),
      notes: notes.trim() || undefined,
    });
    setStatementBalance('');
    setNotes('');
  };

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign off a period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">Bank account</Label>
              <Select value={effectiveAccount} onValueChange={setBankAccountId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.gl_account})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Period start</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Period end</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Statement balance</Label>
              <Input
                type="number"
                step="0.01"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
                className="h-9 font-mono"
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9" />
          </div>
          <p className="text-xs text-muted-foreground">
            Sign-off is only allowed when the statement balance equals the posted ledger balance for the period.
            Once signed off, matches linked to bank lines in this period are locked.
          </p>
          <div>
            <Button onClick={submit} disabled={!statementBalance || !effectiveAccount || signoff.isPending} size="sm">
              <Lock className="h-4 w-4 mr-1" />
              {signoff.isPending ? 'Signing…' : 'Sign off & lock'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signed-off periods</CardTitle>
        </CardHeader>
        <CardContent>
          {signoffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sign-offs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Statement</TableHead>
                  <TableHead className="text-right">Book</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                  <TableHead>Reviewed</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {signoffs.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.period_start} → {s.period_end}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.statement_balance_cents, s.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.book_balance_cents, s.currency)}</TableCell>
                    <TableCell className="text-right font-mono">
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        {fmt(s.difference_cents, s.currency)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(s.reconciled_at), 'yyyy-MM-dd HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Unlock" onClick={() => unlock.mutate(s.id)}>
                        <Unlock className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
