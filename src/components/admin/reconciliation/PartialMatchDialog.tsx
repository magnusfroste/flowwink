import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreatePartialMatch } from '@/hooks/useReconciliationParity';
import type { BankTransaction } from '@/hooks/useReconciliation';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transaction: BankTransaction | null;
  bankGlAccount: string;
}

/**
 * Partial-match dialog: user enters the invoice/entity total, we compute the
 * variance vs the bank amount, and post the variance to a chosen rounding /
 * write-off account (default 3740 Öresutjämning).
 */
export function PartialMatchDialog({ open, onOpenChange, transaction, bankGlAccount }: Props) {
  const [entityType, setEntityType] = useState<'invoice' | 'expense' | 'order' | 'manual'>('manual');
  const [entityId, setEntityId] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [varianceAccount, setVarianceAccount] = useState('3740');
  const [varianceAccountName, setVarianceAccountName] = useState('Öresutjämning');
  const [notes, setNotes] = useState('');

  const mut = useCreatePartialMatch();

  if (!transaction) return null;

  const bankAbs = Math.abs(transaction.amount_cents);
  const expectedCents = Math.round(parseFloat(expectedAmount || '0') * 100);
  const varianceCents = expectedCents - bankAbs; // positive = we received less than owed
  const fmt = (c: number) =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency: transaction.currency }).format(c / 100);

  const submit = async () => {
    if (!expectedCents) return;
    await mut.mutateAsync({
      bank_transaction_id: transaction.id,
      entity_type: entityType,
      entity_id: entityId.trim() || null,
      match_cents: bankAbs,
      variance_cents: varianceCents,
      variance_account_code: varianceAccount.trim(),
      variance_account_name: varianceAccountName.trim(),
      bank_gl_account: bankGlAccount,
      notes: notes.trim() || `Partial match ${transaction.reference || transaction.counterparty || ''}`,
    });
    onOpenChange(false);
    setExpectedAmount('');
    setEntityId('');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Partial match with variance</DialogTitle>
          <DialogDescription>
            Match this bank line to an invoice/entry and post the variance (rounding, write-off, FX diff)
            to a chosen account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bank amount</span>
              <span className="font-mono">{fmt(bankAbs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expected (invoice)</span>
              <span className="font-mono">{expectedCents ? fmt(expectedCents) : '—'}</span>
            </div>
            <div className="flex justify-between border-t pt-1">
              <span className="text-muted-foreground">Variance</span>
              <span className={`font-mono ${varianceCents === 0 ? 'text-muted-foreground' : varianceCents > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                {expectedCents ? fmt(varianceCents) : '—'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Entity type</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as any)}
              >
                <option value="manual">Manual</option>
                <option value="invoice">Invoice</option>
                <option value="expense">Expense</option>
                <option value="order">Order</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Entity ID (optional)</Label>
              <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} className="h-9 font-mono text-xs" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Expected amount</Label>
            <Input
              type="number"
              step="0.01"
              value={expectedAmount}
              onChange={(e) => setExpectedAmount(e.target.value)}
              className="h-9 font-mono"
              placeholder="e.g. 1000.00"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Variance account</Label>
              <Input value={varianceAccount} onChange={(e) => setVarianceAccount(e.target.value)} className="h-9 font-mono" />
            </div>
            <div>
              <Label className="text-xs">Variance account name</Label>
              <Input value={varianceAccountName} onChange={(e) => setVarianceAccountName(e.target.value)} className="h-9" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!expectedCents || mut.isPending}>
            {mut.isPending ? 'Posting…' : 'Match with variance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
