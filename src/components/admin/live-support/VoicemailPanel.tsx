import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Voicemail, Loader2, Play, Pause, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

// Voicemails live on `voice_calls` (status = 'voicemail'), the same source the
// Voice admin view reads. The old panel queried a `voicemail_messages` table
// that was never provisioned, so it always rendered the "not provisioned" state.
interface VoicemailRow {
  id: string;
  from_number: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  callback_status: string | null;
  started_at: string;
}

export function VoicemailPanel() {
  const qc = useQueryClient();
  const [playingId, setPlayingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['voicemail-calls'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_calls')
        .select('id, from_number, duration_seconds, recording_url, transcript, callback_status, started_at')
        .eq('status', 'voicemail')
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as VoicemailRow[];
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
      toast.success('Marked handled');
      qc.invalidateQueries({ queryKey: ['voicemail-calls'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed'),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Voicemail className="h-4 w-4 text-amber-500" />
          Voicemail
          <Badge variant="outline">{data?.length ?? 0}</Badge>
        </CardTitle>
        <CardDescription>
          Inbound voicemails with transcript and recording.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No voicemails.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map(vm => (
              <li key={vm.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {vm.from_number || 'Unknown caller'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(vm.started_at), { addSuffix: true })}
                      {vm.duration_seconds ? ` · ${vm.duration_seconds}s` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">{vm.callback_status ?? 'pending'}</Badge>
                    {vm.recording_url && (
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setPlayingId(playingId === vm.id ? null : vm.id)}
                      >
                        {playingId === vm.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => markDone.mutate(vm.id)}
                      disabled={markDone.isPending}
                      className="gap-1"
                    >
                      <Check className="h-3.5 w-3.5" /> Done
                    </Button>
                  </div>
                </div>

                {playingId === vm.id && vm.recording_url && (
                  <audio src={vm.recording_url} controls autoPlay className="w-full h-8" />
                )}

                {vm.transcript && (
                  <div className="rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                    {vm.transcript}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
