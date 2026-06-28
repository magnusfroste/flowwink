import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Clock, Search, ChevronLeft, ChevronRight, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface AuditRow {
  id: string;
  migration_name: string;
  sql_checksum: string | null;
  status: string;
  triggered_by_label: string | null;
  source: string | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
}

const PAGE_SIZE = 25;

const STATUS_META: Record<string, { label: string; icon: any; cls: string }> = {
  success:  { label: 'Success',  icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-500/10' },
  failed:   { label: 'Failed',   icon: XCircle,      cls: 'text-rose-600 bg-rose-500/10' },
  running:  { label: 'Running',  icon: Clock,        cls: 'text-amber-600 bg-amber-500/10' },
  started:  { label: 'Started',  icon: Clock,        cls: 'text-amber-600 bg-amber-500/10' },
};

export default function MigrationAuditPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['migration-audit', search, status, from, to, page],
    queryFn: async () => {
      let q = (supabase as any)
        .from('migration_audit_log')
        .select('id,migration_name,sql_checksum,status,triggered_by_label,source,error_message,duration_ms,started_at,completed_at', { count: 'exact' })
        .order('started_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (status !== 'all') q = q.eq('status', status);
      if (from) q = q.gte('started_at', new Date(from).toISOString());
      if (to) q = q.lte('started_at', new Date(to + 'T23:59:59').toISOString());
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`migration_name.ilike.%${s}%,sql_checksum.ilike.%${s}%`);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const stats = useMemo(() => {
    const rows = data?.rows ?? [];
    return {
      total: data?.total ?? 0,
      success: rows.filter(r => r.status === 'success').length,
      failed: rows.filter(r => r.status === 'failed').length,
    };
  }, [data]);

  const resetFilters = () => {
    setSearch(''); setStatus('all'); setFrom(''); setTo(''); setPage(0);
  };

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">Migration Audit Log</h1>
            <p className="text-sm text-muted-foreground">
              Every schema migration run, who triggered it, and the SQL checksum.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Total runs</div>
            <div className="text-2xl font-semibold">{stats.total}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Success (page)</div>
            <div className="text-2xl font-semibold text-emerald-600">{stats.success}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Failed (page)</div>
            <div className="text-2xl font-semibold text-rose-600">{stats.failed}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Page</div>
            <div className="text-2xl font-semibold">{page + 1} / {totalPages}</div>
          </Card>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search migration name or checksum…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="started">Started</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
          </div>
          <div className="flex justify-end mt-3">
            <Button variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button>
          </div>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Migration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Triggered by</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Checksum</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : (data?.rows ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                    No audit records match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                data!.rows.map((r) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.started;
                  const Icon = meta.icon;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-mono text-xs">{r.migration_name}</div>
                        {r.error_message && (
                          <div className="text-xs text-rose-600 truncate max-w-md mt-1" title={r.error_message}>
                            {r.error_message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`gap-1 ${meta.cls}`}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.triggered_by_label ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.source ?? '—'}</TableCell>
                      <TableCell>
                        <code className="text-xs text-muted-foreground" title={r.sql_checksum ?? ''}>
                          {r.sql_checksum ? r.sql_checksum.slice(0, 12) + '…' : '—'}
                        </code>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {r.duration_ms != null ? `${r.duration_ms} ms` : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(r.started_at), 'yyyy-MM-dd HH:mm:ss')}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between p-3 border-t">
            <div className="text-xs text-muted-foreground">
              Showing {data?.rows.length ?? 0} of {data?.total ?? 0}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
