/**
 * Who a new quote or invoice is for (2026-11-19).
 *
 * Both dialogs offered a list of existing contacts and nothing else: to
 * invoice someone new, a person had to leave, make the contact under
 * Contacts, come back and start over. The picker takes a new customer's name
 * and e-mail in place; `ensureCustomerLead` makes the contact (or finds the
 * one that already has that address) when the draft is created.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EMPTY_CUSTOMER, type CustomerChoice } from '@/lib/customer-choice';
import type { InvoiceLead } from '@/hooks/useInvoices';

interface Props {
  leads: InvoiceLead[];
  value: CustomerChoice;
  onChange: (next: CustomerChoice) => void;
}

export function CustomerPicker({ leads, value, onChange }: Props) {
  const selected = value.mode === 'existing' ? leads.find((l) => l.id === value.leadId) : undefined;

  if (value.mode === 'new') {
    return (
      <div className="space-y-3" data-testid="customer-new">
        <div className="flex items-center justify-between">
          <Label>New customer</Label>
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => onChange(EMPTY_CUSTOMER)}>
            Pick an existing contact
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-name" className="text-xs text-muted-foreground">Name</Label>
          <Input id="customer-name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Anna Andersson" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-email" className="text-xs text-muted-foreground">E-mail</Label>
          <Input id="customer-email" type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} placeholder="anna@example.com" />
        </div>
        <p className="text-xs text-muted-foreground">
          Saved as a contact when the draft is created. An address that already has a contact uses that contact.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Customer</Label>
        <Button type="button" variant="link" size="sm" className="h-auto p-0" data-testid="customer-new-toggle" onClick={() => onChange({ mode: 'new', name: '', email: '' })}>
          New customer
        </Button>
      </div>
      <Select value={value.leadId} onValueChange={(leadId) => onChange({ mode: 'existing', leadId })}>
        <SelectTrigger>
          <SelectValue placeholder="Select a lead…" />
        </SelectTrigger>
        <SelectContent>
          {leads.map((lead) => (
            <SelectItem key={lead.id} value={lead.id}>
              <span>{lead.name || lead.email}</span>
              {lead.companies?.name && <span className="text-muted-foreground ml-2">— {lead.companies.name}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <div className="rounded-md border p-3 text-sm space-y-0.5">
          <p className="font-medium">{selected.name || 'No name'}</p>
          <p className="text-muted-foreground">{selected.email}</p>
          {selected.companies?.name && <p className="text-muted-foreground">{selected.companies.name}</p>}
        </div>
      )}
    </div>
  );
}
