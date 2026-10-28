import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DashCard, BigFigure, Subline, QuietEmpty } from './_shared';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { cn } from '@/lib/utils';

/** The shape check_books returns (20261026130000). */
export interface BooksFinding {
  id: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  label: string;
  detail: string;
  fix?: { skill: string; args?: Record<string, unknown> } | null;
  tab?: string | null;
}

export interface BooksDeadline {
  id: string;
  kind: string;
  label: string;
  due_date: string;
  days_left: number;
  status: 'due_soon' | 'upcoming';
}

export interface BooksHealth {
  as_of: string;
  ok: boolean;
  summary: { high: number; medium: number; low: number; total: number };
  findings: BooksFinding[];
  next_deadlines: BooksDeadline[];
  calendar_note?: string | null;
}

/** Findings that point outside the accounting page open that module instead. */
const MODULE_ROUTES: Record<string, string> = {
  invoices: '/admin/invoices',
  purchasing: '/admin/purchasing',
  expenses: '/admin/expenses',
  approvals: '/admin/approvals',
  system: '/admin/system',
};

function useBooksHealth() {
  return useQuery({
    queryKey: ['dash', 'books-health'],
    queryFn: async (): Promise<BooksHealth> => {
      const { data, error } = await supabase.rpc('check_books' as never);
      if (error) throw error;
      return data as unknown as BooksHealth;
    },
    staleTime: 60_000,
  });
}

/**
 * "What needs my attention in the books?" — the same prioritised list an
 * agent reads with check_books, in the Overview: the top findings, each a
 * link to the tab or module that fixes it, and the next filing deadline.
 */
export function BooksAttentionCard({ onNavigate }: { onNavigate?: (tabId: string) => void }) {
  const { data, isLoading, isError } = useBooksHealth();
  const { formatDate } = usePlatformFormat();
  const navigate = useNavigate();

  const open = (f: BooksFinding) => {
    if (!f.tab) return;
    // Open months are closed from the Month close tab, checklist first.
    if (f.id === 'periods_left_open') { onNavigate?.('close'); return; }
    if (MODULE_ROUTES[f.tab]) navigate(MODULE_ROUTES[f.tab]);
    else onNavigate?.(f.tab);
  };

  const urgent = (data?.summary.high ?? 0) + (data?.summary.medium ?? 0);
  const next = data?.next_deadlines?.[0];

  return (
    <DashCard label="Needs attention">
      {isLoading ? (
        <QuietEmpty>Loading…</QuietEmpty>
      ) : isError || !data ? (
        <QuietEmpty>No data yet.</QuietEmpty>
      ) : data.ok ? (
        <>
          <BigFigure value="0" tone="positive" />
          <Subline>Nothing needs attention — the books are current.</Subline>
        </>
      ) : (
        <>
          <BigFigure value={String(data.summary.total)} tone={data.summary.high > 0 ? 'warning' : 'default'} />
          <Subline>
            {data.summary.high} high · {data.summary.medium} medium · {data.summary.low} low
            {urgent === 0 ? ' — nothing urgent' : ''}
          </Subline>
          <ul className="mt-1 space-y-1">
            {data.findings.slice(0, 3).map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => open(f)}
                  disabled={!f.tab}
                  className="flex w-full items-start gap-2 text-left text-sm hover:underline disabled:no-underline disabled:cursor-default"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      f.severity === 'high' && 'bg-destructive',
                      f.severity === 'medium' && 'bg-amber-500',
                      f.severity === 'low' && 'bg-muted-foreground/50',
                    )}
                  />
                  <span className="text-foreground">{f.label}</span>
                </button>
              </li>
            ))}
            {data.findings.length > 3 && (
              <li className="text-xs text-muted-foreground">+ {data.findings.length - 3} more</li>
            )}
          </ul>
        </>
      )}
      {next && (
        <Subline>
          Next deadline: {next.label} · {formatDate(next.due_date)} ({next.days_left} days)
        </Subline>
      )}
      {data && !next && data.calendar_note && (
        <Subline>{data.calendar_note}</Subline>
      )}
    </DashCard>
  );
}
