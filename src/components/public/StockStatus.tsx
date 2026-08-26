import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bell, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Product, StockStatus as StockStatusType } from '@/hooks/useProducts';
import { getStockStatus } from '@/hooks/useProducts';

interface StockStatusBadgeProps {
  product: Product;
  className?: string;
}

export function StockStatusBadge({ product, className }: StockStatusBadgeProps) {
  const status = getStockStatus(product);

  if (status === 'untracked') return null;

  const config: Record<StockStatusType, { label: string; icon: React.ReactNode; variant: string }> = {
    in_stock: {
      label: 'In stock',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      variant: 'text-success bg-success/10',
    },
    low_stock: {
      label: product.stock_quantity !== null ? `Only ${product.stock_quantity} left` : 'Low stock',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      variant: 'text-warning bg-warning/10',
    },
    out_of_stock: {
      label: product.allow_backorder ? 'Pre-order' : 'Out of stock',
      icon: <XCircle className="h-3.5 w-3.5" />,
      variant: product.allow_backorder
        ? 'text-info bg-info/10'
        : 'text-destructive bg-destructive/10',
    },
    untracked: { label: '', icon: null, variant: '' },
  };

  const { label, icon, variant } = config[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full gap-1.5 border-transparent font-medium text-xs px-3 py-1',
        variant,
        className
      )}
    >
      {icon}
      {label}
    </Badge>
  );
}

interface BackInStockFormProps {
  productId: string;
  productName: string;
  className?: string;
}

export function BackInStockForm({ productId, productName, className }: BackInStockFormProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    // The RPC is the working path. The direct upsert below fails for every
    // anonymous visitor on a correctly locked-down instance: ON CONFLICT DO
    // UPDATE needs to read the conflict row, and anon (correctly) has no
    // SELECT or UPDATE path on back_in_stock_requests. request_back_in_stock
    // is SECURITY DEFINER and returns nothing, so an outsider cannot probe
    // which addresses are waiting. The legacy upsert stays as fallback for
    // instances that have not run the migration yet (the fleet runs several
    // schema versions at once by design).
    const rpcCall = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    let error: { message: string } | null = null;
    try {
      ({ error } = await rpcCall('request_back_in_stock', {
        p_product_id: productId,
        p_email: email,
      }));
    } catch (e) {
      error = { message: e instanceof Error ? e.message : String(e) };
    }

    if (error) {
      logger.warn('request_back_in_stock unavailable, falling back to direct upsert', error.message);
      ({ error } = await supabase
        .from('back_in_stock_requests' as any)
        .upsert(
          { product_id: productId, email } as any,
          { onConflict: 'product_id,email' }
        ));
    }

    setLoading(false);

    if (error) {
      toast.error('Could not save your request. Please try again.');
      return;
    }

    setSubmitted(true);
    toast.success('We\'ll notify you when it\'s back!');
  };

  if (submitted) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Bell className="h-4 w-4 text-primary" />
        <span>We'll email you when <strong>{productName}</strong> is back in stock.</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-3', className)}>
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Bell className="h-4 w-4" />
        Get notified when this product is back in stock
      </p>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-10"
        />
        <Button type="submit" size="sm" className="h-10 px-4 shrink-0" disabled={loading}>
          {loading ? 'Saving...' : 'Notify me'}
        </Button>
      </div>
    </form>
  );
}
