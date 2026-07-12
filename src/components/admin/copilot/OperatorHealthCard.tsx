/**
 * OperatorHealthCard
 *
 * "In 5 seconds, is FlowPilot alive and what mode is it in?"
 *
 * Read-only pulse of the engine + one control: autonomy posture
 * (site_settings key `flowpilot_autonomy`, value.posture).
 *
 * Explicitly NOT a cron management UI — cadence is fixed. The owner
 * shapes WHAT the operator may do via policies and approvals, not HOW
 * OFTEN it runs.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Activity, ShieldCheck, ShieldAlert, Loader2, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Posture = 'proving' | 'guarded';
const SETTINGS_KEY = 'flowpilot_autonomy';
const REFETCH_MS = 60_000;

// ─── Posture ─────────────────────────────────────────────────────────────────

function usePosture() {
  return useQuery({
    queryKey: ['site_settings', SETTINGS_KEY],
    queryFn: async (): Promise<Posture> => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value as { posture?: string } | null) ?? null;
      return v?.posture === 'proving' ? 'proving' : 'guarded';
    },
    refetchInterval: REFETCH_MS,
  });
}

function useSetPosture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (posture: Posture) => {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: SETTINGS_KEY, value: { posture } as never }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: (_, posture) => {
      qc.invalidateQueries({ queryKey: ['site_settings', SETTINGS_KEY] });
      toast.success(
        posture === 'proving'
          ? 'Posture set to Proving — FlowPilot will act autonomously.'
          : 'Posture set to Guarded — gated actions will request approval.',
      );
    },
    onError: (e: Error) => toast.error('Could not update posture', { description: e.message }),
  });
}

// ─── Engine pulses ───────────────────────────────────────────────────────────

interface PulseRow {
  label: string;
  ts: string | null;
  ok: boolean | null; // null = never run
  detail?: string;
}

function useHeartbeatPulse() {
  return useQuery({
    queryKey: ['operator-health', 'heartbeat'],
    queryFn: async (): Promise<PulseRow> => {
      const { data, error } = await supabase
        .from('agent_activity')
        .select('created_at, status')
        .eq('skill_name', 'heartbeat')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      return {
        label: 'Heartbeat',
        ts: row?.created_at ?? null,
        ok: row ? row.status === 'success' : null,
        detail: row?.status ?? undefined,
      };
    },
    refetchInterval: REFETCH_MS,
  });
}

function useResumePulse() {
  return useQuery({
    queryKey: ['operator-health', 'resume'],
    queryFn: async (): Promise<PulseRow> => {
      // Latest resume-sweep activity. Multiple skill names have been used
      // over the resume feature's life — match any of them, plus the
      // conventional agent tag.
      const { data, error } = await supabase
        .from('agent_activity')
        .select('created_at, status, skill_name')
        .in('skill_name', ['resume_sweep', 'flowpilot_resume', 'approval_resume'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      return {
        label: 'Approval-resume sweep',
        ts: row?.created_at ?? null,
        ok: row ? row.status === 'success' : null,
        detail: row?.status ?? undefined,
      };
    },
    refetchInterval: REFETCH_MS,
  });
}

function usePendingApprovals() {
  return useQuery({
    queryKey: ['operator-health', 'pending-approvals'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('approval_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: REFETCH_MS,
  });
}

// ─── UI bits ─────────────────────────────────────────────────────────────────

function StatusDot({ ok }: { ok: boolean | null }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        ok === null && 'bg-muted-foreground/40',
        ok === true && 'bg-emerald-500',
        ok === false && 'bg-destructive',
      )}
      aria-hidden
    />
  );
}

function PulseLine({ row }: { row: PulseRow }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot ok={row.ok} />
        <span className="text-foreground truncate">{row.label}</span>
      </div>
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {row.ts ? `${formatDistanceToNow(new Date(row.ts))} ago` : 'never'}
      </span>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OperatorHealthCard() {
  const { isAdmin } = useAuth();
  const posture = usePosture();
  const setPosture = useSetPosture();
  const heartbeat = useHeartbeatPulse();
  const resume = useResumePulse();
  const pending = usePendingApprovals();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const current: Posture = posture.data ?? 'guarded';
  const next: Posture = current === 'proving' ? 'guarded' : 'proving';

  const pendingRow: PulseRow = {
    label: 'Pending approvals',
    ts: null,
    ok: pending.data === undefined ? null : pending.data === 0,
    detail: pending.data !== undefined ? `${pending.data}` : undefined,
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Operator Health
            </CardTitle>

            {/* Posture badge */}
            {current === 'proving' ? (
              <Badge
                variant="outline"
                className="bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400"
              >
                <ShieldAlert className="h-3 w-3 mr-1" />
                Proving — acts autonomously, records everything
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400"
              >
                <ShieldCheck className="h-3 w-3 mr-1" />
                Guarded — asks approval for gated actions
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Pulses */}
          <div className="divide-y divide-border/60">
            <PulseLine row={heartbeat.data ?? { label: 'Heartbeat', ts: null, ok: null }} />
            <PulseLine row={resume.data ?? { label: 'Approval-resume sweep', ts: null, ok: null }} />
            <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <StatusDot ok={pendingRow.ok} />
                <span className="text-foreground truncate">Pending approvals</span>
              </div>
              <span
                className={cn(
                  'text-xs whitespace-nowrap tabular-nums',
                  pending.data && pending.data > 0 ? 'text-destructive font-medium' : 'text-muted-foreground',
                )}
              >
                {pending.data ?? '—'}
              </span>
            </div>
          </div>

          {/* Admin toggle */}
          {isAdmin && (
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/60">
              <p className="text-xs text-muted-foreground">
                {current === 'proving'
                  ? 'Proving mode: gated skills execute without waiting for approval.'
                  : 'Guarded mode: gated skills route through the approval queue.'}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={posture.isLoading || setPosture.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                {setPosture.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Switch to {next === 'proving' ? 'Proving' : 'Guarded'}
              </Button>
            </div>
          )}

          {/* Footer note */}
          <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5 pt-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            Engine cadence is fixed (heartbeat hourly, approval-resume every 5 min).
            Control <em>what</em> FlowPilot may do via policies and approvals — not how often it runs.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch autonomy posture to {next === 'proving' ? 'Proving' : 'Guarded'}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-foreground">Guarded</span> — the safe default.
                  Gated skills (anything marked <code>approve</code>) are staged and require a human
                  decision before execution.
                </div>
                <div>
                  <span className="font-medium text-foreground">Proving</span> — FlowPilot executes
                  gated skills autonomously and records everything to the audit trail. Use when you
                  want to observe autonomy end-to-end.
                </div>
                <div className="text-muted-foreground">
                  Explicit per-skill / per-category policies always win over the posture.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPosture.mutate(next);
                setConfirmOpen(false);
              }}
            >
              Set to {next === 'proving' ? 'Proving' : 'Guarded'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
