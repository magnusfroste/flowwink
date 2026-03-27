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
import { Users, ShoppingCart, MapPin, Heart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CustomerProfile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  avatar_url: string | null;
}

interface CustomerStats {
  totalCustomers: number;
  totalOrders: number;
  totalRevenue: number;
  currency: string;
}

export default function CustomersPage() {
  // Fetch all users with customer role
  const { data: customers, isLoading } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: async () => {
      // Get all user_ids with customer role
      const { data: customerRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'customer');

      if (rolesError) throw rolesError;
      if (!customerRoles?.length) return [];

      const customerIds = customerRoles.map(r => r.user_id);

      // Fetch profiles for those users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at, avatar_url')
        .in('id', customerIds)
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;
      return (profiles || []) as CustomerProfile[];
    },
  });

  // Fetch aggregate stats
  const { data: stats } = useQuery({
    queryKey: ['admin-customer-stats'],
    queryFn: async () => {
      const [ordersRes, wishlistRes] = await Promise.all([
        supabase.from('orders').select('id, total_cents, currency', { count: 'exact' }),
        supabase.from('wishlist_items').select('id', { count: 'exact' }),
      ]);

      const orders = ordersRes.data || [];
      const totalRevenue = orders.reduce((sum, o) => sum + (o.total_cents || 0), 0);

      return {
        totalCustomers: customers?.length || 0,
        totalOrders: ordersRes.count || 0,
        totalWishlistItems: wishlistRes.count || 0,
        totalRevenue,
        currency: orders[0]?.currency || 'SEK',
      };
    },
    enabled: !!customers,
  });

  // Fetch order counts per customer
  const { data: orderCounts } = useQuery({
    queryKey: ['admin-customer-order-counts', customers?.map(c => c.id)],
    queryFn: async () => {
      if (!customers?.length) return {};
      const { data: orders } = await supabase
        .from('orders')
        .select('user_id, id')
        .in('user_id', customers.map(c => c.id));

      const counts: Record<string, number> = {};
      for (const order of (orders || [])) {
        if (order.user_id) {
          counts[order.user_id] = (counts[order.user_id] || 0) + 1;
        }
      }
      return counts;
    },
    enabled: !!customers?.length,
  });

  const formatCurrency = (cents: number, currency: string) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Customers"
          description="E-commerce customers who have registered accounts"
        />

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Customers</p>
                  <p className="text-2xl font-bold">{customers?.length || 0}</p>
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
                  <p className="text-2xl font-bold">{stats?.totalOrders || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Heart className="h-5 w-5 text-primary" />
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
              Users who registered via the storefront
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
                  Customers will appear here when they register through the storefront.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Orders</TableHead>
                    <TableHead>Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                            {customer.avatar_url ? (
                              <img src={customer.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Users className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <span className="font-medium">
                            {customer.full_name || 'Unknown'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.email}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {orderCounts?.[customer.id] || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(customer.created_at), { addSuffix: true })}
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
