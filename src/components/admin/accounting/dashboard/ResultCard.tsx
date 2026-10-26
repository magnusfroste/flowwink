import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashCard, BigFigure, Subline, QuietEmpty, useFmtSek } from './_shared';
import { useFiscalYear } from '../FiscalYearContext';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { businessToday } from '@/lib/platform-fallbacks';

interface PnLResult {
  net_result_cents: number;
  total_income_cents: number;
  total_expenses_cents: number;
  /** Absent on instances whose agent-execute predates the result-carrier fix. */
  result_before_tax_cents?: number;
  tax_cents?: number;
}

export function useIncomeStatementYTD() {
  const { year, fromDate, toDate, currentKey } = useFiscalYear();
  // The fiscal year's own days — up to today on the business's calendar for the current one.
  const from = fromDate;
  const to = year === currentKey ? businessToday() : toDate;

  return useQuery({
    queryKey: ['dash', 'income-statement-ytd', year, from, to],
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
  const { formatDate } = usePlatformFormat();
  const { data, isLoading, isError } = useIncomeStatementYTD();
  const { year, fromDate, toDate, label, currentKey } = useFiscalYear();
  const fmtSek = useFmtSek();
  const isCurrent = year === currentKey;
  const endLabel = formatDate(isCurrent ? businessToday() : toDate, { year: undefined, day: 'numeric', month: 'short' });
  const startLabel = formatDate(fromDate, { year: undefined, day: 'numeric', month: 'short' });

  return (
    <DashCard label={isCurrent ? 'Result YTD' : `Result ${label}`}>
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
            {label} {startLabel} – {endLabel} · {fmtSek(data.total_income_cents)} income
          </Subline>
        </>
      )}
    </DashCard>
  );
}
