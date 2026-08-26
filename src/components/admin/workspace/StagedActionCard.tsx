import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, ShieldAlert, Play, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { StagedAction } from '@/hooks/useWorkspaceChat';
import {
  extractExecutionError,
  isUnfinished,
  outcomeFromPendingOperation,
  summarizeExecutionResult,
  type StagedOutcome,
  type StagedResolution,
} from '@/lib/staged-action-outcome';

/**
 * The approval card — where initiative changes hands.
 *
 * FlowWork's model can PREPARE a write (the platform stages it as a
 * pending_operation) but can never execute one: the approval flags are
 * stripped from model arguments server-side. This card is the only path from
 * proposal to execution, and the click is the human's — approve runs
 * approve_pending_operation and then re-invokes the skill with the operation
 * id, which agent-execute verifies is genuinely approved and unexpired.
 */
interface Props {
  action: StagedAction;
  onResolved: (resolution: StagedResolution, note?: string) => void;
}

const HIDDEN_ARGS = new Set(['_approved', '_approved_operation_id']);

/**
 * How each outcome reads. 'executed' and 'approved' are separate labels on
 * purpose: an operation that was approved but whose execution was never
 * recorded is not a done deal, and must not wear the green checkmark.
 */
const RESOLVED_META: Record<
  StagedResolution,
  { Icon: typeof CheckCircle2; cls: string; label: string }
> = {
  executed: { Icon: CheckCircle2, cls: 'text-success', label: 'Utförd' },
  approved: { Icon: Clock, cls: 'text-warning', label: 'Godkänd – utförande obekräftat' },
  rejected: { Icon: XCircle, cls: 'text-muted-foreground', label: 'Avvisad' },
  failed: { Icon: ShieldAlert, cls: 'text-destructive', label: 'Misslyckades' },
  expired: { Icon: Clock, cls: 'text-muted-foreground', label: 'Utgången' },
};

