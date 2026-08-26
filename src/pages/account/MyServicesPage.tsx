/**
 * My services — the customer portal's view of the services they hold.
 *
 * Each active subscription is a service the customer signed up for: what it is,
 * its commitment term, next invoice, and a button to raise a ticket against it.
 * The page reads subscriptions (RLS scopes to the caller's own) and is blind to
 * how the row was born — a contract-signed telco service and a Stripe SaaS
 * subscription render the same. No branch on business type.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LifeBuoy, Package, CalendarClock } from 'lucide-react';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { ServiceTicketSheet } from '@/components/account/ServiceTicketSheet';

interface Service {
  id: string;
  product_name: string | null;
  status: string;
  unit_amount_cents: number | null;
  currency: string | null;
  billing_interval: string | null;
  commitment_months: number | null;
  commitment_end: string | null;
  current_period_end: string | null;
  next_invoice_date: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-success/10 text-success',
  provisioning: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  trialing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  past_due: 'bg-warning/10 text-warning',
  canceled: 'bg-muted text-muted-foreground',
};

// Customer-facing status words — 'provisioning' reads as "being set up", the
// signed-but-not-yet-delivered state (delivery is a status, not an order).
const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  provisioning: 'Being set up',
  trialing: 'Trial',
  past_due: 'Payment due',
  canceled: 'Ended',
};

export default function MyServicesPage() {
  const { formatCurrency, formatDate } = usePlatformFormat();
  const [helpFor, setHelpFor] = useState<{ id: string; name: string } | null>(null);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['my-services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id, product_name, status, unit_amount_cents, currency, billing_interval, commitment_months, commitment_end, current_period_end, next_invoice_date')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Service[];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">My services</h1>
        <p className="text-muted-foreground text-sm mt-1">
          The services you have with us — status, term, and support.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!isLoading && services.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            You have no active services yet.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {services.map((s) => (
          <Card key={s.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary shrink-0" />
                  {s.product_name || 'Service'}
                </CardTitle>
                <Badge className={STATUS_STYLE[s.status] ?? 'bg-muted text-muted-foreground'}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {s.unit_amount_cents != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-mono">
                    {formatCurrency(s.unit_amount_cents, s.currency ?? undefined)}
                    {s.billing_interval ? ` / ${s.billing_interval}` : ''}
                  </span>
                </div>
              )}
              {s.commitment_months != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Commitment</span>
                  <span>{s.commitment_months} months
                    {s.commitment_end ? ` (until ${formatDate(s.commitment_end)})` : ''}
                  </span>
                </div>
              )}
              {(s.next_invoice_date || s.current_period_end) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" /> Next invoice
                  </span>
                  <span>{formatDate(s.next_invoice_date || s.current_period_end)}</span>
                </div>
              )}
              {s.status === 'provisioning' && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                  We're setting up your service. You'll see it go active once it's ready.
                </p>
              )}
              <div className="pt-2 border-t">
                {/* Raise a ticket ABOUT this service — the subscription id is
                    bound server-side so support sees which service, contract
                    and SLA. A sheet, not a route: the context stays with the
                    card the customer is looking at. */}
                <Button
                  variant="outline" size="sm" className="w-full"
                  onClick={() => setHelpFor({ id: s.id, name: s.product_name || 'Service' })}
                >
                  <LifeBuoy className="h-4 w-4 mr-2" /> Get help with this service
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {helpFor && (
        <ServiceTicketSheet
          open={!!helpFor}
          onOpenChange={(o) => !o && setHelpFor(null)}
          subscriptionId={helpFor.id}
          serviceName={helpFor.name}
        />
      )}
    </div>
  );
}
