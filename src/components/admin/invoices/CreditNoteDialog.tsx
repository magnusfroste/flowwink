import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCreateCreditNote, type Invoice } from '@/hooks/useInvoices';

interface Props {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreditNoteDialog({ invoice, open, onOpenChange }: Props) {
  const [kind, setKind] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const createCreditNote = useCreateCreditNote();

  useEffect(() => {
    if (open) {
      setKind('full');
      setAmount('');
      setReason('');
    }
  }, [open]);

  if (!invoice) return null;

  const formatAmount = (cents: number) =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency: invoice.currency }).format(cents / 100);

  const amountCents = Math.round((Number(amount) || 0) * 100);
  const overLimit = kind === 'partial' && amountCents > invoice.total_cents;
  const invalidAmount = kind === 'partial' && (!amount || amountCents <= 0);
  const canSubmit = !overLimit && !invalidAmount && !createCreditNote.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createCreditNote.mutate(
      {
        invoice_id: invoice.id,
        reason: reason || undefined,
        amount_cents: kind === 'partial' ? amountCents : undefined,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue Credit Note</DialogTitle>
          <DialogDescription>
            Against invoice <span className="font-mono">{invoice.invoice_number}</span> ({formatAmount(invoice.total_cents)})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={kind} onValueChange={(v) => setKind(v as 'full' | 'partial')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="full" id="cn-full" />
              <Label htmlFor="cn-full" className="font-normal">
                Full credit ({formatAmount(invoice.total_cents)})
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="partial" id="cn-partial" />
              <Label htmlFor="cn-partial" className="font-normal">Partial credit</Label>
            </div>
          </RadioGroup>

          {kind === 'partial' && (
            <div className="space-y-1">
              <Label htmlFor="cn-amount">Amount ({invoice.currency})</Label>
              <Input
                id="cn-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              {overLimit && (
                <p className="text-sm text-destructive">
                  Cannot exceed the invoice total of {formatAmount(invoice.total_cents)}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="cn-reason">Reason</Label>
            <Textarea
              id="cn-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. returned goods, billing correction…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {createCreditNote.isPending ? 'Issuing…' : 'Issue Credit Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
