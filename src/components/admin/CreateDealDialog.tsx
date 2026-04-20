import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProducts, formatPrice } from '@/hooks/useProducts';
import { useCreateDeal } from '@/hooks/useDeals';

interface CreateDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
}

interface FormData {
  product_id: string;
  value_cents: number;
  expected_close: string;
  notes: string;
}

export function CreateDealDialog({ open, onOpenChange, leadId }: CreateDealDialogProps) {
  const { data: products = [] } = useProducts({ activeOnly: true });
  const createDeal = useCreateDeal();
  
  const { register, handleSubmit, reset, setValue, watch } = useForm<FormData>({
    defaultValues: {
      product_id: '',
      value_cents: 0,
      expected_close: '',
      notes: '',
    },
  });

  const selectedProductId = watch('product_id');
  const valueCents = watch('value_cents');

  useEffect(() => {
    if (selectedProductId && selectedProductId !== 'custom') {
      const product = products.find(p => p.id === selectedProductId);
      if (product) {
        setValue('value_cents', product.price_cents);
      }
    }
  }, [selectedProductId, products, setValue]);

  useEffect(() => {
    if (!open) {
      reset({
        product_id: '',
        value_cents: 0,
        expected_close: '',
        notes: '',
      });
    }
  }, [open, reset]);

  const onSubmit = async (data: FormData) => {
    await createDeal.mutateAsync({
      lead_id: leadId,
      product_id: data.product_id === 'custom' ? null : data.product_id || null,
      value_cents: data.value_cents,
      expected_close: data.expected_close || null,
      notes: data.notes || null,
    });
    
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Deal</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <Select
              value={selectedProductId}
              onValueChange={(value) => setValue('product_id', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom deal (no product)</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} - {formatPrice(product.price_cents, product.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="value">Value *</Label>
            <MoneyInput
              id="value"
              value={valueCents}
              onChange={(c) => setValue('value_cents', c)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expected_close">Expected Close Date</Label>
            <Input
              id="expected_close"
              type="date"
              {...register('expected_close')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Details about the deal..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDeal.isPending}>
              Create Deal
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