export function StagedActionCard({ action, onResolved }: Props) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const argRows = Object.entries(action.args || {}).filter(
    ([k, v]) => !HIDDEN_ARGS.has(k) && v !== undefined && v !== null && v !== '',
  );

  /**
   * Read the outcome back off the operation row — the one writer of it.
   *
   * The invoke response is only a courier; `pending_operations.status` +
   * `execution_result` are what survives a reload, so the card shows exactly
   * what the next load will show. The courier's version is the fallback for
   * when the row itself cannot be read (RLS, offline).
   */
  const readOutcome = async (fallback: StagedOutcome): Promise<StagedOutcome> => {
    try {
      const { data, error } = await supabase
        .from('pending_operations')
        .select('id, status, execution_result, rejection_reason, expires_at')
        .eq('id', action.operation_id)
        .maybeSingle();
      if (error || !data) {
        if (error) logger.error('read pending operation outcome failed', error);
        return fallback;
      }
      return outcomeFromPendingOperation(data) ?? fallback;
    } catch (e) {
      logger.error('read pending operation outcome threw', e);
      return fallback;
    }
  };

  const settle = async (fallback: StagedOutcome) => {
    const outcome = await readOutcome(fallback);
    onResolved(outcome.resolution, outcome.note ?? fallback.note);
  };

  const approve = async () => {
    setBusy('approve');
    try {
      // Direct RPC, same path as the other approval surfaces — the DB function
      // carries the gate (creator | approvals module | admin). Going through
      // the skill layer required the approvals MODULE even for confirming
      // your own staged action (Svante, 2026-08-19).
      const { data: apr, error: aprErr } = await supabase.rpc('approve_pending_operation', { p_id: action.operation_id });
      if (aprErr) throw new Error(aprErr.message);
      if ((apr as Record<string, unknown>)?.error) throw new Error(String((apr as Record<string, unknown>).error));
      // Re-invoke with the operation id — agent-execute verifies the approval
      // server-side. Direct invoke (not callSkill) so a pending_approval on a
      // double-gated skill surfaces as text instead of a thrown error.
      const { data, error } = await supabase.functions.invoke('agent-execute', {
        body: {
          skill_name: action.skill,
          arguments: { ...action.args, ...action.reinvoke_args },
          agent_type: 'admin_ui',
        },
      });
      if (error) throw new Error(error.message);
      if (data?.status === 'pending_approval') {
        await settle({
          resolution: 'approved',
          note: 'Kräver även beslut i /admin/approvals (dubbelgrindad åtgärd). Ingenting är utfört ännu.',
        });
      } else if (data?.status === 'failed' || data?.error) {
        await settle({
          resolution: 'failed',
          note:
            extractExecutionError(data?.result) ??
            extractExecutionError(data?.error) ??
            'Utförandet misslyckades',
        });
      } else {
        await settle({ resolution: 'executed', note: summarizeExecutionResult(data?.result) });
      }
    } catch (e) {
      await settle({
        resolution: 'failed',
        note: e instanceof Error ? e.message : 'Kunde inte utföra',
      });
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy('reject');
    try {
      const { data: rej, error: rejErr } = await supabase.rpc('reject_pending_operation', {
        p_id: action.operation_id,
        p_reason: 'Avvisad i FlowWork',
      });
      if (rejErr) throw new Error(rejErr.message);
      if ((rej as Record<string, unknown>)?.error) throw new Error(String((rej as Record<string, unknown>).error));
      await settle({ resolution: 'rejected' });
    } catch (e) {
      await settle({
        resolution: 'failed',
        note: e instanceof Error ? e.message : 'Kunde inte avvisa',
      });
    } finally {
      setBusy(null);
    }
  };

  if (action.resolution) {
    const meta = RESOLVED_META[action.resolution] ?? RESOLVED_META.failed;
    const Icon = meta.Icon;
    const failed = action.resolution === 'failed';
    return (
      <div
        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm max-w-[90%] ${
          failed ? 'border-destructive/40 bg-destructive/5' : 'border-border/60 bg-muted/30'
        }`}
      >
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.cls}`} />
        <div className="min-w-0 flex-1 space-y-1">
          <div>
            <span className="font-medium">{meta.label}:</span>{' '}
            <span className="font-mono text-xs">{action.skill}</span>
          </div>
          {/* Says out loud that nothing changed. A failure that reads like a
              detail line is how "ingenting hände" happened. */}
          {isUnfinished(action.resolution) && (
            <p className={`text-xs font-medium ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>
              Ingenting utfördes.
            </p>
          )}
          {action.result_note &&
            (failed ? (
              // Whole message, never clipped: these are usually self-correcting
              // instructions ("missing required parameter(s) title …") and the
              // half you cut is the half that tells you what to do.
              <pre className="text-xs font-mono whitespace-pre-wrap break-words rounded bg-destructive/10 text-destructive px-2 py-1.5 max-h-64 overflow-y-auto">
                {action.result_note}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground break-words whitespace-pre-wrap">
                {action.result_note}
              </p>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 max-w-[90%] space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Play className="h-4 w-4 text-primary" />
        Föreslagen åtgärd
        <Badge variant="outline" className="text-[10px] font-mono">{action.skill}</Badge>
      </div>
      {argRows.length > 0 && (
        <dl className="text-xs space-y-0.5">
          {argRows.slice(0, 8).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-muted-foreground shrink-0 font-mono">{k}</dt>
              <dd className="truncate">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {action.resolved?.map((r) => (
        <p key={r} className="text-[11px] text-muted-foreground font-mono">↳ {r}</p>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Inget är utfört ännu. Åtgärden väntar på ditt beslut.
      </p>
      <div className="flex items-center gap-2 pt-0.5">
        <Button size="sm" className="h-7 text-xs gap-1" onClick={approve} disabled={busy !== null}>
          {busy === 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          Godkänn & utför
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={reject} disabled={busy !== null}>
          Avvisa
        </Button>
      </div>
    </div>
  );
}
