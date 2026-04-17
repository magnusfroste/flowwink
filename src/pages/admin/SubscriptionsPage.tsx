import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useSubscriptions, useSubscriptionMetrics, useSubscriptionAction,
  openCustomerPortal, type SubscriptionStatus, type Subscription,
} from '@/hooks/useSubscriptions';
import { format } from 'date-fns';
import { ExternalLink, MoreHorizontal, RefreshCw, XCircle } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STATUS_LABEL: Record<SubscriptionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  trialing: { label: 'Trialing', variant: 'secondary' },
  past_due: { label: 'Past due', variant: 'destructive' },
  canceled: { label: 'Canceled', variant: 'outline' },
  paused: { label: 'Paused', variant: 'outline' },
  incomplete: { label: 'Incomplete', variant: 'outline' },
  incomplete_expired: { label: 'Expired', variant: 'outline' },
  unpaid: { label: 'Unpaid', variant: 'destructive' },
};

function formatMoney(cents: number, currency: string) {
  if (currency === 'mixed') return `${(cents / 100).toFixed(2)} (mixed)`;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency.toUpperCase()}`;
  }
}

export default function SubscriptionsPage() {
  const [filter, setFilter] = useState<SubscriptionStatus | 'all'>('all');
  const { data: subs, isLoading } = useSubscriptions(filter === 'all' ? undefined : filter);
  const { data: metrics } = useSubscriptionMetrics();
  const action = useSubscriptionAction();

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-muted-foreground mt-1">
          Recurring revenue lifecycle — synced from your payment provider via webhooks.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="MRR"
          value={metrics ? formatMoney(metrics.mrrCents, metrics.currency) : '—'}
          hint={metrics ? `${metrics.activeCount} active` : ''}
        />
        <MetricCard
          label="ARR"
          value={metrics ? formatMoney(metrics.arrCents, metrics.currency) : '—'}
          hint="Annualized"
        />
        <MetricCard
          label="Trialing"
          value={metrics?.trialing?.toString() ?? '—'}
          hint="In trial period"
        />
        <MetricCard
          label="Churn (30d)"
          value={metrics?.canceled30?.toString() ?? '—'}
          hint={metrics?.pastDue ? `${metrics.pastDue} past due` : 'Last 30 days'}
        />
      </div>

      {/* Filter */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="trialing">Trialing</TabsTrigger>
          <TabsTrigger value="past_due">Past due</TabsTrigger>
          <TabsTrigger value="canceled">Canceled</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>{subs?.length ?? 0} subscription(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !subs || subs.length === 0 ? (
            <EmptyState />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Renews</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((s) => (
                  <SubscriptionRow
                    key={s.id}
                    sub={s}
                    onCancel={() => action.mutate({ action: 'cancel', subscriptionId: s.id, atPeriodEnd: true })}
                    onResume={() => action.mutate({ action: 'resume', subscriptionId: s.id })}
                    onPortal={() => openCustomerPortal(s.id)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function SubscriptionRow({
  sub, onCancel, onResume, onPortal,
}: {
  sub: Subscription;
  onCancel: () => void;
  onResume: () => void;
  onPortal: () => void;
}) {
  const status = STATUS_LABEL[sub.status];
  const renews = sub.current_period_end
    ? format(new Date(sub.current_period_end), 'MMM d, yyyy')
    : '—';
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{sub.customer_name ?? sub.customer_email ?? 'Unknown'}</div>
        {sub.customer_email && sub.customer_name && (
          <div className="text-xs text-muted-foreground">{sub.customer_email}</div>
        )}
      </TableCell>
      <TableCell>
        <div className="font-medium">{sub.product_name ?? '—'}</div>
        <div className="text-xs text-muted-foreground">
          {sub.quantity > 1 ? `${sub.quantity} × ` : ''}
          {sub.billing_interval ? `per ${sub.billing_interval}` : ''}
        </div>
      </TableCell>
      <TableCell>{formatMoney(sub.unit_amount_cents * sub.quantity, sub.currency)}</TableCell>
      <TableCell>
        <Badge variant={status.variant}>{status.label}</Badge>
        {sub.cancel_at_period_end && (
          <Badge variant="outline" className="ml-2">Ends soon</Badge>
        )}
      </TableCell>
      <TableCell>{renews}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onPortal}>
              <ExternalLink className="h-4 w-4 mr-2" />Customer portal
            </DropdownMenuItem>
            {sub.cancel_at_period_end ? (
              <DropdownMenuItem onClick={onResume}>
                <RefreshCw className="h-4 w-4 mr-2" />Resume
              </DropdownMenuItem>
            ) : (
              ['active', 'trialing', 'past_due'].includes(sub.status) && (
                <DropdownMenuItem onClick={onCancel} className="text-destructive">
                  <XCircle className="h-4 w-4 mr-2" />Cancel at period end
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">No subscriptions yet.</p>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Subscriptions appear here automatically when customers subscribe via your
        payment provider. Make sure your Stripe webhook points to{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">stripe-webhook</code>{' '}
        and listens to <code className="text-xs bg-muted px-1 py-0.5 rounded">customer.subscription.*</code> events.
      </p>
    </div>
  );
}
