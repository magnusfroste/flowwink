import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, Loader2, PhoneCall, Clock, Check, Smartphone } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

// Callbacks live on `voice_calls` (callback_status pending/scheduled), the same
// source the Voice admin view reads — not the bookings table (which is for
// customer appointments). Reading the wrong table is why this panel was empty.
interface VoiceCallbackRow {
  id: string;
  from_number: string | null;
  transcript: string | null;
  status: string | null;
  callback_status: string | null;
  callback_scheduled_at: string | null;
  started_at: string;
}

export function CallbacksPanel() {
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ['support-callbacks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_calls')
        .select('id, from_number, transcript, status, callback_status, callback_scheduled_at, started_at')
        .in('callback_status', ['pending', 'scheduled'])
        .order('callback_scheduled_at', { ascending: true, nullsFirst: false })
        .order('started_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as VoiceCallbackRow[];
    },
  });

  const markDone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('voice_calls')
        .update({
          callback_status: 'completed',
          callback_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Callback marked done');
      qc.invalidateQueries({ queryKey: ['support-callbacks'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed'),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-violet-500" />
          Callbacks
          <span className="text-xs font-normal text-muted-foreground ml-1">
            · Missed calls & voicemails queued for a callback
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
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
                    {cb.from_number || 'Anonymous caller'}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    {cb.from_number && (
                      <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{cb.from_number}</span>
                    )}
                    {cb.callback_scheduled_at ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />{format(new Date(cb.callback_scheduled_at), 'PP HH:mm')}
                        <span className="text-muted-foreground/70">· {formatDistanceToNow(new Date(cb.callback_scheduled_at), { addSuffix: true })}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/70">Not scheduled</span>
                    )}
                  </p>
                  {cb.transcript && <p className="text-xs mt-1 text-muted-foreground line-clamp-2">{cb.transcript}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{cb.callback_status ?? 'pending'}</Badge>
                  {cb.from_number && (
                    <a href={`tel:${cb.from_number}`} className="inline-flex">
                      <Button size="sm" variant="outline" className="gap-1">
                        <PhoneCall className="h-3.5 w-3.5" /> Call
                      </Button>
                    </a>
                  )}
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => markDone.mutate(cb.id)}
                    disabled={markDone.isPending}
                    className="gap-1"
                  >
                    <Check className="h-3.5 w-3.5" /> Done
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
