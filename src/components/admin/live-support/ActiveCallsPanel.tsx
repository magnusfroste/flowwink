/**
 * ActiveCallsPanel — receptionist's "answer station" for incoming voice calls.
 *
 * Today the call is auto-forwarded to the agent's mobile (see elks46-ingest).
 * This panel surfaces *who* is calling in real time so the receptionist can:
 *   - See the caller number + how long it has been ringing
 *   - Send a quick "we'll call you back" SMS
 *   - Schedule a callback
 *   - Mark the call as handled
 *
 * Future: when the in-browser softphone (WebRTC/SIP) is wired up, an
 * "Answer here" button will appear on each card.
 */
import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVoiceCalls, useUpdateVoiceCall, type VoiceCallRow } from '@/hooks/useVoice';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, PhoneCall, CalendarClock, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function ActiveCallsPanel() {
  const qc = useQueryClient();
  const { data: calls = [] } = useVoiceCalls({ status: 'ringing', limit: 10 });
  const update = useUpdateVoiceCall();

  // Realtime: refetch when a new ringing call lands or status changes
  useEffect(() => {
    const ch = supabase
      .channel('live-support-active-calls')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_calls' },
        () => qc.invalidateQueries({ queryKey: ['voice-calls'] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const active = useMemo(
    () => calls.filter(c => c.direction === 'inbound' && c.status === 'ringing'),
    [calls],
  );

  if (active.length === 0) return null;

  return (
    <div className="px-4 pt-3">
      <div className="flex items-center gap-2 mb-2 text-sm font-medium">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
        </span>
        Incoming call{active.length > 1 ? 's' : ''} ({active.length})
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {active.map(call => (
          <CallCard
            key={call.id}
            call={call}
            onMarkHandled={() =>
              update.mutate({ id: call.id, patch: { status: 'completed', ended_at: new Date().toISOString() } as never })
            }
            onScheduleCallback={() =>
              update.mutate({
                id: call.id,
                patch: {
                  callback_status: 'scheduled',
                  callback_scheduled_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                } as never,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function CallCard({
  call,
  onMarkHandled,
  onScheduleCallback,
}: {
  call: VoiceCallRow;
  onMarkHandled: () => void;
  onScheduleCallback: () => void;
}) {
  return (
    <Card className="border-green-500/40 bg-green-500/5">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-green-500/15 p-2.5">
            <PhoneCall className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-base truncate">{call.from_number}</p>
            <p className="text-xs text-muted-foreground">
              Ringing {formatDistanceToNow(new Date(call.started_at), { addSuffix: true })}
            </p>
            <Badge variant="outline" className="mt-1 text-[10px]">
              <Phone className="h-2.5 w-2.5 mr-1" />
              Forwarding to mobile
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={onScheduleCallback}>
            <CalendarClock className="h-3 w-3" />
            Callback
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={onMarkHandled}>
            <CheckCircle2 className="h-3 w-3" />
            Done
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
