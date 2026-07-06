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
  const now = new Date();
  const year = now.getFullYear();
  const from = `${year}-01-01`;
  const to = now.toISOString().slice(0, 10);

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
  const now = new Date();

  return (
    <DashCard label="Result YTD">
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
            Jan 1 – {now.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ·{' '}
            {fmtSek(data.total_income_cents)} income
          </Subline>
        </>
      )}
    </DashCard>
  );
}
