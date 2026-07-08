import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { usePettyCashCounts, useRecordPettyCashCount } from '@/hooks/useReconciliationParity';

export function PettyCashPanel() {
  const [cashAccount, setCashAccount] = useState('1910');
  const [diffAccount, setDiffAccount] = useState('7960');
  const [countedAmount, setCountedAmount] = useState('');
  const [countDate, setCountDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  const { data: counts = [] } = usePettyCashCounts(cashAccount);
  const record = useRecordPettyCashCount();

  const fmt = (c: number, ccy = 'SEK') =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency: ccy }).format(c / 100);

  const submit = async () => {
    const cents = Math.round(parseFloat(countedAmount || '0') * 100);
    await record.mutateAsync({
      cash_account_code: cashAccount.trim(),
      counted_cents: cents,
      diff_account_code: diffAccount.trim(),
      count_date: countDate,
      notes: notes.trim() || undefined,
    });
    setCountedAmount('');
    setNotes('');
  };

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record cash count</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">Cash account</Label>
              <Input value={cashAccount} onChange={(e) => setCashAccount(e.target.value)} className="h-9 font-mono" />
            </div>
            <div>
              <Label className="text-xs">Diff account</Label>
              <Input value={diffAccount} onChange={(e) => setDiffAccount(e.target.value)} className="h-9 font-mono" />
            </div>
            <div>
              <Label className="text-xs">Count date</Label>
              <Input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Counted amount</Label>
              <Input
                type="number"
                step="0.01"
                value={countedAmount}
                onChange={(e) => setCountedAmount(e.target.value)}
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
            Book balance is computed live from posted journal lines on <span className="font-mono">{cashAccount}</span>.
            Any difference is posted to <span className="font-mono">{diffAccount}</span> as an adjustment.
          </p>
          <div>
            <Button onClick={submit} disabled={!countedAmount || record.isPending} size="sm">
              {record.isPending ? 'Posting…' : 'Post count'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Count history</CardTitle>
        </CardHeader>
        <CardContent>
          {counts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No counts recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Book</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">{c.count_date}</TableCell>
                    <TableCell className="font-mono text-xs">{c.cash_account_code}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(c.book_balance_cents, c.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(c.counted_cents, c.currency)}</TableCell>
                    <TableCell className={`text-right font-mono ${c.difference_cents === 0 ? 'text-muted-foreground' : c.difference_cents > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fmt(c.difference_cents, c.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.notes || '—'}</TableCell>
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
