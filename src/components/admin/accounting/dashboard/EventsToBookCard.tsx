import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashCard, BigFigure, Subline, QuietEmpty } from './_shared';
import { useModuleAccess } from '@/hooks/useRoleModuleAccess';

interface ProposalsSummary {
  summary: { total: number; auto: number; propose: number; escalate: number };
}

async function invokeSkill<T>(skill_name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('agent-execute', {
    body: { skill_name, arguments: args, agent_type: 'flowpilot' },
  });
  if (error) throw error;
  return (data?.result ?? data) as T;
}

export function EventsToBookCard({ onNavigate }: { onNavigate?: (tabId: string) => void }) {
  // The proposals are the Bank & reconciliation module's skill. A role with
  // accounting but not reconciliation (purchasing, by default) was answered
  // 403 on every Overview load (role sweep, 2026-11-02): ask only when the
  // matrix lets this person run it, and say who does otherwise.
  const { canAccess } = useModuleAccess();
  const allowed = canAccess('reconciliation');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dash', 'events-to-book'],
    queryFn: () => invokeSkill<ProposalsSummary>('propose_bookkeeping', {}),
    staleTime: 60_000,
    enabled: allowed,
  });

  const s = data?.summary;

  return (
    <DashCard label="Events to book" onClick={() => onNavigate?.('events_to_book')}>
      {!allowed ? (
        <QuietEmpty>Bank events are booked by whoever has Bank &amp; reconciliation.</QuietEmpty>
      ) : isLoading ? (
        <QuietEmpty>Loading…</QuietEmpty>
      ) : isError ? (
        <QuietEmpty>No data yet.</QuietEmpty>
      ) : !s || s.total === 0 ? (
        <>
          <BigFigure value="0" />
          <Subline>Nothing to book — all caught up.</Subline>
        </>
      ) : (
        <>
          <BigFigure value={String(s.total)} />
          <Subline>
            {s.auto} ready to auto-book · {s.propose} to review · {s.escalate} need template
          </Subline>
        </>
      )}
    </DashCard>
  );
}
