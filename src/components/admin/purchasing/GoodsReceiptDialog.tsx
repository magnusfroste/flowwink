import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCreateGoodsReceipt, type PurchaseOrderLine } from '@/hooks/usePurchasing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PackageCheck } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrderId: string;
  lines: PurchaseOrderLine[];
}

export function GoodsReceiptDialog({ open, onOpenChange, purchaseOrderId, lines }: Props) {
  const { user } = useAuth();
  const createReceipt = useCreateGoodsReceipt();
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const pendingLines = lines.filter((l) => l.received_quantity < l.quantity);

  const updateQty = (lineId: string, qty: number) => {
    setQuantities((prev) => ({ ...prev, [lineId]: qty }));
  };

  const handleSubmit = () => {
    const receiptLines = pendingLines
      .map((l) => ({
        po_line_id: l.id,
        quantity_received: quantities[l.id] ?? (l.quantity - l.received_quantity),
      }))
      .filter((l) => l.quantity_received > 0);

    if (receiptLines.length === 0) return;

    createReceipt.mutate(
      {
        purchase_order_id: purchaseOrderId,
        receipt_date: receiptDate,
        notes: notes || undefined,
        received_by: user?.id,
        lines: receiptLines,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" /> Record Goods Receipt
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Receipt Date</Label>
              <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} />
            </div>
          </div>

          {pendingLines.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">All items have been fully received.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Already Received</TableHead>
                  <TableHead className="text-right">Receive Now</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingLines.map((l) => {
                  const remaining = l.quantity - l.received_quantity;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.description}</TableCell>
                      <TableCell className="text-right">{l.quantity}</TableCell>
                      <TableCell className="text-right">{l.received_quantity}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          className="w-20 text-right ml-auto"
                          value={quantities[l.id] ?? remaining}
                          onChange={(e) => updateQty(l.id, parseInt(e.target.value) || 0)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={pendingLines.length === 0 || createReceipt.isPending}
            >
              {createReceipt.isPending ? 'Saving...' : 'Confirm Receipt'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
