import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateCSV, downloadCSV } from '@/lib/csv-utils';
import { businessToday } from '@/lib/platform-fallbacks';
import { addMonthsYmd, monthBoundsYmd } from '@/lib/calendar-date';
import { INVOICE_BASIS_COLUMNS, invoiceBasisCsvRows, invoiceBasisFilename, type InvoiceBasisAnswer } from '@/lib/invoice-basis';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type BasisStatus = 'ready' | 'exported' | 'confirmed' | 'all';

/**
 * Invoice basis as a file (#862 part 1): the issued invoices of a period, laid
 * out for another ledger's import. The rows are list_invoice_basis() — the
 * same read an agent or a bridge makes — and "mark as handed over" is
 * mark_invoice_basis_exported(), so a file taken twice offers nothing twice.
 */
export function InvoiceBasisExportDialog({ open, onOpenChange }: Props) {
  const lastMonth = monthBoundsYmd(addMonthsYmd(businessToday(), -1));
  const [from, setFrom] = useState(lastMonth.first);
  const [to, setTo] = useState(lastMonth.last);
  const [status, setStatus] = useState<BasisStatus>('ready');
  const [mark, setMark] = useState(true);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['invoice-basis', from, to, status],
    enabled: open && !!from && !!to,
    queryFn: async (): Promise<InvoiceBasisAnswer> => {
      const { data: answer, error: rpcError } = await supabase.rpc('list_invoice_basis' as never, { p_from: from, p_to: to, p_status: status } as never);
      if (rpcError) throw rpcError;
      return answer as unknown as InvoiceBasisAnswer;
    },
  });

  const count = data?.count ?? 0;
  const willMark = mark && status === 'ready';

  const download = async () => {
    if (!data || count === 0) return;
    setBusy(true);
    try {
      downloadCSV(generateCSV(invoiceBasisCsvRows(data.invoices), INVOICE_BASIS_COLUMNS), invoiceBasisFilename(from, to, status));
      if (willMark) {
        const { data: marked, error: markError } = await supabase.rpc('mark_invoice_basis_exported' as never, {
          p_invoice_ids: data.invoices.map((i) => i.invoice_id),
        } as never);
        if (markError) throw markError;
        toast.success(`Downloaded ${count} ${count === 1 ? 'invoice' : 'invoices'} — ${(marked as { marked?: number } | null)?.marked ?? 0} marked as handed over.`);
        await qc.invalidateQueries({ queryKey: ['invoice-basis'] });
      } else {
        toast.success(`Downloaded ${count} ${count === 1 ? 'invoice' : 'invoices'}.`);
      }
    } catch (e) {
      // The file is already on the person's disk; what failed is the marking.
      toast.error(`The file was downloaded, but the invoices could not be marked: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export invoice basis</DialogTitle>
          <DialogDescription>
            The issued invoices of a period as a CSV file for another ledger (Fortnox, Visma …): one row per invoice line,
            with the buyer&apos;s organisation number. Drafts and cancelled invoices are never included.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="basis-from">Issued from</Label>
            <Input id="basis-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="basis-to">Issued to</Label>
            <Input id="basis-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Which invoices</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as BasisStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ready">Not handed over yet</SelectItem>
              <SelectItem value="exported">Handed over, no number back yet</SelectItem>
              <SelectItem value="confirmed">Confirmed by the other ledger</SelectItem>
              <SelectItem value="all">All issued invoices</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {status === 'ready' && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={mark} onCheckedChange={(v) => setMark(v === true)} className="mt-0.5" />
            <span>
              Mark them as handed over when the file is downloaded
              <span className="block text-xs text-muted-foreground">The next export then offers only what is new.</span>
            </span>
          </label>
        )}

        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          {error ? (
            <span className="text-destructive">{error instanceof Error ? error.message : 'Could not read the invoice basis.'}</span>
          ) : isLoading ? (
            <span className="text-muted-foreground">Reading…</span>
          ) : (
            <>
              <span className="font-medium">{count}</span> {count === 1 ? 'invoice' : 'invoices'} in this selection
              {data?.counts && (
                <span className="block text-xs text-muted-foreground">
                  In the period: {data.counts.ready} not handed over · {data.counts.exported} handed over · {data.counts.confirmed} confirmed
                </span>
              )}
              {data?.truncated && <span className="block text-xs text-warning">More than the file holds — narrow the period.</span>}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={download} disabled={busy || isLoading || count === 0}>
            <Download className="h-4 w-4 mr-1" /> Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
