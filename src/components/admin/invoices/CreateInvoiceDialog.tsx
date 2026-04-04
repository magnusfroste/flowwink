import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateInvoice, type InvoiceLineItem } from '@/hooks/useInvoices';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInvoiceDialog({ open, onOpenChange }: Props) {
  const createInvoice = useCreateInvoice();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [lineItems] = useState<InvoiceLineItem[]>([
    { description: '', qty: 1, unit_price_cents: 0 },
  ]);

  const handleCreate = () => {
    if (!email) return;
    createInvoice.mutate(
      {
        customer_email: email,
        customer_name: name,
        line_items: lineItems,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setEmail('');
          setName('');
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
            <Label>Customer Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
          </div>
          <div className="space-y-2">
            <Label>Customer Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="billing@acme.com" type="email" />
          </div>
          <p className="text-xs text-muted-foreground">
            Line items can be added after creation.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!email || createInvoice.isPending}>
            Create Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
