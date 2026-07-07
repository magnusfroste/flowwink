import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AccountingTabHeader } from './AccountingTabHeader';

export function VoucherIntegrityTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [series, setSeries] = useState('');
  const [explainGap, setExplainGap] = useState<any | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['voucher-gaps', year, series],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_voucher_gaps', {
        p_year: year,
        p_series: series || null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleExplain = async (gap: any) => {
    const { data } = await supabase.rpc('explain_voucher_gap', {
      p_series: gap.series,
      p_year: gap.fiscal_year,
      p_voucher_number: gap.expected_number,
    });
    setExplainGap(data);
  };

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Voucher Integrity"
        description="Detects gaps in voucher-number sequences — required for audit-grade bookkeeping (SE, DE, IFRS, GAAP)."
      />

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b">
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="w-28 h-9"
            aria-label="Fiscal year"
          />
          <Input
            value={series}
            onChange={(e) => setSeries(e.target.value)}
            placeholder="Series (optional, e.g. SALES)"
            className="w-56 h-9"
          />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <Search className="h-4 w-4 mr-2" />
            Scan
          </Button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Scanning…</div>
        ) : data && data.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle className="h-6 w-6 text-success mx-auto mb-2" />
            <h3 className="text-sm font-medium mb-1">No gaps detected</h3>
            <p className="text-sm text-muted-foreground">
              Voucher numbering is continuous for {year}{series && ` in series ${series}`}.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[6rem_5rem_1fr_6rem_5rem_7rem_5rem] gap-4 px-6 py-2 text-xs text-muted-foreground border-b">
              <div>Series</div>
              <div>Year</div>
              <div>Missing #</div>
              <div>Next existing</div>
              <div className="text-right">Gap</div>
              <div>Last seen</div>
              <div></div>
            </div>
            {data?.map((gap: any, i: number) => (
              <div
                key={i}
                className="grid grid-cols-[6rem_5rem_1fr_6rem_5rem_7rem_5rem] items-baseline gap-4 px-6 py-2 text-sm border-b border-border/40 last:border-b-0"
              >
                <div className="font-mono text-xs">{gap.series}</div>
                <div className="font-mono text-xs text-muted-foreground">{gap.fiscal_year}</div>
                <div className="font-mono">
                  {gap.expected_number}
                  {gap.gap_size > 1 && `…${Number(gap.next_existing_number) - 1}`}
                </div>
                <div className="font-mono text-xs text-muted-foreground">{gap.next_existing_number}</div>
                <div className={`text-right font-mono tabular-nums ${gap.gap_size > 5 ? 'text-destructive' : ''}`}>
                  {gap.gap_size}
                </div>
                <div className="text-xs text-muted-foreground">{gap.last_seen_date || '\u2014'}</div>
                <div className="text-right">
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => handleExplain(gap)}>
                    Explain
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <Dialog open={!!explainGap} onOpenChange={(o) => !o && setExplainGap(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Voucher gap analysis</DialogTitle>
          </DialogHeader>
          {explainGap && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{explainGap.series}-{explainGap.voucher_number}</strong> ({explainGap.fiscal_year})
              </p>
              <p className="text-sm text-muted-foreground">{explainGap.explanation}</p>
              {explainGap.audit_clues?.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {explainGap.audit_clues.map((c: any, i: number) => (
                    <div key={i} className="p-2 rounded bg-muted/50 text-xs font-mono">
                      <div className="font-semibold">{c.action} · {new Date(c.created_at).toLocaleString()}</div>
                      <pre className="whitespace-pre-wrap mt-1">{JSON.stringify(c.metadata, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
