import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  Package,
  PackageCheck,
  Truck,
  Home,
  Search,
  Loader2,
  ExternalLink,
  Clock,
} from 'lucide-react';

type Fulfillment = 'unfulfilled' | 'picked' | 'packed' | 'shipped' | 'delivered';

interface TrackedOrder {
  id: string;
  customer_name: string | null;
  customer_email: string;
  status: string;
  fulfillment_status: Fulfillment;
  total_cents: number;
  currency: string;
  created_at: string;
  picked_at: string | null;
  packed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
}

interface Item {
  product_name: string;
  quantity: number;
  price_cents: number;
}

const STEPS: Array<{
  key: Fulfillment | 'paid';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  timeKey: 'created_at' | 'picked_at' | 'packed_at' | 'shipped_at' | 'delivered_at';
}> = [
  { key: 'paid', label: 'Paid', icon: CreditCard, timeKey: 'created_at' },
  { key: 'picked', label: 'Picked', icon: Package, timeKey: 'picked_at' },
  { key: 'packed', label: 'Packed', icon: PackageCheck, timeKey: 'packed_at' },
  { key: 'shipped', label: 'Shipped', icon: Truck, timeKey: 'shipped_at' },
  { key: 'delivered', label: 'Delivered', icon: Home, timeKey: 'delivered_at' },
];

const STAGE_INDEX: Record<Fulfillment, number> = {
  unfulfilled: 0,
  picked: 1,
  packed: 2,
  shipped: 3,
  delivered: 4,
};

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function OrderTrackingPage() {
  const { id: paramId } = useParams();
  const [searchParams] = useSearchParams();

  const [orderId, setOrderId] = useState(paramId ?? searchParams.get('order_id') ?? '');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  const lookup = async (oid: string, em: string) => {
    setLoading(true);
    setError(null);
    setOrder(null);
    setItems([]);
    try {
      const { data, error: rpcErr } = await supabase.rpc('lookup_order_tracking' as any, {
        p_order_id: oid.trim(),
        p_email: em.trim(),
      });
      if (rpcErr) throw rpcErr;
      const result = data as unknown as { found: boolean; order?: TrackedOrder; items?: Item[] };
      if (!result?.found) {
        setError('No order found matching that ID and email.');
      } else {
        setOrder(result.order!);
        setItems(result.items ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not look up order.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-lookup when both URL params present
  useEffect(() => {
    if (paramId && email) {
      lookup(paramId, email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim() || !email.trim()) {
      setError('Enter both order ID and email.');
      return;
    }
    lookup(orderId, email);
  };

  const currentStage = order ? STAGE_INDEX[order.fulfillment_status] : 0;
  const isPaid = order?.status === 'paid';

  return (
    <>
      <Helmet>
        <title>Track Order</title>
        <meta name="description" content="Check the status of your order step by step." />
      </Helmet>

      <PublicNavigation />

      <main className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-serif font-bold">Track your order</h1>
            <p className="text-muted-foreground">
              Enter your order ID and the email used at checkout.
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="order-id">Order ID</Label>
                  <Input
                    id="order-id"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="e.g. 8f3a…"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={loading}
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Track
                    </>
                  )}
                </Button>
              </form>

              {error && (
                <p className="text-sm text-destructive mt-4">{error}</p>
              )}
            </CardContent>
          </Card>

          {order && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="text-lg">
                    Order #{order.id.slice(0, 8).toUpperCase()}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Placed {formatDate(order.created_at)}
                  </p>
                </div>
                <Badge variant={isPaid ? 'default' : 'secondary'} className="capitalize">
                  {order.status}
                </Badge>
              </CardHeader>

              <CardContent className="space-y-8">
                {/* Timeline */}
                <ol className="relative">
                  {STEPS.map((step, idx) => {
                    const Icon = step.icon;
                    const reached =
                      step.key === 'paid' ? isPaid : isPaid && currentStage >= idx;
                    const isCurrent = isPaid && currentStage === idx;
                    const time = formatDate(order[step.timeKey]);

                    return (
                      <li key={step.key} className="flex gap-4 pb-6 last:pb-0 relative">
                        {idx < STEPS.length - 1 && (
                          <span
                            className={`absolute left-5 top-10 bottom-0 w-px ${
                              reached && currentStage > idx ? 'bg-primary' : 'bg-border'
                            }`}
                            aria-hidden
                          />
                        )}
                        <div
                          className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                            reached
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'bg-background border-border text-muted-foreground'
                          } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}
                        >
                          {isCurrent && !time ? (
                            <Clock className="h-4 w-4 animate-pulse" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 pt-1.5">
                          <p
                            className={`font-medium ${
                              reached ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {step.label}
                          </p>
                          {time && reached && (
                            <p className="text-xs text-muted-foreground mt-0.5">{time}</p>
                          )}
                          {isCurrent && !time && (
                            <p className="text-xs text-muted-foreground mt-0.5">In progress…</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {order.tracking_number && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <p className="text-sm text-muted-foreground">Tracking number</p>
                        <p className="font-mono text-sm">{order.tracking_number}</p>
                      </div>
                      {order.tracking_url && (
                        <Button asChild variant="outline" size="sm">
                          <a href={order.tracking_url} target="_blank" rel="noreferrer">
                            Carrier page
                            <ExternalLink className="h-3 w-3 ml-1.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {items.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">Items</h3>
                      {items.map((it, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span>
                            {it.product_name} × {it.quantity}
                          </span>
                          <span className="font-medium">
                            {formatPrice(it.price_cents * it.quantity, order.currency)}
                          </span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Total</span>
                        <span>{formatPrice(order.total_cents, order.currency)}</span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <PublicFooter />
    </>
  );
}
