import { logger } from '@/lib/logger';
import { useState } from 'react';
import { useSelectOnQueryParam } from '@/hooks/useSelectOnQueryParam';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { Package, Eye, RefreshCw, ShoppingBag, TrendingUp, Clock, CheckCircle, Mail, Loader2, UserSearch, X, FileText, ExternalLink } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';
import type { Tables } from '@/integrations/supabase/types';
import { FulfillmentStepper } from '@/components/admin/orders/FulfillmentStepper';
import { FulfillmentActions } from '@/components/admin/orders/FulfillmentActions';
import { OrderLineFulfillment } from '@/components/admin/orders/OrderLineFulfillment';
import { EntityActivityTimeline } from '@/components/admin/EntityActivityTimeline';
import { OrderEventHistory } from '@/components/admin/orders/OrderEventHistory';
import { EntityTags } from '@/components/admin/EntityTags';
import { EntityFollowers } from '@/components/admin/EntityFollowers';
import { SavedViewsMenu } from '@/components/admin/SavedViewsMenu';

type Order = Tables<'orders'>;
type OrderItem = Tables<'order_items'>;

/** Shipping columns added in migration 20260704130000 (not yet in the
 *  generated types — regenerate to drop this). */
interface OrderShippingFields {
  shipping_name: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_postal_code: string | null;
  shipping_city: string | null;
  shipping_country: string | null;
  shipping_phone: string | null;
  shipping_method: string | null;
  shipping_cost_cents: number | null;
}

/**
 * Rendering map for orders.status. 'shipped' is LEGACY here: until #249 a
 * shipment overwrote the payment axis with it, so old rows still carry the
 * value and must keep rendering. It is deliberately absent from
 * PAYMENT_STATUS_OPTIONS below — offering it in a status picker is offering a
 * human the same overwrite by hand.
 */
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  failed: 'Failed',
};

/** The money/lifecycle axis — the only values a status picker may write. */
const PAYMENT_STATUS_OPTIONS = (['pending', 'paid', 'completed', 'cancelled', 'refunded', 'failed'] as const)
  .map((k) => [k, STATUS_LABELS[k]] as const);

