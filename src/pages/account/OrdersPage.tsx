import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCustomerOrders, useCustomerOrderItems, type CustomerOrder } from '@/hooks/useCustomerData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Package, ChevronDown, ChevronUp, ShoppingBag } from 'lucide-react';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { useUiText } from '@/lib/ui-text';
import { useStorefront } from '@/hooks/useStorefront';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  paid: 'default',
  pending: 'secondary',
  failed: 'destructive',
  refunded: 'outline',
};

/**
 * An order carries two independent facts, and this page used to show only the
 * first one — raw. Until #249 a shipment overwrote `status` with 'shipped', so
 * the chip below happened to read "Shipped" and nobody noticed that "Paid" had
 * been destroyed to say it. Now the two axes have a chip each: payment on the
 * left, where the goods are on the right.
 */
type Words = (key: string, fallback: string) => string;
const fulfillmentLabel = (status: string, t: Words): string | null => {
  if (status === 'picked') return t('account.orders.picked', 'Picked');
  if (status === 'packed') return t('account.orders.packed', 'Packed');
  if (status === 'shipped') return t('account.orders.shipped', 'Shipped');
  if (status === 'delivered') return t('account.orders.delivered', 'Delivered');
  return null;
};
const paymentLabel = (status: string, t: Words): string => {
  if (status === 'paid') return t('account.orders.paid', 'Paid');
  if (status === 'pending') return t('account.orders.pending', 'Pending');
  if (status === 'failed') return t('account.orders.failed', 'Failed');
  if (status === 'refunded') return t('account.orders.refunded', 'Refunded');
  return status;
};

function OrderRow({ order }: { order: CustomerOrder }) {
  const { formatPrice, formatDateTime } = useCustomerFormat();
  const t = useUiText();
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
              <p className="font-medium text-sm truncate">{t('account.orders.orderNumber', 'Order #{number}').replace('{number}', order.id.slice(0, 8))}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(order.created_at, { hour: undefined, minute: undefined })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {order.fulfillment_status && fulfillmentLabel(order.fulfillment_status, t) && (
              <Badge variant="outline">{fulfillmentLabel(order.fulfillment_status, t)}</Badge>
            )}
            <Badge variant={statusVariant[order.status] || 'secondary'}>
              {paymentLabel(order.status, t)}
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
            {order.shipping_method && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{order.shipping_method}</span>
                <span>{formatPrice(order.shipping_cost_cents ?? 0, order.currency)}</span>
              </div>
            )}
          </div>
        )}

        {expanded && order.shipping_address_line1 && (
          <div className="mt-4 pt-4 border-t text-sm">
            <p className="text-xs font-medium text-muted-foreground mb-1">{t('account.orders.deliveryAddress', 'Delivery address')}</p>
            <p>{order.shipping_name}</p>
            <p>{order.shipping_address_line1}</p>
            {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
            <p>
              {order.shipping_postal_code} {order.shipping_city}
              {order.shipping_country ? `, ${order.shipping_country}` : ''}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CustomerOrdersPage() {
  const { data: orders = [], isLoading } = useCustomerOrders();
  const { selling } = useStorefront();
  const t = useUiText();

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/30" />
        <h2 className="text-xl font-semibold">{t('account.orders.empty', 'No orders yet')}</h2>
        <p className="text-muted-foreground">{t('account.orders.emptyHint', 'When you place an order, it will appear here.')}</p>
        {selling && (
          <Button asChild>
            <Link to="/shop">{t('account.browseProducts', 'Browse products')}</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold mb-4">{t('account.orders.history', 'Order history')}</h2>
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} />
      ))}
    </div>
  );
}
