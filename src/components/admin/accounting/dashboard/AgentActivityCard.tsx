import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashCard, Subline, QuietEmpty, fmtSek } from './_shared';

const AGENT_SOURCES = ['mcp', 'agent', 'flowpilot'];

interface Result {
  count: number;
  sumCents: number;
  recent: Array<{ description: string | null; entry_date: string }>;
}

export function AgentActivityCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dash', 'agent-activity'],
    queryFn: async (): Promise<Result> => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: entries, error } = await supabase
        .from('journal_entries')
        .select('id, description, entry_date, created_at')
        .in('source', AGENT_SOURCES)
        .gte('created_at', weekAgo)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = entries ?? [];
      const ids = list.map((e) => e.id);
      let sumCents = 0;
      if (ids.length) {
        const { data: lines } = await supabase
          .from('journal_entry_lines')
          .select('debit_cents, journal_entry_id')
          .in('journal_entry_id', ids);
        sumCents = (lines ?? []).reduce((s, l: any) => s + (l.debit_cents ?? 0), 0);
      }
      return {
        count: list.length,
        sumCents,
        recent: list.slice(0, 3).map((e) => ({ description: e.description, entry_date: e.entry_date })),
      };
    },
    staleTime: 60_000,
  });

  return (
    <DashCard label="Agent activity">
      {isLoading ? (
        <QuietEmpty>Loading…</QuietEmpty>
      ) : isError ? (
        <QuietEmpty>No data yet.</QuietEmpty>
      ) : !data || data.count === 0 ? (
        <QuietEmpty>No agent bookings this week.</QuietEmpty>
      ) : (
        <>
          <div className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {data.count}
          </div>
          <Subline>
            entries booked by agents this week · {fmtSek(data.sumCents)} volume
          </Subline>
          {data.recent.length > 0 && (
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {data.recent.map((r, i) => (
                <li key={i} className="flex items-center gap-2 min-w-0">
                  <span className="tabular-nums shrink-0">
                    {new Date(r.entry_date).toLocaleDateString('en-US', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                  <span className="truncate text-foreground/80">
                    {r.description || '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </DashCard>
  );
}
