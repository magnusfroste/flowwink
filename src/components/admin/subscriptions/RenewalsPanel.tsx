import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Calendar, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Renewal {
  id: string;
  customer_email: string;
  customer_name: string | null;
  product_name: string | null;
  current_period_end: string;
  unit_amount_cents: number;
  currency: string;
  status: string;
  cancel_at_period_end: boolean;
  days_until_renewal: number;
}

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency.toUpperCase()}`;
  }
}

export function RenewalsPanel() {
  const qc = useQueryClient();

  const { data: renewals, isLoading } = useQuery({
    queryKey: ['upcoming-renewals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('upcoming_renewals', { p_days_ahead: 14 });
      if (error) throw error;
      return (data ?? []) as Renewal[];
    },
  });

  const { data: atRiskCount } = useQuery({
    queryKey: ['at-risk-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('at_risk', true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const flagMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('flag_at_risk_subscriptions');
      if (error) throw error;
      return data as { flagged: number };
    },
    onSuccess: (data) => {
      toast.success(`Flagged ${data.flagged} subscription(s) as at-risk`);
      qc.invalidateQueries({ queryKey: ['at-risk-count'] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar className="h-4 w-4" /> Renewals (14d)
            </div>
            <div className="text-3xl font-bold mt-1">{renewals?.length ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive" /> At-risk
            </div>
            <div className="text-3xl font-bold mt-1">{atRiskCount ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex flex-col gap-2">
            <div className="text-muted-foreground text-sm">Health sweep</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => flagMutation.mutate()}
              disabled={flagMutation.isPending}
            >
              <ShieldAlert className="h-4 w-4 mr-2" />
              {flagMutation.isPending ? 'Running…' : 'Flag at-risk now'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming renewals (next 14 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !renewals || renewals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No renewals in the next 14 days.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Renews</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renewals.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.customer_name || r.customer_email}</div>
                      {r.customer_name && <div className="text-xs text-muted-foreground">{r.customer_email}</div>}
                    </TableCell>
                    <TableCell>{r.product_name || '—'}</TableCell>
                    <TableCell>{money(r.unit_amount_cents, r.currency)}</TableCell>
                    <TableCell>
                      <div className="text-sm">{format(new Date(r.current_period_end), 'MMM d')}</div>
                      <div className="text-xs text-muted-foreground">in {r.days_until_renewal}d</div>
                    </TableCell>
                    <TableCell>
                      {r.cancel_at_period_end ? (
                        <Badge variant="destructive">Will cancel</Badge>
                      ) : (
                        <Badge variant="default">{r.status}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
