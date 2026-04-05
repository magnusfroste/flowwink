import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, Building2, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useInvoice, useUpdateInvoice, useDeleteInvoice, computeInvoiceTotals,
  getInvoiceCustomerName, getInvoiceCustomerEmail, getInvoiceCompanyName,
  type InvoiceLineItem, type InvoiceStatus,
} from '@/hooks/useInvoices';

interface Props {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_ACTIONS: Record<InvoiceStatus, { label: string; next: InvoiceStatus }[]> = {
  draft: [
    { label: 'Mark as Sent', next: 'sent' },
    { label: 'Cancel', next: 'cancelled' },
  ],
  sent: [
    { label: 'Mark as Paid', next: 'paid' },
    { label: 'Cancel', next: 'cancelled' },
  ],
  paid: [],
  cancelled: [{ label: 'Revert to Draft', next: 'draft' }],
};

export function InvoiceDetailSheet({ invoiceId, open, onOpenChange }: Props) {
  const { data: invoice } = useInvoice(invoiceId || undefined);
  const updateInvoice = useUpdateInvoice();
  const deleteInvoice = useDeleteInvoice();

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [taxRate, setTaxRate] = useState(0.25);
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (invoice) {
      setLineItems(invoice.line_items || []);
      setTaxRate(invoice.tax_rate);
      setNotes(invoice.notes || '');
      setDueDate(invoice.due_date || '');
    }
  }, [invoice]);

  const totals = computeInvoiceTotals(lineItems, taxRate);

  const formatAmount = (cents: number) => {
    const currency = invoice?.currency || 'SEK';
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);
  };

  const handleSave = useCallback(() => {
    if (!invoice) return;
    updateInvoice.mutate({
      id: invoice.id,
      line_items: lineItems,
      tax_rate: taxRate,
      notes: notes || null,
      due_date: dueDate || null,
      ...totals,
    } as any);
  }, [invoice, lineItems, taxRate, notes, dueDate, totals, updateInvoice]);

  const handleStatusChange = (next: InvoiceStatus) => {
    if (!invoice) return;
    updateInvoice.mutate({
      id: invoice.id,
      status: next,
      ...(next === 'paid' ? { paid_at: new Date().toISOString() } : {}),
    } as any);
  };

  const handleDelete = () => {
    if (!invoice) return;
    if (confirm('Delete this invoice?')) {
      deleteInvoice.mutate(invoice.id);
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

  if (!invoice) return null;

  const customerName = getInvoiceCustomerName(invoice);
  const customerEmail = getInvoiceCustomerEmail(invoice);
  const companyName = getInvoiceCompanyName(invoice);
  const actions = STATUS_ACTIONS[invoice.status] || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono">{invoice.invoice_number}</span>
            <Badge variant="secondary">{invoice.status}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Customer info from lead */}
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

          {/* Due date */}
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
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

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleSave} disabled={updateInvoice.isPending}>
              Save Changes
            </Button>
            {actions.map((action) => (
              <Button
                key={action.next}
                variant={action.next === 'cancelled' ? 'destructive' : 'outline'}
                onClick={() => handleStatusChange(action.next)}
                disabled={updateInvoice.isPending}
              >
                {action.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={handleDelete} className="ml-auto text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