const FULFILLMENT_LABELS: Record<string, string> = {
  unfulfilled: 'Unfulfilled',
  picked: 'Picked',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

const FULFILLMENT_COLORS: Record<string, string> = {
  unfulfilled: 'bg-muted text-muted-foreground',
  picked: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  packed: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  shipped: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  delivered: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  shipped: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  refunded: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

/**
 * How many orders this page loads at once. It is PostgREST's own default cap,
 * written down: unstated, the same truncation happens in silence and the page
 * simply looks like the whole order book.
 */
const ORDER_LIST_LIMIT = 1000;

export default function OrdersPage() {
  const { formatCurrency, formatDateTime } = usePlatformFormat();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const bulkUpdateStatus = useMutation({
    mutationFn: async (status: string) => {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('orders').update({ status }).in('id', ids);
      if (error) throw error;
      // Best-effort audit logs per order
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert(
        ids.map((id) => ({
          entity_type: 'order',
          entity_id: id,
          action: 'order.status_changed',
          user_id: userData.user?.id ?? null,
          metadata: { to: status, bulk: true },
        }))
      );
      return ids.length;
    },
    onSuccess: (count, status) => {
      toast.success(`Updated ${count} order${count === 1 ? '' : 's'} to ${status}`);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: Error) => toast.error(`Bulk update failed: ${e.message}`),
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('*')
        // Explicit, because PostgREST would impose exactly this cap anyway and
        // not mention it. Stated in the query, the number can be compared
        // against the rows we got back — and the banner below can say so.
        .limit(ORDER_LIST_LIMIT)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Order[];
    },
  });

  // At the cap the list is a window, not the order book: the stat tiles below
  // count this window, and the "already invoiced" map only knows about orders
  // in it. Saying so beats a page that looks complete.
  const ordersAtLimit = (orders?.length ?? 0) >= ORDER_LIST_LIMIT;

  // Deep link from SLA Monitor: /admin/orders?order=<id>. The row may be
  // filtered out of the current list, so fall back to fetching it by id.
  useSelectOnQueryParam(
    'order',
    (id) => {
      const inList = orders?.find((o) => o.id === id);
      if (inList) {
        setSelectedOrder(inList);
        return;
      }
      supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setSelectedOrder(data as Order);
          else toast.error('Order not found');
        });
    },
    !!orders,
  );


  const { data: orderItems } = useQuery({
    queryKey: ['order-items', selectedOrder?.id],
    queryFn: async () => {
      if (!selectedOrder) return [];
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', selectedOrder.id);
      if (error) throw error;
      return data as OrderItem[];
    },
    enabled: !!selectedOrder,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, prevStatus }: { orderId: string; status: string; prevStatus: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);
      if (error) throw error;
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        entity_type: 'order',
        entity_id: orderId,
        action: 'order.status_changed',
        user_id: userData.user?.id ?? null,
        metadata: { from: prevStatus, to: status },
      });
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-audit-logs', vars.orderId] });
      toast.success('Order status updated');
    },
    onError: () => {
      toast.error('Could not update status');
    },
  });

  const sendConfirmationMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.functions.invoke('comms-send', { body: { kind: 'order_confirmation',  orderId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order confirmation sent');
    },
    onError: (error) => {
      logger.error('Failed to send confirmation:', error);
      toast.error('Could not send order confirmation');
    },
  });

  // Map: order_id -> { id, invoice_number } for orders that already have invoices.
  //
  // This map decides whether a row offers "Create invoice". An order missing
  // from it is read as "not invoiced yet" — a conclusion drawn from ABSENCE,
  // which makes how the read is bounded a billing question, not a display one.
  //
  // It used to be `.ilike('notes', '%order:%')` with no limit: PostgREST stops
  // at 1000 rows and says nothing, so on any shop past its thousandth
  // order-linked invoice the tail was invisible and those orders were offered
  // an invoice they already had. The read is now bound by the QUESTION — the
  // orders this page is actually showing — not by the size of the invoice
  // table, so absence means absence (cure 2).
  //
  // Chunked because both filter forms put the order ids in the URL: 1000 uuids
  // in one request is a header a gateway will refuse, and a refused request
  // would look exactly like "no invoices exist".
  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: invoiceByOrder } = useQuery({
    queryKey: ['orders-invoice-map', orderIds.join(',')],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const map: Record<string, { id: string; invoice_number: string }> = {};
      const CHUNK = 40;
      for (let i = 0; i < orderIds.length; i += CHUNK) {
        const chunk = orderIds.slice(i, i + CHUNK);
        // Two linkages, one request. `order_id` is the real FK and the only one
        // the business cannot edit by accident (migration 20260820220000); the
        // `order:<uuid>` note is the legacy marker, kept read-only for invoices
        // issued before that column existed — send_invoice_for_order heals a row
        // onto the column the first time it resolves one through prose.
        const filter = [
          `order_id.in.(${chunk.join(',')})`,
          ...chunk.map((id) => `notes.ilike.*order:${id}*`),
        ].join(',');
        const { data, error } = await supabase
          .from('invoices')
          .select('id, invoice_number, notes, order_id')
          .or(filter);
        if (error) throw error;
        for (const inv of (data ?? []) as Array<{
          id: string; invoice_number: string; notes: string | null; order_id?: string | null;
        }>) {
          const linked = inv.order_id ?? /order:([0-9a-f-]{36})/i.exec(inv.notes ?? '')?.[1];
          if (linked) map[linked] = { id: inv.id, invoice_number: inv.invoice_number };
        }
      }
      return map;
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke('agent-execute', {
        body: {
          skill_name: 'send_invoice_for_order',
          arguments: { order_id: orderId },
          agent_type: 'flowpilot',
        },
      });
      if (error) throw error;
      const result = (data?.result ?? data) as {
        invoice_id: string;
        invoice_number: string;
      };
      if (!result?.invoice_id) throw new Error('No invoice returned');
      return result;
    },
    onSuccess: (result) => {
      toast.success(`Invoice ${result.invoice_number} ready`, {
        action: {
          label: 'Open',
          onClick: () => navigate('/admin/invoicing'),
        },
      });
      queryClient.invalidateQueries({ queryKey: ['orders-invoice-map'] });
    },
    onError: (e: Error) => toast.error(`Could not create invoice: ${e.message}`),
  });

  // Stats
  const stats = {
    total: orders?.length || 0,
    pending: orders?.filter(o => o.status === 'pending').length || 0,
    paid: orders?.filter(o => o.status === 'paid').length || 0,
    totalRevenue: orders
      ?.filter(o => o.status === 'paid' || o.status === 'completed')
      .reduce((sum, o) => sum + o.total_cents, 0) || 0,
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Orders"
          description="Manage and track customer orders"
        />

        {ordersAtLimit && (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            Showing the {ORDER_LIST_LIMIT} most recent orders. The counts below cover
            only these, and older orders are not checked for existing invoices —
            narrow with the status filter to reach them.
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paid}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.totalRevenue)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <div className="ml-auto">
              <SavedViewsMenu
                scope="orders"
                currentConfig={{ statusFilter }}
                activeViewId={activeViewId}
                onActiveViewChange={setActiveViewId}
                onApply={(cfg) => {
                  if (typeof cfg.statusFilter === 'string') setStatusFilter(cfg.statusFilter);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Separator orientation="vertical" className="h-5" />
            <span className="text-xs text-muted-foreground">Set status:</span>
            <Select onValueChange={(v) => bulkUpdateStatus.mutate(v)} disabled={bulkUpdateStatus.isPending}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUS_OPTIONS.map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No orders found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                 <TableRow>
                   <TableHead className="w-10">
                     <Checkbox
                       checked={
                         (orders?.length ?? 0) > 0 && orders!.every((o) => selectedIds.has(o.id))
                       }
                       onCheckedChange={(checked) => {
                         if (checked) setSelectedIds(new Set(orders!.map((o) => o.id)));
                         else clearSelection();
                       }}
                       aria-label="Select all"
                     />
                   </TableHead>
                   <TableHead>Order</TableHead>
                   <TableHead>Customer</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead>Fulfillment</TableHead>
                   <TableHead>Total</TableHead>
                   <TableHead>Date</TableHead>
                   <TableHead className="w-20"></TableHead>
                 </TableRow>
              </TableHeader>
              <TableBody>
                {orders?.map((order) => (
                  <TableRow key={order.id} data-state={selectedIds.has(order.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleId(order.id)}
                        aria-label={`Select order ${order.id.slice(0, 8)}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {order.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{order.customer_name || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{order.customer_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[order.status] || ''}>
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                     </TableCell>
                     <TableCell>
                       <Badge className={FULFILLMENT_COLORS[(order as any).fulfillment_status] || 'bg-muted text-muted-foreground'}>
                         {FULFILLMENT_LABELS[(order as any).fulfillment_status] || 'Unfulfilled'}
                       </Badge>
                     </TableCell>
                     <TableCell className="font-medium">
                       {formatCurrency(order.total_cents, order.currency)}
                     </TableCell>
                     <TableCell className="text-muted-foreground">
                       {formatDateTime(order.created_at)}
                     </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedOrder(order)}
                          title="View order"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {order.customer_email && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/admin/customer/${encodeURIComponent(order.customer_email)}`)}
                            title="Open Customer 360°"
                          >
                            <UserSearch className="h-4 w-4" />
                          </Button>
                        )}
                        {(() => {
                          const existing = invoiceByOrder?.[order.id];
                          const pending = createInvoiceMutation.isPending && createInvoiceMutation.variables === order.id;
                          if (existing) {
                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate('/admin/invoicing')}
                                title={`View invoice ${existing.invoice_number}`}
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                <span className="text-xs">{existing.invoice_number}</span>
                              </Button>
                            );
                          }
                          return (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => createInvoiceMutation.mutate(order.id)}
                              disabled={pending || !order.customer_email}
                              title="Create invoice from order"
                            >
                              {pending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </Button>
                          );
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <EntityTags entityType="order" entityId={selectedOrder.id} scope="order" />
                <EntityFollowers entityType="order" entityId={selectedOrder.id} compact />
              </div>
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Order ID</p>
                  <p className="font-mono text-sm">{selectedOrder.id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p>{formatDateTime(selectedOrder.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedOrder.customer_name || 'Unknown'}</p>
                  <p className="text-sm text-muted-foreground">{selectedOrder.customer_email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Select
                    value={selectedOrder.status}
                    onValueChange={(status) => {
                      updateStatusMutation.mutate({ orderId: selectedOrder.id, status, prevStatus: selectedOrder.status });
                      setSelectedOrder({ ...selectedOrder, status });
                    }}
                  >
                    <SelectTrigger className="w-40 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_STATUS_OPTIONS.map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                      {/* A legacy row still on 'shipped' (#249) must remain
                          selectable, or the picker renders blank and the
                          operator cannot see — let alone correct — it. */}
                      {!PAYMENT_STATUS_OPTIONS.some(([k]) => k === selectedOrder.status) && (
                        <SelectItem value={selectedOrder.status}>
                          {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Delivery address + chosen method (only for shippable orders) */}
              {(() => {
                const so = selectedOrder as unknown as OrderShippingFields;
                if (!so.shipping_address_line1 && !so.shipping_method) return null;
                return (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-semibold mb-3">Delivery</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {so.shipping_address_line1 && (
                          <div className="text-sm">
                            <p className="text-muted-foreground mb-1">Shipping address</p>
                            <p className="font-medium">{so.shipping_name || selectedOrder.customer_name}</p>
                            <p>{so.shipping_address_line1}</p>
                            {so.shipping_address_line2 && <p>{so.shipping_address_line2}</p>}
                            <p>
                              {so.shipping_postal_code} {so.shipping_city}
                            </p>
                            <p>{so.shipping_country}</p>
                            {so.shipping_phone && (
                              <p className="text-muted-foreground mt-1">{so.shipping_phone}</p>
                            )}
                          </div>
                        )}
                        {so.shipping_method && (
                          <div className="text-sm">
                            <p className="text-muted-foreground mb-1">Delivery method</p>
                            <p className="font-medium">{so.shipping_method}</p>
                            {so.shipping_cost_cents != null && (
                              <p className="text-muted-foreground">
                                {formatCurrency(so.shipping_cost_cents, selectedOrder.currency)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}

              <Separator />

              {/* Fulfillment Progress */}
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">Fulfillment</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    onClick={() => navigate('/admin/inventory?tab=pickpack')}
                  >
                    Pick &amp; Pack
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <FulfillmentStepper
                  status={(selectedOrder as any).fulfillment_status || 'unfulfilled'}
                  pickedAt={(selectedOrder as any).picked_at}
                  packedAt={(selectedOrder as any).packed_at}
                  shippedAt={(selectedOrder as any).shipped_at}
                  deliveredAt={(selectedOrder as any).delivered_at}
                />
                {(selectedOrder as any).tracking_number && (
                  <div className="mt-3 text-sm">
                    <span className="text-muted-foreground">Tracking: </span>
                    {(selectedOrder as any).tracking_url ? (
                      <a href={(selectedOrder as any).tracking_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                        {(selectedOrder as any).tracking_number}
                      </a>
                    ) : (
                      <span className="font-mono">{(selectedOrder as any).tracking_number}</span>
                    )}
                  </div>
                )}
                <div className="mt-4">
                  <FulfillmentActions
                    orderId={selectedOrder.id}
                    currentStatus={(selectedOrder as any).fulfillment_status || 'unfulfilled'}
                    trackingNumber={(selectedOrder as any).tracking_number}
                    trackingUrl={(selectedOrder as any).tracking_url}
                    fulfillmentNotes={(selectedOrder as any).fulfillment_notes}
                    onUpdated={() => {
                      // Refresh selected order in-place so the user sees updated stepper + history
                      supabase
                        .from('orders')
                        .select('*')
                        .eq('id', selectedOrder.id)
                        .single()
                        .then(({ data }) => {
                          if (data) setSelectedOrder(data as Order);
                        });
                    }}
                  />
                </div>
              </div>

              <Separator />

              {/* Order Items */}
              <div>
                <h3 className="font-semibold mb-3">Products</h3>
                <div className="space-y-2">
                  {orderItems?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.quantity} st × {formatCurrency(item.price_cents, selectedOrder.currency)}
                        </p>
                      </div>
                      <p className="font-medium">
                        {formatCurrency(item.price_cents * item.quantity, selectedOrder.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-line fulfillment */}
              {orderItems && orderItems.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Line fulfillment</h3>
                  <OrderLineFulfillment
                    orderId={selectedOrder.id}
                    lines={orderItems.map((i) => ({
                      id: i.id,
                      product_name: i.product_name,
                      quantity: Number(i.quantity),
                      qty_fulfilled: (i as any).qty_fulfilled ?? 0,
                    }))}
                  />
                </div>
              )}

              <Separator />

              {/* Total */}
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total</span>
                <span>{formatCurrency(selectedOrder.total_cents, selectedOrder.currency)}</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => sendConfirmationMutation.mutate(selectedOrder.id)}
                  disabled={sendConfirmationMutation.isPending}
                >
                  {sendConfirmationMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Send Order Confirmation
                </Button>
              </div>

              {/* Stripe Info */}
              {selectedOrder.stripe_checkout_id && (
                <div className="text-xs text-muted-foreground">
                  <p>Stripe Checkout: {selectedOrder.stripe_checkout_id}</p>
                  {selectedOrder.stripe_payment_intent && (
                    <p>Payment Intent: {selectedOrder.stripe_payment_intent}</p>
                  )}
                </div>
              )}

              <Separator />

              {/* Event history (system + audit) */}
              <div>
                <h3 className="font-semibold mb-3">Event History</h3>
                <OrderEventHistory order={selectedOrder} />
              </div>

              <Separator />

              {/* Universal activity timeline */}
              <EntityActivityTimeline entityType="order" entityId={selectedOrder.id} title="Notes & Tasks" compact />
            </div>
          )}
        </DialogContent>
      </Dialog>
      </AdminPageContainer>
    </AdminLayout>
  );
}
