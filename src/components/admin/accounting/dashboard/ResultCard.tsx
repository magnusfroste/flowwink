import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashCard, BigFigure, Subline, QuietEmpty, fmtSek } from './_shared';
import { useFiscalYear } from '../FiscalYearContext';

interface PnLResult {
  net_result_cents: number;
  total_income_cents: number;
  total_expenses_cents: number;
}

export function useIncomeStatementYTD() {
  const { year } = useFiscalYear();
  const now = new Date();
  const currentYear = now.getFullYear();
  const from = `${year}-01-01`;
  const to = year === currentYear ? now.toISOString().slice(0, 10) : `${year}-12-31`;

  return useQuery({
    queryKey: ['dash', 'income-statement-ytd', year],
    queryFn: async (): Promise<PnLResult> => {
      const { data, error } = await supabase.functions.invoke('agent-execute', {
        body: {
          skill_name: 'accounting_reports',
          arguments: { type: 'income_statement', from_date: from, to_date: to },
          agent_type: 'flowpilot',
        },
      });
      if (error) throw error;
      const r: any = data?.result ?? data;
      if (r?.error) throw new Error(r.error);
      return r as PnLResult;
    },
    staleTime: 5 * 60_000,
  });
}

export function ResultCard() {
  const { data, isLoading, isError } = useIncomeStatementYTD();
  const { year } = useFiscalYear();
  const now = new Date();
  const isCurrent = year === now.getFullYear();
  const endLabel = isCurrent
    ? now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    : 'Dec 31';

  return (
    <DashCard label={isCurrent ? 'Result YTD' : `Result ${year}`}>
      {isLoading ? (
        <QuietEmpty>Loading…</QuietEmpty>
      ) : isError || !data ? (
        <QuietEmpty>No data yet.</QuietEmpty>
      ) : (
        <>
          <BigFigure
            value={fmtSek(data.net_result_cents)}
            tone={data.net_result_cents > 0 ? 'positive' : 'default'}
          />
          <Subline>
            {year} Jan 1 – {endLabel} · {fmtSek(data.total_income_cents)} income
          </Subline>
        </>
      )}
    </DashCard>
  );
}
