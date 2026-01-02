import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
    label: 'Awaiting payment...',
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

const formatPrice = (cents: number, currency: string) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(cents / 100);
};

export default function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const sessionId = searchParams.get('session_id');
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }

    const fetchOrder = async () => {
      const { data: orderData } = await supabase
        .from('orders')
        .select('id, status, total_cents, currency, customer_email, customer_name, created_at')
        .eq('stripe_checkout_id', sessionId)
        .maybeSingle();

      if (orderData) {
        setOrder(orderData as Order);

        const { data: items } = await supabase
          .from('order_items')
          .select('id, product_name, quantity, price_cents')
          .eq('order_id', orderData.id);

        if (items) {
          setOrderItems(items);
        }
      }
      setIsLoading(false);
    };

    fetchOrder();

    const channel = supabase
      .channel('order-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `stripe_checkout_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.new) {
            setOrder((prev) => prev ? { ...prev, status: payload.new.status as OrderStatus } : null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const config = statusConfig[order?.status || 'pending'];

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
            {isLoading ? 'Loading...' : order?.status === 'paid' ? 'Thank you for your order!' : config.label}
          </CardTitle>
          <p className={`text-sm font-medium ${config.color}`}>
            {!isLoading && config.label}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {order?.status === 'pending' && !isLoading && (
            <p className="text-center text-muted-foreground text-sm">
              We are awaiting confirmation from Stripe. The page will update automatically.
            </p>
          )}

          {orderItems.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-medium text-sm text-muted-foreground">Order Details</h3>
                {orderItems.map((item) => (
                  <div key={item.id} className="flex justify-between items-center text-sm">
                    <span>
                      {item.product_name} × {item.quantity}
                    </span>
                    <span className="font-medium">
                      {formatPrice(item.price_cents * item.quantity, order?.currency || 'SEK')}
                    </span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex justify-between items-center font-semibold">
                <span>Total</span>
                <span className="text-lg">
                  {order && formatPrice(order.total_cents, order.currency)}
                </span>
              </div>
            </>
          )}

          {order && (
            <div className="text-xs text-muted-foreground space-y-1 pt-2">
              <p>Email: {order.customer_email}</p>
              {order.customer_name && <p>Name: {order.customer_name}</p>}
              <p>Order date: {new Date(order.created_at).toLocaleString('en-US')}</p>
            </div>
          )}

          {sessionId && (
            <p className="text-xs text-muted-foreground">
              Referens: {sessionId.slice(0, 20)}...
            </p>
          )}
        </CardContent>

        <CardFooter>
          <Button onClick={() => navigate('/')} className="w-full">
            Back to Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
