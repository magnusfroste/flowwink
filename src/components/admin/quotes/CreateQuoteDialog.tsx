import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useCreateQuote } from '@/hooks/useQuotes';
import { useLeadsForPicker } from '@/hooks/useInvoices';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [leadId, setLeadId] = useState(initialLeadId || '');
  const [validUntil, setValidUntil] = useState('');

  useEffect(() => {
    if (open && initialLeadId) setLeadId(initialLeadId);
  }, [open, initialLeadId]);

  const selectedLead = leads.find((l) => l.id === leadId);

  const handleCreate = () => {
    if (!leadId) return;
    createQuote.mutate(
      {
        lead_id: leadId,
        deal_id: initialDealId,
        valid_until: validUntil || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          if (!lockLead) setLeadId('');
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
          {!lockLead && (
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
          )}

          {selectedLead && (
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
          <Button onClick={handleCreate} disabled={!leadId || createQuote.isPending}>
            Create Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
