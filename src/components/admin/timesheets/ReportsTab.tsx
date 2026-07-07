import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Zap, BarChart3 } from 'lucide-react';

const fmtSEK = (cents: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format((cents ?? 0) / 100);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Row {
  user_id: string | null;
  employee_id: string | null;
  full_name: string | null;
  work_hours: number;
  billable_hours: number;
  pto_hours: number;
  sick_hours: number;
  training_hours: number;
  overhead_hours: number;
  overtime_hours: number;
  utilization_pct: number;
  billable_pct: number;
  cost_cents: number;
  revenue_cents: number;
}

export function ReportsTab() {
  const qc = useQueryClient();
  const [start, setStart] = useState(daysAgoISO(29));
  const [end, setEnd] = useState(todayISO());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ts-report', start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('timesheet_utilization_report' as any, {
        p_start_date: start, p_end_date: end,
      });
      if (error) throw error;
      return (data as any) as { rows?: Row[] } | Row[];
    },
  });

  const rows: Row[] = Array.isArray(data) ? data : (data?.rows ?? []);

  const applyOT = async () => {
    const { data, error } = await supabase.rpc('apply_overtime_rules' as any, {
      p_start_date: start, p_end_date: end,
    });
    if (error) { toast.error(error.message); return; }
    const n = (data as any)?.entries_updated ?? (data as any)?.updated ?? 0;
    toast.success(`Applied overtime rules to ${n} entries`);
    refetch();
    qc.invalidateQueries({ queryKey: ['time-entries'] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Utilization report
          </CardTitle>
          <CardDescription>Per-person utilization, billable ratio, cost and revenue.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" />
            </div>
            <Button variant="outline" size="sm" onClick={applyOT}>
              <Zap className="mr-2 h-4 w-4" /> Apply overtime rules
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead className="text-right">Work</TableHead>
                <TableHead className="text-right">Billable</TableHead>
                <TableHead className="text-right">PTO</TableHead>
                <TableHead className="text-right">Sick</TableHead>
                <TableHead className="text-right">Training</TableHead>
                <TableHead className="text-right">Overhead</TableHead>
                <TableHead className="text-right">OT</TableHead>
                <TableHead className="text-right">Util %</TableHead>
                <TableHead className="text-right">Bill %</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">No data for range.</TableCell></TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={r.user_id ?? r.employee_id ?? i}>
                  <TableCell className="text-sm">{r.full_name ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.work_hours ?? 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.billable_hours ?? 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.pto_hours ?? 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.sick_hours ?? 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.training_hours ?? 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.overhead_hours ?? 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.overtime_hours ?? 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.utilization_pct ?? 0).toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.billable_pct ?? 0).toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtSEK(r.cost_cents)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtSEK(r.revenue_cents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
