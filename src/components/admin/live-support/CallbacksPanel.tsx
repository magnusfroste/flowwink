import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, Loader2, PhoneCall, Clock } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface CallbackRow {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  start_time: string;
  status: string | null;
  notes: string | null;
  metadata: any;
}

export function CallbacksPanel() {
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ['support-callbacks'],
    queryFn: async () => {
      // Callbacks ride on the bookings table — surface anything tagged in
      // metadata.kind = 'callback' OR any future bookings.metadata.channel.
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('start_time', { ascending: true })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as any[]).filter(b => {
        const kind = b?.metadata?.kind ?? b?.metadata?.type;
        return kind === 'callback' || !!b.customer_phone;
      }) as CallbackRow[];
    },
  });

  const request = useMutation({
    mutationFn: async (callback_id: string) => {
      const { data, error } = await supabase.functions.invoke('agent-execute', {
        body: {
          skill_name: 'request_callback',
          arguments: { action: 'mark_attempted', callback_id },
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Marked as attempted');
      qc.invalidateQueries({ queryKey: ['support-callbacks'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed'),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-violet-500" />
          Callbacks
        </CardTitle>
        <CardDescription>
          Scheduled callbacks queued for you and the team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !rows || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No callbacks queued.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map(cb => (
              <li key={cb.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {cb.customer_name || cb.customer_phone || 'Anonymous caller'}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    {cb.customer_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{cb.customer_phone}</span>}
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(cb.start_time), 'PP HH:mm')}</span>
                    <span className="text-muted-foreground/70">· {formatDistanceToNow(new Date(cb.start_time), { addSuffix: true })}</span>
                  </p>
                  {cb.notes && <p className="text-xs mt-1 text-muted-foreground line-clamp-2">{cb.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{cb.status ?? 'pending'}</Badge>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => request.mutate(cb.id)}
                    disabled={request.isPending}
                  >
                    Mark attempted
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
