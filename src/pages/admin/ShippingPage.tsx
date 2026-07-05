import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Truck } from 'lucide-react';
import { ShippingRatesPanel } from '@/components/admin/shipping/ShippingRatesPanel';

interface Carrier { id: string; code: string; name: string; tracking_url_template: string | null; is_active: boolean; }
interface Shipment { id: string; order_id: string; carrier_code: string | null; tracking_number: string | null; status: string; shipped_at: string | null; }

export default function ShippingPage() {
  const { data: carriers } = useQuery({
    queryKey: ['carriers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('carriers' as any).select('*').order('code');
      if (error) throw error;
      return (data ?? []) as unknown as Carrier[];
    },
  });
  const { data: shipments } = useQuery({
    queryKey: ['shipments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shipments' as any).select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Shipment[];
    },
  });

  return (
    <AdminLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Truck className="h-7 w-7" /> Shipping
          </h1>
          <p className="text-muted-foreground mt-1">Carriers and outbound parcels.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Carriers</CardTitle>
            <CardDescription>Built-in: PostNord, DHL, Bring. Add API credentials via secrets.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Tracking template</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(carriers ?? []).map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-md">{c.tracking_url_template ?? '—'}</TableCell>
                    <TableCell>{c.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <ShippingRatesPanel />


        <Card>
          <CardHeader>
            <CardTitle>Recent shipments</CardTitle>
            <CardDescription>Up to 50 most recent parcels across all orders.</CardDescription>
          </CardHeader>
          <CardContent>
            {(shipments?.length ?? 0) === 0 ? (
              <p className="text-center text-muted-foreground py-8">No shipments yet.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Order</TableHead><TableHead>Carrier</TableHead><TableHead>Tracking</TableHead><TableHead>Status</TableHead><TableHead>Shipped</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(shipments ?? []).map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.order_id.slice(0, 8)}</TableCell>
                      <TableCell>{s.carrier_code ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{s.tracking_number ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.shipped_at ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
