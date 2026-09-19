import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

interface WaitlistEntry {
  waitlist_id: string;
  service: string | null;
  date: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  notes: string | null;
  status: 'waiting' | 'offered' | 'booked' | 'expired' | 'cancelled';
  offered_at: string | null;
  created_at: string;
}

/**
 * The booking waiting list: who asked for a fully booked day. When a booking on
 * that day is cancelled the entries turn "offered" by themselves — this is where
 * staff see who to contact, and close the entry once the time is taken.
 */
export default function BookingWaitlistTab() {
  const qc = useQueryClient();
  const { formatDate } = usePlatformFormat();
  const queryKey = ['booking-waitlist'];

  const { data: entries = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_booking_waitlist' as never, { p_action: 'list' } as never);
      if (error) throw error;
      return ((data as { entries?: WaitlistEntry[] } | null)?.entries ?? []) as WaitlistEntry[];
    },
  });

  const setStatus = async (id: string, status: WaitlistEntry['status']) => {
    const { data, error } = await supabase.rpc('manage_booking_waitlist' as never, {
      p_action: 'set_status', p_waitlist_id: id, p_status: status,
    } as never);
    const result = data as { success?: boolean; error?: string } | null;
    if (error || !result?.success) {
      toast.error(result?.error ?? error?.message ?? 'Could not update the entry');
      return;
    }
    await qc.invalidateQueries({ queryKey });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting list</CardTitle>
        <CardDescription>
          Customers who asked for a fully booked day. A cancellation on that day marks them as offered — contact them in order.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nobody is waiting.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.waitlist_id}>
                  <TableCell>{formatDate(e.date)}</TableCell>
                  <TableCell>{e.service ?? '—'}</TableCell>
                  <TableCell>
                    <div className="font-medium">{e.customer_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.customer_email}{e.customer_phone ? ` · ${e.customer_phone}` : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.status === 'offered' ? 'default' : 'secondary'}>
                      {e.status === 'offered' ? 'A time opened up' : 'Waiting'}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setStatus(e.waitlist_id, 'booked')}>Booked</Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus(e.waitlist_id, 'cancelled')}>Remove</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
