import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

/** The shape archive_integrity_status returns (20261027120001). */
interface ArchiveStatus {
  documents: number;
  sealed: number;
  unsealed: number;
  retained: number;
  voucher_attachments: number;
  voucher_attachments_unsealed: number;
  retention_years: number;
  last_verified_at: string | null;
}

interface VerifyReport {
  success?: boolean;
  checked: number;
  sealed: number;
  verified: number;
  mismatched: Array<{ id: string; kind: string; path: string; expected: string; actual: string }>;
  unreachable: Array<{ id: string; kind: string; path: string }>;
  skipped_demo: number;
  note?: string;
  error?: string;
}

/**
 * The archive's seal and lock (BFL 7 kap): how many documents carry a hash,
 * how many a posted voucher keeps, and the verifier that re-reads every file
 * — the same skill an agent runs as verify_document_integrity.
 */
export function ArchiveIntegrityCard() {
  const qc = useQueryClient();
  const { formatDateTime } = usePlatformFormat();
  const [report, setReport] = useState<VerifyReport | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['archive-integrity-status'],
    queryFn: async (): Promise<ArchiveStatus> => {
      const { data, error } = await supabase.rpc('archive_integrity_status' as never);
      if (error) throw error;
      return data as unknown as ArchiveStatus;
    },
    staleTime: 60_000,
  });

  const verify = useMutation({
    mutationFn: async () => callSkill<VerifyReport>('verify_document_integrity', { limit: 500 }),
    onSuccess: (r) => {
      setReport(r);
      if (r.error) toast.error(r.error);
      else if (r.mismatched?.length) toast.error(`${r.mismatched.length} file${r.mismatched.length === 1 ? '' : 's'} no longer match their seal`);
      else toast.success(`${r.verified} verified · ${r.sealed} sealed`);
      qc.invalidateQueries({ queryKey: ['archive-integrity-status'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unsealedTotal = (data?.unsealed ?? 0) + (data?.voucher_attachments_unsealed ?? 0);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b">
        <div>
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            {report?.mismatched?.length ? <ShieldAlert className="h-4 w-4 text-warning" aria-hidden /> : <ShieldCheck className="h-4 w-4 text-success" aria-hidden />}
            Archive integrity
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Every document is sealed with SHA-256 at upload; a posted voucher&apos;s documentation is kept
            {data ? ` ${data.retention_years} years` : ' seven years'} after the fiscal year and cannot be deleted before then.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => verify.mutate()} disabled={verify.isPending}>
          {verify.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
          Verify files now
        </Button>
      </div>
      {isLoading ? (
        <div className="px-6 py-4 text-sm text-muted-foreground">Loading…</div>
      ) : isError || !data ? (
        <div className="px-6 py-4 text-sm text-muted-foreground">No data yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 px-6 py-4 sm:grid-cols-4 text-sm">
          <div>
            <div className="text-2xl font-semibold tabular-nums text-foreground">{data.sealed}</div>
            <div className="text-xs text-muted-foreground">sealed of {data.documents} documents</div>
          </div>
          <div>
            <div className={unsealedTotal > 0 ? 'text-2xl font-semibold tabular-nums text-warning' : 'text-2xl font-semibold tabular-nums text-foreground'}>{unsealedTotal}</div>
            <div className="text-xs text-muted-foreground">without a seal yet</div>
          </div>
          <div>
            <div className="text-2xl font-semibold tabular-nums text-foreground">{data.retained}</div>
            <div className="text-xs text-muted-foreground">kept by a posted voucher</div>
          </div>
          <div>
            <div className="text-2xl font-semibold tabular-nums text-foreground">{data.voucher_attachments}</div>
            <div className="text-xs text-muted-foreground">voucher attachments · last verified {data.last_verified_at ? formatDateTime(data.last_verified_at) : 'never'}</div>
          </div>
        </div>
      )}
      {report && !report.error && (
        <div className="border-t px-6 py-3 text-xs text-muted-foreground space-y-1">
          <div>
            Checked {report.checked} · verified {report.verified} · sealed {report.sealed}
            {report.unreachable.length > 0 ? ` · ${report.unreachable.length} unreachable` : ''}
            {report.skipped_demo > 0 ? ` · ${report.skipped_demo} demo fixtures skipped` : ''}
          </div>
          {report.mismatched.length > 0 && (
            <ul className="text-warning">
              {report.mismatched.map((m) => (
                <li key={m.id}>{m.kind} <span className="font-mono">{m.path}</span> — stored bytes differ from the seal taken when it was booked</li>
              ))}
            </ul>
          )}
          {report.note && <div>{report.note}</div>}
        </div>
      )}
    </div>
  );
}
