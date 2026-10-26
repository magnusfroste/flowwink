import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCreateInvoice, useLeadsForPicker, type InvoiceLineItem } from '@/hooks/useInvoices';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { currencyOptions } from '@/lib/currency-options';
import { homeCurrency } from '@/lib/platform-fallbacks';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInvoiceDialog({ open, onOpenChange }: Props) {
  const createInvoice = useCreateInvoice();
  const { data: leads = [] } = useLeadsForPicker();
  const [leadId, setLeadId] = useState('');
  // The business's currency unless the customer is billed in another.
  const [currency, setCurrency] = useState(homeCurrency);
  const [lineItems] = useState<InvoiceLineItem[]>([
    { description: '', qty: 1, unit_price_cents: 0 },
  ]);

  const selectedLead = leads.find((l) => l.id === leadId);

  const handleCreate = () => {
    if (!leadId) return;
    createInvoice.mutate(
      {
        lead_id: leadId,
        line_items: lineItems,
        currency,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setLeadId('');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Customer (Lead)</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a lead…" />
              </SelectTrigger>
              <SelectContent>
                {leads.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    <span>{lead.name || lead.email}</span>
                    {lead.companies?.name && (
                      <span className="text-muted-foreground ml-2">— {lead.companies.name}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedLead && (
            <div className="rounded-md border p-3 text-sm space-y-0.5">
              <p className="font-medium">{selectedLead.name || 'No name'}</p>
              <p className="text-muted-foreground">{selectedLead.email}</p>
              {selectedLead.companies?.name && (
                <p className="text-muted-foreground">{selectedLead.companies.name}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {currencyOptions(currency).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {currency !== homeCurrency() && (
              <p className="text-xs text-muted-foreground">
                Booked in {homeCurrency()} at the exchange rate of the issue date; the rate must exist (Accounting → Exchange rates).
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Line items can be added after creation.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!leadId || createInvoice.isPending}>
            Create Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
