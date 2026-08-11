import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, ShieldAlert, Play } from 'lucide-react';
import { callSkill } from '@/lib/call-skill';
import { supabase } from '@/integrations/supabase/client';
import type { StagedAction } from '@/hooks/useWorkspaceChat';

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
  onResolved: (resolution: 'approved' | 'rejected' | 'failed', note?: string) => void;
}

const HIDDEN_ARGS = new Set(['_approved', '_approved_operation_id']);

export function StagedActionCard({ action, onResolved }: Props) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const argRows = Object.entries(action.args || {}).filter(
    ([k, v]) => !HIDDEN_ARGS.has(k) && v !== undefined && v !== null && v !== '',
  );

  const approve = async () => {
    setBusy('approve');
    try {
      await callSkill('approve_pending_operation', { p_id: action.operation_id });
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
        onResolved('approved', 'Kräver även beslut i /admin/approvals (dubbelgrindad åtgärd).');
      } else if (data?.status === 'failed' || data?.error) {
        onResolved('failed', String(data?.error ?? 'Utförandet misslyckades'));
      } else {
        const summary = typeof data?.result === 'object' && data?.result
          ? Object.entries(data.result as Record<string, unknown>)
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${typeof v === 'object' ? '…' : String(v)}`)
              .join(' · ')
          : undefined;
        onResolved('approved', summary);
      }
    } catch (e) {
      onResolved('failed', e instanceof Error ? e.message : 'Kunde inte utföra');
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy('reject');
    try {
      await callSkill('reject_pending_operation', {
        p_id: action.operation_id,
        p_reason: 'Avvisad i FlowWork',
      });
      onResolved('rejected');
    } catch (e) {
      onResolved('failed', e instanceof Error ? e.message : 'Kunde inte avvisa');
    } finally {
      setBusy(null);
    }
  };

  if (action.resolution) {
    const meta = {
      approved: { Icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400', label: 'Utförd' },
      rejected: { Icon: XCircle, cls: 'text-muted-foreground', label: 'Avvisad' },
      failed: { Icon: ShieldAlert, cls: 'text-destructive', label: 'Misslyckades' },
    }[action.resolution];
    const Icon = meta.Icon;
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm max-w-[90%]">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.cls}`} />
        <div className="min-w-0">
          <span className="font-medium">{meta.label}:</span>{' '}
          <span className="font-mono text-xs">{action.skill}</span>
          {action.result_note && (
            <p className="text-xs text-muted-foreground mt-0.5 break-words">{action.result_note}</p>
          )}
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
