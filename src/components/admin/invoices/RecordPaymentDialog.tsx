import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRecordInvoicePayment, type Invoice } from '@/hooks/useInvoices';

interface Props {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAYMENT_METHODS = ['cash', 'swish', 'card', 'manual'] as const;

export function RecordPaymentDialog({ invoice, open, onOpenChange }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('manual');
  const recordPayment = useRecordInvoicePayment();

  const remainingCents = invoice ? Math.max(0, invoice.total_cents - (invoice.paid_amount_cents || 0)) : 0;

  useEffect(() => {
    if (open && invoice) {
      setAmount((remainingCents / 100).toFixed(2));
      setMethod('manual');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  if (!invoice) return null;

  const formatAmount = (cents: number) =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency: invoice.currency }).format(cents / 100);

  const amountCents = Math.round((Number(amount) || 0) * 100);
  const invalidAmount = !amount || amountCents <= 0;
  const overpay = amountCents > remainingCents;
  const canSubmit = !invalidAmount && !overpay && !recordPayment.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    recordPayment.mutate(
      { invoice_id: invoice.id, amount_cents: amountCents, method },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Invoice <span className="font-mono">{invoice.invoice_number}</span> — outstanding {formatAmount(remainingCents)} of {formatAmount(invoice.total_cents)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="pmt-amount">Amount ({invoice.currency})</Label>
            <Input
              id="pmt-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            {overpay && (
              <p className="text-sm text-destructive">
                Cannot exceed the outstanding balance of {formatAmount(remainingCents)}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as (typeof PAYMENT_METHODS)[number])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {recordPayment.isPending ? 'Recording…' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
