import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RenewalsPanel } from '@/components/admin/subscriptions/RenewalsPanel';
import { BillingCronBanner } from '@/components/admin/subscriptions/BillingCronBanner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useSubscriptions, useSubscriptionMetrics, useSubscriptionAction,
  openCustomerPortal, type SubscriptionStatus, type Subscription,
} from '@/hooks/useSubscriptions';
import { format } from 'date-fns';
import { ExternalLink, MoreHorizontal, RefreshCw, XCircle, ArrowUpDown } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChangePlanDialog } from '@/components/admin/subscriptions/ChangePlanDialog';

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
  const qc = useQueryClient();

  return (
    <AdminLayout>
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground mt-1">
            Recurring revenue lifecycle — Stripe-billed subs sync via webhook;
            invoice-billed (manual) subs are billed nightly by the platform.
          </p>
        </div>
        <NewManualSubscriptionButton />
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

      <BillingCronBanner />

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">Subscriptions</TabsTrigger>
          <TabsTrigger value="renewals">Renewals & Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="trialing">Trialing</TabsTrigger>
              <TabsTrigger value="past_due">Past due</TabsTrigger>
              <TabsTrigger value="canceled">Canceled</TabsTrigger>
            </TabsList>
          </Tabs>

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
                        onCancel={async () => {
                          if (s.provider === 'manual') {
                            const { error } = await supabase.rpc('cancel_manual_subscription', {
                              _subscription_id: s.id,
                              _reason: null,
                              _effective_date: null,
                            });
                            if (error) { toast.error(error.message); return; }
                            toast.success('Subscription canceled');
                            await Promise.all([
                              qc.invalidateQueries({ queryKey: ['subscriptions'] }),
                              qc.invalidateQueries({ queryKey: ['subscription-metrics'] }),
                            ]);
                          } else {
                            action.mutate({ action: 'cancel', subscriptionId: s.id, atPeriodEnd: true });
                          }
                        }}
                        onResume={() => action.mutate({ action: 'resume', subscriptionId: s.id })}
                        onPortal={() => openCustomerPortal(s.id)}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="renewals">
          <RenewalsPanel />
        </TabsContent>
      </Tabs>
    </div>
    </AdminLayout>
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
  const isManual = sub.provider === 'manual';
  const nextInvoice = (sub as any).next_invoice_date as string | null | undefined;
  const renews = sub.current_period_end
    ? format(new Date(sub.current_period_end), 'MMM d, yyyy')
    : '—';
  const [changeOpen, setChangeOpen] = useState(false);
  const canChangePlan = isManual && sub.status === 'active';
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
          {isManual ? ' · invoice-billed' : ' · Stripe'}
        </div>
      </TableCell>
      <TableCell>{formatMoney(sub.unit_amount_cents * sub.quantity, sub.currency)}</TableCell>
      <TableCell>
        <Badge variant={status.variant}>{status.label}</Badge>
        {sub.cancel_at_period_end && (
          <Badge variant="outline" className="ml-2">Ends soon</Badge>
        )}
      </TableCell>
      <TableCell>
        {isManual && nextInvoice ? (
          <div>
            <div>{format(new Date(nextInvoice), 'MMM d, yyyy')}</div>
            <div className="text-xs text-muted-foreground">Auto-invoice at 06:00 UTC</div>
          </div>
        ) : (
          renews
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onPortal}>
              <ExternalLink className="h-4 w-4 mr-2" />Customer portal
            </DropdownMenuItem>
            {canChangePlan && (
              <DropdownMenuItem onClick={() => setChangeOpen(true)}>
                <ArrowUpDown className="h-4 w-4 mr-2" />Change plan
              </DropdownMenuItem>
            )}
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
        {canChangePlan && (
          <ChangePlanDialog open={changeOpen} onOpenChange={setChangeOpen} sub={sub} />
        )}
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

// ----------------------------------------------------------------------
// New manual subscription — for B2B customers paying by invoice.
// Calls create_manual_subscription RPC; daily cron then generates invoices.
// ----------------------------------------------------------------------
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

function NewManualSubscriptionButton() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const [f, setF] = useState({
    customer_email: '',
    customer_name: '',
    product_name: '',
    unit_amount: '',
    currency: 'EUR',
    billing_interval: 'month',
    billing_interval_count: '1',
    quantity: '1',
    payment_terms: 'invoice_30',
    start_date: new Date().toISOString().slice(0, 10),
    billing_contact_email: '',
    po_number: '',
    auto_finalize: false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    if (!f.customer_email || !f.product_name || !f.unit_amount) {
      toast.error('Customer email, product name and price are required');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('create_manual_subscription', {
        _customer_email: f.customer_email,
        _customer_name: f.customer_name || null,
        _product_name: f.product_name,
        _unit_amount_cents: Math.round(Number(f.unit_amount) * 100),
        _currency: f.currency,
        _billing_interval: f.billing_interval,
        _billing_interval_count: Number(f.billing_interval_count),
        _quantity: Number(f.quantity),
        _payment_terms: f.payment_terms,
        _start_date: f.start_date,
        _billing_contact_email: f.billing_contact_email || null,
        _po_number: f.po_number || null,
        _auto_finalize: f.auto_finalize,
      });
      if (error) throw error;
      toast.success('Manual subscription created');
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: ['subscription-metrics'] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create subscription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" /> New manual subscription
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New invoice-billed subscription</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Customer email *</Label>
              <Input value={f.customer_email} onChange={(e) => set('customer_email', e.target.value)} placeholder="ap@acme.com" />
            </div>
            <div className="space-y-1">
              <Label>Customer name</Label>
              <Input value={f.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="ACME AB" />
            </div>
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label>Plan / product name *</Label>
            <Input value={f.product_name} onChange={(e) => set('product_name', e.target.value)} placeholder="Business Mobile 100GB" />
          </div>
          <div className="space-y-1">
            <Label>Price per period *</Label>
            <Input type="number" step="0.01" value={f.unit_amount} onChange={(e) => set('unit_amount', e.target.value)} placeholder="199.00" />
          </div>
          <div className="space-y-1">
            <Label>Currency</Label>
            <Select value={f.currency} onValueChange={(v) => set('currency', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="SEK">SEK</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="NOK">NOK</SelectItem>
                <SelectItem value="DKK">DKK</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Billing interval</Label>
            <Select value={f.billing_interval} onValueChange={(v) => set('billing_interval', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="day">Daily</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Interval count</Label>
            <Input type="number" min="1" value={f.billing_interval_count} onChange={(e) => set('billing_interval_count', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Quantity</Label>
            <Input type="number" min="1" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Payment terms</Label>
            <Select value={f.payment_terms} onValueChange={(v) => set('payment_terms', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice_30">Invoice — Net 30</SelectItem>
                <SelectItem value="invoice_14">Invoice — Net 14</SelectItem>
                <SelectItem value="invoice_7">Invoice — Net 7</SelectItem>
                <SelectItem value="direct_debit">Direct debit</SelectItem>
                <SelectItem value="manual">Manual / other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Start date</Label>
            <Input type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />
            <p className="text-xs text-muted-foreground">First invoice is generated automatically by the daily 06:00 UTC billing job once this date is reached.</p>
          </div>
          <div className="space-y-1">
            <Label>Billing contact (optional)</Label>
            <Input value={f.billing_contact_email} onChange={(e) => set('billing_contact_email', e.target.value)} placeholder="ap-team@acme.com" />
          </div>
          <div className="space-y-1">
            <Label>PO number (optional)</Label>
            <Input value={f.po_number} onChange={(e) => set('po_number', e.target.value)} placeholder="PO-2026-0042" />
          </div>
          <div className="md:col-span-2 flex items-start gap-3 rounded-lg border p-3 bg-muted/30">
            <Switch
              id="auto-finalize"
              checked={f.auto_finalize}
              onCheckedChange={(v) => set('auto_finalize', v)}
            />
            <div className="flex-1 space-y-0.5">
              <Label htmlFor="auto-finalize" className="cursor-pointer">Auto-finalize invoices</Label>
              <p className="text-xs text-muted-foreground">
                When on, the daily billing cron issues invoices as <strong>sent</strong> immediately. When off,
                invoices land as <strong>draft</strong> for manual review before sending.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create subscription'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
