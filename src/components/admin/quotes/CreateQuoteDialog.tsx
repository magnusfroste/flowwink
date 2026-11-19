import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useCreateQuote } from '@/hooks/useQuotes';
import { useLeadsForPicker } from '@/hooks/useInvoices';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { CustomerPicker } from '@/components/admin/crm/CustomerPicker';
import { EMPTY_CUSTOMER, customerChosen, ensureCustomerLead, type CustomerChoice } from '@/lib/customer-choice';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill from a Deal (Odoo-style: Deal → Quote) */
  initialLeadId?: string;
  initialDealId?: string;
  /** Hide the lead picker when launched from a Deal context */
  lockLead?: boolean;
}

export function CreateQuoteDialog({
  open,
  onOpenChange,
  initialLeadId,
  initialDealId,
  lockLead,
}: Props) {
  const createQuote = useCreateQuote();
  const { data: leads = [] } = useLeadsForPicker();
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState<CustomerChoice>(
    initialLeadId ? { mode: 'existing', leadId: initialLeadId } : EMPTY_CUSTOMER,
  );
  const [resolving, setResolving] = useState(false);
  const [validUntil, setValidUntil] = useState('');

  useEffect(() => {
    if (open && initialLeadId) setCustomer({ mode: 'existing', leadId: initialLeadId });
  }, [open, initialLeadId]);

  const selectedLead = customer.mode === 'existing' ? leads.find((l) => l.id === customer.leadId) : undefined;

  const handleCreate = async () => {
    if (!customerChosen(customer)) return;
    let leadId: string;
    setResolving(true);
    try {
      const made = await ensureCustomerLead(customer);
      leadId = made.leadId;
      if (made.created) {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['leads-picker'] });
      }
    } catch (error) {
      logger.error('Could not save the new customer:', error);
      toast.error('Could not save the new customer');
      setResolving(false);
      return;
    }
    setResolving(false);
    createQuote.mutate(
      {
        lead_id: leadId,
        deal_id: initialDealId,
        valid_until: validUntil || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          if (!lockLead) setCustomer(EMPTY_CUSTOMER);
          setValidUntil('');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Quote</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!lockLead && <CustomerPicker leads={leads} value={customer} onChange={setCustomer} />}

          {lockLead && selectedLead && (
            <div className="rounded-md border p-3 text-sm space-y-0.5">
              <p className="font-medium">{selectedLead.name || 'No name'}</p>
              <p className="text-muted-foreground">{selectedLead.email}</p>
              {selectedLead.companies?.name && (
                <p className="text-muted-foreground">{selectedLead.companies.name}</p>
              )}
              {initialDealId && (
                <p className="text-xs text-primary mt-1">Linked to current deal</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Valid Until</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>

          <p className="text-xs text-muted-foreground">
            Line items can be added after creation.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!customerChosen(customer) || resolving || createQuote.isPending}>
            Create Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
