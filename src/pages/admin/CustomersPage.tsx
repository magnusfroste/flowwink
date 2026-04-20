import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, ShoppingCart, Coins, UserCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AggregatedCustomer {
  email: string;
  name: string | null;
  order_count: number;
  total_spent_cents: number;
  currency: string;
  first_order_at: string;
  last_order_at: string;
  has_account: boolean;
}

export default function CustomersPage() {
  // Aggregate customers from orders + augment with profile data when available
  const { data: customers, isLoading } = useQuery({
    queryKey: ['admin-customers-aggregated'],
    queryFn: async () => {
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('customer_email, customer_name, total_cents, currency, created_at, user_id')
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      if (!orders?.length) return [] as AggregatedCustomer[];

      // Group by email (lowercased)
      const map = new Map<string, AggregatedCustomer>();
      for (const o of orders) {
        const email = (o.customer_email || '').toLowerCase().trim();
        if (!email) continue;
        const existing = map.get(email);
        if (existing) {
          existing.order_count += 1;
          existing.total_spent_cents += o.total_cents || 0;
          if (o.created_at < existing.first_order_at) existing.first_order_at = o.created_at;
          if (o.created_at > existing.last_order_at) existing.last_order_at = o.created_at;
          if (!existing.name && o.customer_name) existing.name = o.customer_name;
          if (!existing.has_account && o.user_id) existing.has_account = true;
        } else {
          map.set(email, {
            email,
            name: o.customer_name || null,
            order_count: 1,
            total_spent_cents: o.total_cents || 0,
            currency: o.currency || 'SEK',
            first_order_at: o.created_at,
            last_order_at: o.created_at,
            has_account: !!o.user_id,
          });
        }
      }

      // Sort by total spent desc
      return Array.from(map.values()).sort((a, b) => b.total_spent_cents - a.total_spent_cents);
    },
  });

  const stats = customers
    ? {
        totalCustomers: customers.length,
        totalOrders: customers.reduce((s, c) => s + c.order_count, 0),
        totalRevenue: customers.reduce((s, c) => s + c.total_spent_cents, 0),
        currency: customers[0]?.currency || 'SEK',
        withAccount: customers.filter(c => c.has_account).length,
      }
    : null;

  const formatCurrency = (cents: number, currency: string) =>
    new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(cents / 100);

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Customers"
          description="Aggregated from all orders — including phone, MCP and storefront."
        />

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Unique Customers</p>
                  <p className="text-2xl font-bold">{stats?.totalCustomers ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <UserCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">With Account</p>
                  <p className="text-2xl font-bold">{stats?.withAccount ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-bold">{stats?.totalOrders ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Coins className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Revenue</p>
                  <p className="text-2xl font-bold">
                    {stats ? formatCurrency(stats.totalRevenue, stats.currency) : '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Customer table */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">All Customers</CardTitle>
            <CardDescription>
              Aggregated from orders. Account badge shown when the customer has a registered profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : !customers?.length ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium text-lg mb-1">No customers yet</h3>
                <p className="text-muted-foreground text-sm">
                  Customers appear here when an order is placed — via storefront, phone, or MCP.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Orders</TableHead>
                    <TableHead className="text-right">Lifetime Value</TableHead>
                    <TableHead>Last Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.email}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {customer.name || 'Guest'}
                            </span>
                            {customer.has_account && (
                              <Badge variant="outline" className="text-xs">Account</Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.email}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{customer.order_count}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(customer.total_spent_cents, customer.currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(customer.last_order_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </AdminPageContainer>
    </AdminLayout>
  );
}
