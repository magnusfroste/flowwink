import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashCard, BigFigure, Subline, QuietEmpty, fmtSek } from './_shared';

interface VatReturn {
  period: { from: string; to: string };
  net_to_pay_cents: number;
  direction: 'pay_to_skatteverket' | 'refund_from_skatteverket';
}

export function VatCard() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dash', 'vat-return', year, month],
    queryFn: async (): Promise<VatReturn> => {
      const { data, error } = await supabase.functions.invoke('accounting-vat-return-se', {
        body: { year, month },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as VatReturn;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  const net = data?.net_to_pay_cents ?? 0;
  const isRefund = data?.direction === 'refund_from_skatteverket';

  return (
    <DashCard label={isRefund ? 'VAT refund' : 'VAT to pay'}>
      {isLoading ? (
        <QuietEmpty>Loading…</QuietEmpty>
      ) : isError || !data ? (
        <QuietEmpty>VAT: no data yet.</QuietEmpty>
      ) : (
        <>
          <BigFigure
            value={fmtSek(Math.abs(net))}
            tone={isRefund ? 'positive' : 'default'}
          />
          <Subline>
            Period {data.period.from} – {data.period.to}
          </Subline>
        </>
      )}
    </DashCard>
  );
}
