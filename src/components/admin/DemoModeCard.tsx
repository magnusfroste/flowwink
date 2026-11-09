import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const KEY = 'demo_mode';
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/demo-cycle`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * Demo Mode toggle. When enabled, schedules the `demo-cycle` edge function
 * daily via pg_cron on THIS instance (each self-hosted FlowWink site owns
 * its own cron job). Intended for the public demo instance only.
 */
export function DemoModeCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['site_settings', KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', KEY)
        .maybeSingle();
      if (error) throw error;
      const v: any = data?.value;
      return v === true || v?.enabled === true;
    },
  });

  useEffect(() => {
    if (typeof data === 'boolean') setEnabled(data);
  }, [data]);

  const cronStatus = useQuery({
    queryKey: ['demo_cycle_cron_status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('demo_cycle_cron_status' as any);
      if (error) throw error;
      return data as {
        scheduled: boolean;
        schedule?: string;
        active?: boolean;
        last_run_at?: string | null;
        last_status?: string | null;
        last_message?: string | null;
      };
    },
    refetchInterval: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      // The toggle's value carries WHICH template the nightly rebuild restores
      // ({enabled, template_id}) — copied from the installed_template marker at
      // enable time, because the wipe truncates that table while site_settings
      // survives it. The answer must live where the night cannot reach.
      let templateId: string | undefined;
      if (next) {
        const { data: tpl } = await supabase
          .from('installed_template')
          .select('template_id')
          .order('installed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        templateId = tpl?.template_id ?? undefined;
      }
      const value = next ? { enabled: true, ...(templateId ? { template_id: templateId } : {}) } : false;
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: KEY, value: value as any }, { onConflict: 'key' });
      if (error) throw error;

      if (next) {
        const { error: cronErr } = await supabase.rpc('enable_demo_cycle_cron' as any, {
          p_function_url: FN_URL,
          p_anon_key: ANON_KEY,
        });
        if (cronErr) throw new Error(`Toggle saved, but cron schedule failed: ${cronErr.message}`);

        // Stage the demo data NOW rather than at 03:00 — a toggle that promises
        // a demo instance and delivers it tomorrow reads as a broken switch.
        // Deliberately skip_rebuild: enabling must never destroy anything. The
        // wipe belongs to the announced nightly schedule, where the card's own
        // warning is what makes it fair.
        // demo-cycle admits an admin session, the service key or the cron
        // secret — never the publishable key (2026-11-09).
        const { data: sessionData } = await supabase.auth.getSession();
        const res = await fetch(FN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionData.session?.access_token ?? ANON_KEY}`,
          },
          body: JSON.stringify({ skip_rebuild: true }),
        });
        const seedResult = res.ok ? await res.json().catch(() => null) : null;
        return { next, seeded: seedResult?.modules_seeded as number | undefined };
      } else {
        const { error: cronErr } = await supabase.rpc('disable_demo_cycle_cron' as any);
        if (cronErr) throw new Error(`Toggle saved, but cron unschedule failed: ${cronErr.message}`);
      }
      return { next, seeded: undefined as number | undefined };
    },
    onSuccess: ({ next, seeded }) => {
      qc.invalidateQueries({ queryKey: ['site_settings', KEY] });
      qc.invalidateQueries({ queryKey: ['demo_cycle_cron_status'] });
      toast({
        title: next ? 'Demo mode enabled' : 'Demo mode disabled',
        description: next
          ? `Scheduled daily${typeof seeded === 'number' ? ` — demo data staged across ${seeded} modules.` : '. Demo data staging may still be running.'}`
          : 'demo-cycle unscheduled on this instance.',
      });
    },
    onError: (err: any) => {
      setEnabled(data === true);
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' });
    },
  });

  const status = cronStatus.data;
  const lastFailed = status?.last_status && status.last_status !== 'succeeded';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          Demo Mode
        </CardTitle>
        <CardDescription>
          Enable only on a dedicated, disposable demo instance. Every night at 03:00 UTC
          the <code>demo-cycle</code> job rebuilds this instance from its template:{' '}
          <strong>all content, settings changes and user accounts are destroyed</strong>{' '}
          (except the shared demo admin), then fresh demo data is staged across every module
          that has a seeder. Turning this on stages that data immediately — it does not
          wipe anything until the first nightly run. If people you know by name use this
          instance, this switch is not for it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Demo cycle active</Label>
            <p className="text-sm text-muted-foreground">
              Off on customer sites. Nightly: full rebuild to template + fresh demo data.
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={isLoading || mutation.isPending}
            onCheckedChange={(next) => {
              setEnabled(next);
              mutation.mutate(next);
            }}
          />
        </div>

        <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">Cron schedule</span>
            {status?.scheduled ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {status.schedule} {status.active === false && '(inactive)'}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                not scheduled
              </Badge>
            )}
          </div>
          {status?.scheduled && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Last run</span>
              <span>
                {status.last_run_at
                  ? `${formatDistanceToNow(new Date(status.last_run_at), { addSuffix: true })} · ${status.last_status ?? 'unknown'}`
                  : 'no runs yet'}
              </span>
            </div>
          )}
          {lastFailed && status?.last_message && (
            <p className="text-xs text-destructive break-words">{status.last_message}</p>
          )}
        </div>

        {enabled && (
          <Alert variant="destructive">
            <AlertDescription>
              All non-template data in pilot modules will be reset every night at 03:00 UTC.
              Do not store real customer data on this instance.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
