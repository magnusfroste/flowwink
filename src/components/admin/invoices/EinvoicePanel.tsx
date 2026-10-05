import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Download, FileCode2, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useEinvoiceExport, useEinvoiceDispatches, useSendEinvoice, downloadXml } from '@/hooks/useEinvoice';
import type { Invoice } from '@/hooks/useInvoices';

/**
 * The invoice as a Peppol e-invoice: is it valid, who receives it, download
 * the XML, send it, and what happened to earlier sends. Rendered on demand —
 * the document is built by the `einvoice` edge function from the same pure
 * builder the tests run, so the validation shown here is the one a sender
 * would hit.
 */
export function EinvoicePanel({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  const { data: exp, isLoading, error } = useEinvoiceExport(invoice.id, open);
  const { data: dispatches = [] } = useEinvoiceDispatches(invoice.id, open);
  const send = useSendEinvoice();
  const { formatDateTime } = usePlatformFormat();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-einvoice-open>
        <FileCode2 className="h-4 w-4 mr-1" /> E-invoice (Peppol)
      </Button>
    );
  }

  const v = exp?.validation;
  return (
    <div className="rounded-md border p-3 space-y-3" data-einvoice-panel>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileCode2 className="h-4 w-4" /> E-invoice · UBL 2.1 / Peppol BIS 3.0
        </div>
        {v && (v.ok
          ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Valid</Badge>
          : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {v.errors.length} rule{v.errors.length === 1 ? '' : 's'} fail</Badge>)}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Rendering…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {exp && (
        <>
          <p className="text-xs text-muted-foreground">
            To <span className="font-mono text-foreground">{exp.recipient_id ?? '— no electronic address —'}</span>
            {' '}from <span className="font-mono text-foreground">{exp.sender_id ?? '— no electronic address —'}</span>
          </p>
          {v && v.errors.length > 0 && (
            <ul className="text-sm text-destructive space-y-1" data-einvoice-errors>
              {v.errors.map((e) => <li key={e}>• {e}</li>)}
            </ul>
          )}
          {v && v.warnings.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {v.warnings.map((w) => <li key={w}>· {w}</li>)}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Bank details and the access point live under <Link to="/admin/invoices?tab=einvoice" className="underline">Invoices → E-invoice</Link>;
            the buyer's org number and address on its company; "Er referens" on this invoice.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadXml(exp.xml, `${exp.invoice_number}.xml`)}>
              <Download className="h-4 w-4 mr-1" /> Download XML
            </Button>
            <Button variant="outline" size="sm" disabled={send.isPending} onClick={() => send.mutate({ invoiceId: invoice.id, dryRun: true })}>
              Check sending
            </Button>
            <Button size="sm" disabled={!v?.ok || send.isPending || invoice.status === 'draft'} title={invoice.status === 'draft' ? 'Issue the invoice first' : undefined}
              onClick={() => send.mutate({ invoiceId: invoice.id })}>
              {send.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Send e-invoice
            </Button>
          </div>
        </>
      )}

      {dispatches.length > 0 && (
        <ul className="text-xs space-y-1 border-t pt-2" data-einvoice-ledger>
          {dispatches.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={d.status === 'sent' || d.status === 'accepted' ? 'default' : d.status === 'simulated' ? 'outline' : 'destructive'}>{d.status}</Badge>
              <span className="text-muted-foreground">{formatDateTime(d.sent_at ?? d.created_at)}</span>
              {d.provider && <span>via {d.provider}</span>}
              {d.provider_ref && <span className="font-mono">{d.provider_ref}</span>}
              {d.error_message && <span className="text-muted-foreground">{d.error_message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
