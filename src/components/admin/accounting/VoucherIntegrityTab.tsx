import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Voucher Integrity
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Detects gaps in voucher-number sequences. Required for audit-grade bookkeeping (SE, DE, IFRS, GAAP).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div>
              <Label>Fiscal year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-32"
              />
            </div>
            <div>
              <Label>Series (optional)</Label>
              <Input
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder="e.g. SALES"
                className="w-40"
              />
            </div>
            <Button onClick={() => refetch()} disabled={isLoading}>
              <Search className="h-4 w-4 mr-1" /> Scan
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Scanning…</p>
          ) : data && data.length === 0 ? (
            <div className="flex items-center gap-2 p-4 rounded-md bg-muted/50">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm">No gaps detected for {year}{series && ` in series ${series}`}.</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Series</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Missing #</TableHead>
                  <TableHead>Next existing</TableHead>
                  <TableHead>Gap size</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((gap: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell><Badge variant="outline">{gap.series}</Badge></TableCell>
                    <TableCell>{gap.fiscal_year}</TableCell>
                    <TableCell className="font-mono">{gap.expected_number}{gap.gap_size > 1 && `…${Number(gap.next_existing_number) - 1}`}</TableCell>
                    <TableCell className="font-mono">{gap.next_existing_number}</TableCell>
                    <TableCell>
                      <Badge variant={gap.gap_size > 5 ? 'destructive' : 'secondary'}>
                        {gap.gap_size}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{gap.last_seen_date}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => handleExplain(gap)}>Explain</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
