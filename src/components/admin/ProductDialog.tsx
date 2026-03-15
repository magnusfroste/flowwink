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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateProduct, useUpdateProduct, type Product, type ProductType } from '@/hooks/useProducts';

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
}

interface FormData {
  name: string;
  description: string;
  type: ProductType;
  price: string;
  currency: string;
  image_url: string;
  track_inventory: boolean;
  stock_quantity: string;
  low_stock_threshold: string;
  allow_backorder: boolean;
}

export function ProductDialog({ open, onOpenChange, product }: ProductDialogProps) {
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: '',
      description: '',
      type: 'one_time',
      price: '',
      currency: 'USD',
      image_url: '',
      track_inventory: false,
      stock_quantity: '',
      low_stock_threshold: '5',
      allow_backorder: false,
    },
  });

  const productType = watch('type');
  const trackInventory = watch('track_inventory');

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        description: product.description || '',
        type: product.type,
        price: (product.price_cents / 100).toString(),
        currency: product.currency,
        image_url: product.image_url || '',
        track_inventory: product.track_inventory,
        stock_quantity: product.stock_quantity?.toString() ?? '',
        low_stock_threshold: product.low_stock_threshold.toString(),
        allow_backorder: product.allow_backorder,
      });
    } else {
      reset({
        name: '',
        description: '',
        type: 'one_time',
        price: '',
        currency: 'USD',
        image_url: '',
        track_inventory: false,
        stock_quantity: '',
        low_stock_threshold: '5',
        allow_backorder: false,
      });
    }
  }, [product, reset]);

  const onSubmit = async (data: FormData) => {
    const productData = {
      name: data.name,
      description: data.description || null,
      type: data.type,
      price_cents: Math.round(parseFloat(data.price) * 100),
      currency: data.currency,
      is_active: true,
      sort_order: 0,
      image_url: data.image_url?.trim() || null,
      stripe_price_id: product?.stripe_price_id ?? null,
      track_inventory: data.track_inventory,
      stock_quantity: data.track_inventory ? (data.stock_quantity ? parseInt(data.stock_quantity) : 0) : null,
      low_stock_threshold: parseInt(data.low_stock_threshold) || 5,
      allow_backorder: data.allow_backorder,
    };

    if (product) {
      await updateProduct.mutateAsync({ id: product.id, ...productData });
    } else {
      await createProduct.mutateAsync(productData);
    }
    
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'New Product'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              {...register('name', { required: 'Name is required' })}
              placeholder="e.g. Pro Plan"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Describe the product..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="image_url">Image URL</Label>
            <Input
              id="image_url"
              {...register('image_url')}
              placeholder="https://example.com/image.jpg"
              type="url"
            />
            {watch('image_url') && (
              <img
                src={watch('image_url')}
                alt="Preview"
                className="h-16 w-16 rounded-lg object-cover border border-border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={productType}
              onValueChange={(value: ProductType) => setValue('type', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">One-time payment</SelectItem>
                <SelectItem value="recurring">Recurring (monthly)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price *</Label>
              <Input
                id="price"
                type="number"
                step="1"
                {...register('price', { 
                  required: 'Price is required',
                  min: { value: 0, message: 'Price must be positive' }
                })}
                placeholder="9900"
              />
              {errors.price && (
                <p className="text-sm text-destructive">{errors.price.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Currency</Label>
              <Select
                value={watch('currency')}
                onValueChange={(value) => setValue('currency', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEK">SEK</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Inventory */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Track inventory</Label>
                <p className="text-xs text-muted-foreground">Enable stock management for this product</p>
              </div>
              <Switch
                checked={trackInventory}
                onCheckedChange={(v) => setValue('track_inventory', v)}
              />
            </div>

            {trackInventory && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="stock_quantity">Stock quantity</Label>
                  <Input
                    id="stock_quantity"
                    type="number"
                    min="0"
                    {...register('stock_quantity')}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="low_stock_threshold">Low stock threshold</Label>
                  <Input
                    id="low_stock_threshold"
                    type="number"
                    min="0"
                    {...register('low_stock_threshold')}
                    placeholder="5"
                  />
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Allow backorders</Label>
                    <p className="text-xs text-muted-foreground">Continue selling when out of stock</p>
                  </div>
                  <Switch
                    checked={watch('allow_backorder')}
                    onCheckedChange={(v) => setValue('allow_backorder', v)}
                  />
                </div>
              </div>
            )}
          </div>

            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
              {product ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
