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
import { Button } from '@/components/ui/button';
import { Users, ShoppingCart, Coins, UserCheck, UserSearch } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

interface AggregatedCustomer {
  partner_id: string | null;
  email: string;
  name: string | null;
  is_company: boolean;
  billed_to: string | null;
  order_count: number;
  total_spent_cents: number;
  currency: string;
  first_order_at: string | null;
  last_order_at: string | null;
  has_account: boolean;
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const { formatCurrency } = usePlatformFormat();
  // The customer list reads the CUSTOMER LENS, not the order table.
  //
  // It used to group orders by email. Two consequences, both silent: a customer
  // who was INVOICED but never ordered did not exist here — which is Optic's
  // entire business — and one person with two email addresses was two
  // customers. Orders are now enrichment (spend, count), not the source of
  // truth about who is a customer.
  const { data: customers, isLoading } = useQuery({
    queryKey: ['admin-customers-lens'],
    queryFn: async () => {
      const { data: parties, error: partyError } = await supabase
        .from('v_customers')
        .select('id, name, email, is_company, commercial_partner_id')
        .order('name');
      if (partyError) throw partyError;

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('customer_email, total_cents, currency, created_at, user_id, partner_id')
        .order('created_at', { ascending: false });
      if (ordersError) throw ordersError;

      // Orders roll up onto the party — by party first, email second, so a
      // guest checkout and a later CRM record land on the same customer.
      const byParty = new Map<string, AggregatedCustomer>();
      const nameOf = new Map<string, string>();
      for (const p of parties ?? []) nameOf.set(p.id, p.name);

      for (const p of parties ?? []) {
        byParty.set(p.id, {
          partner_id: p.id,
          email: (p.email ?? '').toLowerCase(),
          name: p.name,
          is_company: p.is_company,
          billed_to: p.commercial_partner_id && p.commercial_partner_id !== p.id
            ? nameOf.get(p.commercial_partner_id) ?? null
            : null,
          order_count: 0,
          total_spent_cents: 0,
          currency: 'SEK',
          first_order_at: null,
          last_order_at: null,
          has_account: false,
        });
      }

      const byEmail = new Map<string, AggregatedCustomer>();
      for (const c of byParty.values()) if (c.email) byEmail.set(c.email, c);

      for (const o of orders ?? []) {
        const email = (o.customer_email || '').toLowerCase().trim();
        const target = (o.partner_id && byParty.get(o.partner_id)) || byEmail.get(email);
        if (!target) continue;   // an order for a party outside the lens
        target.order_count += 1;
        target.total_spent_cents += o.total_cents || 0;
        target.currency = o.currency || target.currency;
        if (!target.first_order_at || o.created_at < target.first_order_at) target.first_order_at = o.created_at;
        if (!target.last_order_at || o.created_at > target.last_order_at) target.last_order_at = o.created_at;
        if (o.user_id) target.has_account = true;
      }

      return Array.from(byParty.values())
        .sort((a, b) => b.total_spent_cents - a.total_spent_cents || (a.name ?? '').localeCompare(b.name ?? ''));
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
                    {stats ? formatCurrency(stats.totalRevenue, stats.currency, { minimumFractionDigits: 0 }) : '—'}
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
                    <TableHead className="w-16"></TableHead>
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
                        {formatCurrency(customer.total_spent_cents, customer.currency, { minimumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {/* En kund kan ha fakturerats utan att ha beställt — hela
                            Optics modell. new Date(null) blir 1970 och hade
                            visat "för 56 år sedan". */}
                        {customer.last_order_at
                          ? formatDistanceToNow(new Date(customer.last_order_at), { addSuffix: true })
                          : <span className="italic">no orders</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/customer/${encodeURIComponent(customer.email || customer.partner_id || '')}`)}
                          title="Open Customer 360°"
                        >
                          <UserSearch className="h-4 w-4" />
                        </Button>
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
