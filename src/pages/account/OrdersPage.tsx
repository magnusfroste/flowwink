import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCustomerOrders, useCustomerOrderItems } from '@/hooks/useCustomerData';
import { formatPrice } from '@/hooks/useProducts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Package, ChevronDown, ChevronUp, ShoppingBag } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  paid: 'default',
  pending: 'secondary',
  failed: 'destructive',
  refunded: 'outline',
};

function OrderRow({ order }: { order: { id: string; status: string; total_cents: number; currency: string; created_at: string } }) {
  const [expanded, setExpanded] = useState(false);
  const { data: items = [] } = useCustomerOrderItems(expanded ? order.id : null);

  return (
    <Card>
      <CardContent className="p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between gap-4 text-left"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">Order #{order.id.slice(0, 8)}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Badge variant={statusVariant[order.status] || 'secondary'} className="capitalize">
              {order.status}
            </Badge>
            <span className="font-bold text-sm">{formatPrice(order.total_cents, order.currency)}</span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {expanded && items.length > 0 && (
          <div className="mt-4 pt-4 border-t space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.product_name} × {item.quantity}
                </span>
                <span>{formatPrice(item.price_cents * item.quantity, order.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CustomerOrdersPage() {
  const { data: orders = [], isLoading } = useCustomerOrders();

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/30" />
        <h2 className="text-xl font-semibold">No orders yet</h2>
        <p className="text-muted-foreground">When you place an order, it will appear here.</p>
        <Button asChild>
          <Link to="/shop">Browse products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold mb-4">Order History</h2>
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} />
      ))}
    </div>
  );
}
