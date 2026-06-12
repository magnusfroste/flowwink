import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CopyCheck, RefreshCw, Loader2 } from 'lucide-react';

interface DuplicatePair {
  company_a: string;
  name_a: string;
  company_b: string;
  name_b: string;
  score: number;
  same_domain: boolean;
}

export function DuplicateCompaniesPanel() {
  const [threshold, setThreshold] = useState(0.7);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['duplicate-companies', threshold],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('find_duplicate_companies' as never, { p_threshold: threshold } as never);
      if (error) throw error;
      const r = (data ?? {}) as { pairs?: DuplicatePair[] };
      return r.pairs ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CopyCheck className="h-5 w-5" /> Duplicate companies
            </CardTitle>
            <CardDescription>
              Suggests likely duplicates. Merge stays a manual decision — open both records and consolidate.
            </CardDescription>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="thr" className="text-xs">Threshold</Label>
              <Input
                id="thr"
                type="number"
                min="0.3"
                max="1"
                step="0.05"
                className="w-24"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Scan
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isFetching ? (
          <p className="text-sm text-muted-foreground">Scanning…</p>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No likely duplicates above threshold.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company A</TableHead>
                <TableHead>Company B</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Domain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.map((p, i) => (
                <TableRow key={`${p.company_a}-${p.company_b}-${i}`}>
                  <TableCell>
                    <Link to={`/admin/companies/${p.company_a}`} className="font-medium hover:underline">
                      {p.name_a}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link to={`/admin/companies/${p.company_b}`} className="font-medium hover:underline">
                      {p.name_b}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.score >= 0.9 ? 'default' : 'secondary'}>
                      {(p.score * 100).toFixed(0)}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.same_domain ? <Badge variant="outline">Same domain</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
