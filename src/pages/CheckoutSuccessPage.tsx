import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useUiText } from '@/lib/ui-text';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { GuestAccountPrompt } from '@/components/checkout/GuestAccountPrompt';
import { CheckCircle, Clock, XCircle, RefreshCw, Loader2 } from 'lucide-react';

type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded';

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price_cents: number;
}

interface Order {
  id: string;
  status: OrderStatus;
  total_cents: number;
  currency: string;
  customer_email: string;
  customer_name: string | null;
  created_at: string;
}

const statusConfig: Record<OrderStatus, { icon: React.ReactNode; label: string; color: string }> = {
  pending: {
    icon: <Clock className="h-12 w-12 mx-auto text-yellow-500" />,
    label: 'Awaiting payment…',
    color: 'text-yellow-500',
  },
  paid: {
    icon: <CheckCircle className="h-12 w-12 mx-auto text-green-500" />,
    label: 'Payment successful!',
    color: 'text-green-500',
  },
  failed: {
    icon: <XCircle className="h-12 w-12 mx-auto text-destructive" />,
    label: 'Payment failed',
    color: 'text-destructive',
  },
  refunded: {
    icon: <RefreshCw className="h-12 w-12 mx-auto text-blue-500" />,
    label: 'Refunded',
    color: 'text-blue-500',
  },
};

export default function CheckoutSuccessPage() {
  const { formatCurrency, formatDateTime } = useCustomerFormat();
  const t = useUiText();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const { user } = useAuth();
  const sessionId = searchParams.get('session_id');
  const sandboxOrderId = searchParams.get('order_id') || (location.state as any)?.orderId;
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  useEffect(() => {
    if (!sessionId && !sandboxOrderId) {
      setIsLoading(false);
      return;
    }

    // The buyer reads their order by its own key — the order id (test mode) or
    // the Stripe session they return with. A visitor may read no row of
    // `orders`, so a direct read left every guest on "Awaiting payment…".
    const fetchOrder = async () => {
      const { data, error } = await supabase.rpc('get_order_confirmation' as never, {
        p_order_id: sandboxOrderId ?? null,
        p_session_id: sandboxOrderId ? null : sessionId,
      } as never);
      if (error) logger.error('Order confirmation read failed:', error);
      const answer = data as (Order & { items?: OrderItem[] }) | null;
      if (answer) {
        setOrder(answer);
        setOrderItems(answer.items ?? []);
      }
      setIsLoading(false);
      return answer?.status ?? null;
    };

    // A payment is confirmed a moment after the buyer is back; realtime does
    // not reach a visitor either, so ask again until it is settled.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      const status = await fetchOrder();
      if ((status === null || status === 'pending') && ++tries < 40) timer = setTimeout(ask, 3000);
    };
    ask();

    // Watch the order this page is showing. Sandbox orders arrive via order_id
    // (no Stripe session), so filtering on stripe_checkout_id would never match
    // and a still-pending sandbox order would be stuck on "Awaiting payment".
    // Filter by the order id for sandbox, stripe_checkout_id for live checkout.
    const filter = sandboxOrderId
      ? `id=eq.${sandboxOrderId}`
      : `stripe_checkout_id=eq.${sessionId}`;
    const channel = supabase
      .channel('order-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter,
        },
        (payload) => {
          if (payload.new) {
            setOrder((prev) => prev ? { ...prev, status: payload.new.status as OrderStatus } : null);
          }
        }
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [sessionId, sandboxOrderId]);

  const config = statusConfig[order?.status || 'pending'];
  const status: OrderStatus = order?.status || 'pending';
  // Literal calls: the visitor-text catalogue reads keys out of the source.
  const statusLabel = ({
    pending: t('checkout.status.pending', 'Awaiting payment…'),
    paid: t('checkout.status.paid', 'Payment successful!'),
    failed: t('checkout.status.failed', 'Payment failed'),
    refunded: t('checkout.status.refunded', 'Refunded'),
  } as Record<OrderStatus, string>)[status] ?? config.label;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          {isLoading ? (
            <Loader2 className="h-12 w-12 mx-auto text-muted-foreground animate-spin" />
          ) : (
            config.icon
          )}
          <CardTitle className="text-2xl">
            {isLoading ? t('checkout.loading', 'Loading…') : order?.status === 'paid' ? t('checkout.thankYou', 'Thank you for your order!') : statusLabel}
          </CardTitle>
          <p className={`text-sm font-medium ${config.color}`}>
            {!isLoading && statusLabel}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {order?.status === 'pending' && !isLoading && (
            <p className="text-center text-muted-foreground text-sm">
              {t('checkout.awaitingConfirmation', 'We are waiting for the payment to be confirmed. The page will update automatically.')}
            </p>
          )}

          {orderItems.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-medium text-sm text-muted-foreground">{t('checkout.orderDetails', 'Order details')}</h3>
                {orderItems.map((item) => (
                  <div key={item.id} className="flex justify-between items-center text-sm">
                    <span>
                      {item.product_name} × {item.quantity}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(item.price_cents * item.quantity, order?.currency)}
                    </span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex justify-between items-center font-semibold">
                <span>{t('checkout.total', 'Total')}</span>
                <span className="text-lg">
                  {order && formatCurrency(order.total_cents, order.currency)}
                </span>
              </div>
            </>
          )}

          {order && (
            <div className="text-xs text-muted-foreground space-y-1 pt-2">
              <p>{t('checkout.email', 'Email')}: {order.customer_email}</p>
              {order.customer_name && <p>{t('checkout.name', 'Name')}: {order.customer_name}</p>}
              <p>{t('checkout.orderDate', 'Order date')}: {formatDateTime(order.created_at)}</p>
            </div>
          )}

          {sessionId && (
            <p className="text-xs text-muted-foreground">
              Referens: {sessionId.slice(0, 20)}...
            </p>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          {!user && order && order.status === 'paid' && (
            <GuestAccountPrompt
              email={order.customer_email}
              name={order.customer_name}
            />
          )}
          {order && (
            <Button asChild variant="outline" className="w-full">
              <a href={`/track/${order.id}?email=${encodeURIComponent(order.customer_email)}`}>
                {t('checkout.trackOrder', 'Track this order')}
              </a>
            </Button>
          )}
          <Button onClick={() => navigate('/')} className="w-full">
            {t('checkout.backHome', 'Back to home')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
