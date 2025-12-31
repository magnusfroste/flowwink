import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, XCircle, RefreshCw, Loader2 } from 'lucide-react';

type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded';

const statusConfig: Record<OrderStatus, { icon: React.ReactNode; label: string; color: string }> = {
  pending: {
    icon: <Clock className="h-16 w-16 mx-auto text-yellow-500" />,
    label: 'Väntar på betalning...',
    color: 'text-yellow-500',
  },
  paid: {
    icon: <CheckCircle className="h-16 w-16 mx-auto text-green-500" />,
    label: 'Betalning genomförd!',
    color: 'text-green-500',
  },
  failed: {
    icon: <XCircle className="h-16 w-16 mx-auto text-destructive" />,
    label: 'Betalningen misslyckades',
    color: 'text-destructive',
  },
  refunded: {
    icon: <RefreshCw className="h-16 w-16 mx-auto text-blue-500" />,
    label: 'Återbetalad',
    color: 'text-blue-500',
  },
};

export default function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const sessionId = searchParams.get('session_id');
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('pending');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }

    // Fetch initial order status
    const fetchOrder = async () => {
      const { data } = await supabase
        .from('orders')
        .select('status')
        .eq('stripe_checkout_id', sessionId)
        .maybeSingle();

      if (data?.status) {
        setOrderStatus(data.status as OrderStatus);
      }
      setIsLoading(false);
    };

    fetchOrder();

    // Subscribe to realtime updates
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
          if (payload.new?.status) {
            setOrderStatus(payload.new.status as OrderStatus);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const config = statusConfig[orderStatus];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          {isLoading ? (
            <Loader2 className="h-16 w-16 mx-auto text-muted-foreground animate-spin" />
          ) : (
            config.icon
          )}
          <CardTitle className="text-2xl">
            {isLoading ? 'Laddar...' : orderStatus === 'paid' ? 'Tack för din beställning!' : config.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {orderStatus === 'paid' && (
            <p className="text-muted-foreground">
              Din betalning har genomförts och du kommer snart få en bekräftelse via e-post.
            </p>
          )}
          {orderStatus === 'pending' && !isLoading && (
            <p className="text-muted-foreground">
              Vi väntar på bekräftelse från Stripe. Sidan uppdateras automatiskt.
            </p>
          )}
          {orderStatus === 'failed' && (
            <p className="text-muted-foreground">
              Något gick fel med betalningen. Försök igen eller kontakta support.
            </p>
          )}
          {sessionId && (
            <p className="text-xs text-muted-foreground">
              Referens: {sessionId.slice(0, 20)}...
            </p>
          )}
          <div className={`text-sm font-medium ${config.color}`}>
            Status: {config.label}
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={() => navigate('/')} className="w-full">
            Tillbaka till startsidan
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
