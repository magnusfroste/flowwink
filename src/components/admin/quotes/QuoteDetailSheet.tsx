import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, Building2, FileCheck } from 'lucide-react';
import { computeInvoiceTotals, type InvoiceLineItem } from '@/hooks/useInvoices';
import {
  useQuote, useUpdateQuote, useDeleteQuote, useConvertQuoteToInvoice,
  getQuoteCustomerName, getQuoteCustomerEmail, getQuoteCompanyName,
  type QuoteStatus,
} from '@/hooks/useQuotes';

interface Props {
  quoteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_ACTIONS: Record<QuoteStatus, { label: string; next: QuoteStatus; variant?: 'destructive' | 'outline' | 'default' }[]> = {
  draft: [
    { label: 'Mark as Sent', next: 'sent', variant: 'outline' },
    { label: 'Reject', next: 'rejected', variant: 'destructive' },
  ],
  sent: [
    { label: 'Accept', next: 'accepted', variant: 'default' },
    { label: 'Reject', next: 'rejected', variant: 'destructive' },
  ],
  accepted: [],
  rejected: [{ label: 'Revert to Draft', next: 'draft', variant: 'outline' }],
  expired: [{ label: 'Revert to Draft', next: 'draft', variant: 'outline' }],
};

export function QuoteDetailSheet({ quoteId, open, onOpenChange }: Props) {
  const { data: quote } = useQuote(quoteId || undefined);
  const updateQuote = useUpdateQuote();
  const deleteQuote = useDeleteQuote();
  const convertToInvoice = useConvertQuoteToInvoice();

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [taxRate, setTaxRate] = useState(0.25);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');

  useEffect(() => {
    if (quote) {
      setLineItems(quote.line_items || []);
      setTaxRate(quote.tax_rate);
      setNotes(quote.notes || '');
      setValidUntil(quote.valid_until || '');
    }
  }, [quote]);

  const totals = computeInvoiceTotals(lineItems, taxRate);

  const formatAmount = (cents: number) => {
    const currency = quote?.currency || 'SEK';
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);
  };

  const handleSave = useCallback(() => {
    if (!quote) return;
    updateQuote.mutate({
      id: quote.id,
      line_items: lineItems,
      tax_rate: taxRate,
      notes: notes || null,
      valid_until: validUntil || null,
      ...totals,
    } as any);
  }, [quote, lineItems, taxRate, notes, validUntil, totals, updateQuote]);

  const handleStatusChange = (next: QuoteStatus) => {
    if (!quote) return;
    const extra: Record<string, any> = {};
    if (next === 'sent') extra.sent_at = new Date().toISOString();
    if (next === 'accepted') extra.accepted_at = new Date().toISOString();
    if (next === 'rejected') extra.rejected_at = new Date().toISOString();
    updateQuote.mutate({ id: quote.id, status: next, ...extra } as any);
  };

  const handleConvert = () => {
    if (!quote) return;
    convertToInvoice.mutate(quote);
  };

  const handleDelete = () => {
    if (!quote) return;
    if (confirm('Delete this quote?')) {
      deleteQuote.mutate(quote.id);
      onOpenChange(false);
    }
  };

  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    setLineItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const addLineItem = () => {
    setLineItems(prev => [...prev, { description: '', qty: 1, unit_price_cents: 0 }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  if (!quote) return null;

  const customerName = getQuoteCustomerName(quote);
  const customerEmail = getQuoteCustomerEmail(quote);
  const companyName = getQuoteCompanyName(quote);
  const actions = STATUS_ACTIONS[quote.status] || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono">{quote.quote_number}</span>
            <Badge variant="secondary">{quote.status}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Customer info */}
          <div className="space-y-1">
            <p className="font-medium">{customerName}</p>
            <p className="text-sm text-muted-foreground">{customerEmail}</p>
            {companyName && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {companyName}
              </p>
            )}
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <Label>Line Items</Label>
            {lineItems.map((item, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateLineItem(i, 'description', e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="number"
                  placeholder="Qty"
                  value={item.qty}
                  onChange={(e) => updateLineItem(i, 'qty', parseInt(e.target.value) || 0)}
                  className="w-16"
                />
                <Input
                  type="number"
                  placeholder="Price (öre)"
                  value={item.unit_price_cents}
                  onChange={(e) => updateLineItem(i, 'unit_price_cents', parseInt(e.target.value) || 0)}
                  className="w-28"
                />
                <Button variant="ghost" size="icon" onClick={() => removeLineItem(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addLineItem}>
              <Plus className="h-3 w-3 mr-1" /> Add Item
            </Button>
          </div>

          {/* Tax */}
          <div className="space-y-2">
            <Label>Tax Rate (%)</Label>
            <Input
              type="number"
              value={Math.round(taxRate * 100)}
              onChange={(e) => setTaxRate((parseInt(e.target.value) || 0) / 100)}
              className="w-24"
            />
          </div>

          {/* Totals */}
          <div className="space-y-1 text-sm border-t pt-3">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">{formatAmount(totals.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax ({Math.round(taxRate * 100)}%)</span>
              <span className="font-mono">{formatAmount(totals.tax_cents)}</span>
            </div>
            <div className="flex justify-between font-medium text-base border-t pt-1">
              <span>Total</span>
              <span className="font-mono">{formatAmount(totals.total_cents)}</span>
            </div>
          </div>

          {/* Valid until */}
          <div className="space-y-2">
            <Label>Valid Until</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Invoice link */}
          {quote.invoice_id && (
            <div className="rounded-md border p-3 text-sm flex items-center gap-2 bg-muted/50">
              <FileCheck className="h-4 w-4 text-green-600" />
              <span>Invoice created from this quote</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleSave} disabled={updateQuote.isPending}>
              Save Changes
            </Button>
            {actions.map((action) => (
              <Button
                key={action.next}
                variant={action.variant === 'destructive' ? 'destructive' : 'outline'}
                onClick={() => handleStatusChange(action.next)}
                disabled={updateQuote.isPending}
              >
                {action.label}
              </Button>
            ))}
            {quote.status === 'accepted' && !quote.invoice_id && (
              <Button
                variant="default"
                onClick={handleConvert}
                disabled={convertToInvoice.isPending}
              >
                <FileCheck className="h-4 w-4 mr-1" />
                Create Invoice
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleDelete} className="ml-auto text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
