import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, ChevronRight, RefreshCw, CheckCircle2, FileText, Sparkles, AlertTriangle } from 'lucide-react';
import {
  useVendorInvoicesForPo,
  useInvoiceHistory,
  useMatchInvoice,
  useAutoApproveInvoice,
  useVendorInvoicesRealtime,
  MATCH_STATUS_LABEL,
  MATCH_STATUS_COLOR,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_COLOR,
  type VendorInvoice,
  type InvoiceHistoryEvent,
} from '@/hooks/useVendorInvoices';

interface Props {
  purchaseOrderId: string;
  currency?: string;
}

const EVENT_LABEL: Record<string, string> = {
  'invoice.registered': 'Registered',
  'invoice.matched': 'Match run',
  'invoice.auto_approved': 'Auto-approved',
  'invoice.approved': 'Approved',
  'invoice.paid': 'Paid',
  'invoice.cancelled': 'Cancelled',
  'invoice.email_sent': 'Email sent',
  'invoice.auto_created': 'Auto-created',
};

const EVENT_ICON: Record<string, React.ReactNode> = {
  'invoice.registered': <FileText className="h-3.5 w-3.5 text-blue-600" />,
  'invoice.matched': <RefreshCw className="h-3.5 w-3.5 text-amber-600" />,
  'invoice.auto_approved': <Sparkles className="h-3.5 w-3.5 text-emerald-600" />,
  'invoice.approved': <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
};

export function PoInvoicesDrilldown({ purchaseOrderId, currency = 'SEK' }: Props) {
  useVendorInvoicesRealtime();
  const { data: invoices = [], isLoading } = useVendorInvoicesForPo(purchaseOrderId);
  const invoiceIds = useMemo(() => invoices.map(i => i.id), [invoices]);
  const { data: history = [] } = useInvoiceHistory(invoiceIds);
  const rematch = useMatchInvoice();
  const autoApprove = useAutoApproveInvoice();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'registered' | 'matched' | 'auto_approved' | 'variance'>('all');

  const counts = useMemo(() => ({
    all: invoices.length,
    registered: invoices.filter(i => i.status === 'registered').length,
    matched: invoices.filter(i => i.match_status === 'matched').length,
    auto_approved: invoices.filter(i => i.status === 'approved' && i.match_status === 'matched' && !i.approved_by).length,
    variance: invoices.filter(i => i.match_status === 'over_invoiced' || i.match_status === 'under_invoiced').length,
  }), [invoices]);

  const filteredInvoices = useMemo(() => {
    switch (filter) {
      case 'registered': return invoices.filter(i => i.status === 'registered');
      case 'matched': return invoices.filter(i => i.match_status === 'matched');
      case 'auto_approved': return invoices.filter(i => i.status === 'approved' && i.match_status === 'matched' && !i.approved_by);
      case 'variance': return invoices.filter(i => i.match_status === 'over_invoiced' || i.match_status === 'under_invoiced');
      default: return invoices;
    }
  }, [invoices, filter]);

  const summary = useMemo(() => {
    const cur = filteredInvoices[0]?.currency || currency;
    const total = filteredInvoices.reduce((s, i) => s + (i.total_cents || 0), 0);
    const variance = filteredInvoices.reduce((s, i) => s + (i.variance_cents || 0), 0);
    const registered = filteredInvoices.filter(i => i.status === 'registered').length;
    const matched = filteredInvoices.filter(i => i.match_status === 'matched').length;
    const autoApproved = filteredInvoices.filter(i => i.status === 'approved' && i.match_status === 'matched' && !i.approved_by).length;
    const variances = filteredInvoices.filter(i => i.match_status === 'over_invoiced' || i.match_status === 'under_invoiced').length;
    return { cur, total, variance, registered, matched, autoApproved, variances, count: filteredInvoices.length };
  }, [filteredInvoices, currency]);

  const historyByInvoice = useMemo(() => {
    const map = new Map<string, InvoiceHistoryEvent[]>();
    for (const ev of history) {
      const arr = map.get(ev.invoice_id) ?? [];
      arr.push(ev);
      map.set(ev.invoice_id, arr);
    }
    return map;
  }, [history]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const fmt = (cents: number, cur: string) =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency: cur }).format(cents / 100);

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Vendor Invoices for this PO
            <Badge variant="secondary" className="ml-1">{invoices.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No vendor invoices registered against this PO yet. When one arrives, it will be matched against received goods automatically.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  ['all', 'All'],
                  ['registered', 'Registered'],
                  ['matched', 'Matched'],
                  ['auto_approved', 'Auto-approved'],
                  ['variance', 'Variance'],
                ] as const).map(([key, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={filter === key ? 'default' : 'outline'}
                    className="h-7 text-xs gap-1.5"
                    onClick={() => setFilter(key)}
                  >
                    {key === 'auto_approved' && <Sparkles className="h-3 w-3" />}
                    {key === 'variance' && <AlertTriangle className="h-3 w-3" />}
                    {label}
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] tabular-nums">
                      {counts[key]}
                    </Badge>
                  </Button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <span className="font-semibold text-muted-foreground uppercase tracking-wide">
                  {filter === 'all' ? 'All' :
                    filter === 'registered' ? 'Registered' :
                    filter === 'matched' ? 'Matched' :
                    filter === 'auto_approved' ? 'Auto-approved' : 'Variance'}
                </span>
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">{summary.count}</span> invoice{summary.count === 1 ? '' : 's'}
                </span>
                <span className="text-muted-foreground">
                  Total <span className="font-mono text-foreground">{fmt(summary.total, summary.cur)}</span>
                </span>
                <span className="text-muted-foreground">
                  Variance{' '}
                  <span className={`font-mono ${summary.variance > 0 ? 'text-red-600' : summary.variance < 0 ? 'text-orange-600' : 'text-foreground'}`}>
                    {summary.variance === 0 ? '—' : fmt(summary.variance, summary.cur)}
                  </span>
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <FileText className="h-3 w-3 text-blue-600" />
                    <span className="tabular-nums text-foreground">{summary.registered}</span> registered
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    <span className="tabular-nums text-foreground">{summary.matched}</span> matched
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-emerald-600" />
                    <span className="tabular-nums text-foreground">{summary.autoApproved}</span> auto-approved
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                    <span className="tabular-nums text-foreground">{summary.variances}</span> variance
                  </span>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                          No invoices match this filter.
                        </TableCell>
                      </TableRow>
                    ) : filteredInvoices.map(inv => (
                      <InvoiceRow
                        key={inv.id}
                        inv={inv}
                        isOpen={expanded.has(inv.id)}
                        onToggle={() => toggle(inv.id)}
                        events={historyByInvoice.get(inv.id) ?? []}
                        onRematch={() => rematch.mutate(inv.id)}
                        onApprove={() => autoApprove.mutate(inv.id)}
                        rematching={rematch.isPending}
                        approving={autoApprove.isPending}
                        fmt={fmt}
                        currency={currency}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function InvoiceRow({
  inv, isOpen, onToggle, events, onRematch, onApprove, rematching, approving, fmt, currency,
}: {
  inv: VendorInvoice;
  isOpen: boolean;
  onToggle: () => void;
  events: InvoiceHistoryEvent[];
  onRematch: () => void;
  onApprove: () => void;
  rematching: boolean;
  approving: boolean;
  fmt: (cents: number, cur: string) => string;
  currency: string;
}) {
  const variance = inv.variance_cents;
  const cur = inv.currency || currency;
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={onToggle}>
        <TableCell>
          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
        <TableCell className="text-sm">{format(new Date(inv.invoice_date), 'yyyy-MM-dd')}</TableCell>
        <TableCell className="text-right font-mono">{fmt(inv.total_cents, cur)}</TableCell>
        <TableCell className={`text-right font-mono ${variance > 0 ? 'text-red-600' : variance < 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
          {variance === 0 ? '—' : fmt(variance, cur)}
        </TableCell>
        <TableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className={MATCH_STATUS_COLOR[inv.match_status]}>{MATCH_STATUS_LABEL[inv.match_status]}</Badge>
            </TooltipTrigger>
            {inv.variance_notes && <TooltipContent className="max-w-xs">{inv.variance_notes}</TooltipContent>}
          </Tooltip>
        </TableCell>
        <TableCell>
          <Badge className={INVOICE_STATUS_COLOR[inv.status]}>{INVOICE_STATUS_LABEL[inv.status]}</Badge>
        </TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" disabled={rematching} onClick={onRematch}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Re-run 3-way match</TooltipContent>
            </Tooltip>
            {inv.status === 'registered' && inv.match_status === 'matched' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={approving} onClick={onApprove}>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Approve now</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow>
          <TableCell />
          <TableCell colSpan={7} className="bg-muted/20">
            <div className="py-2 space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Matching history ({events.length} event{events.length === 1 ? '' : 's'})
              </div>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No events recorded yet.</p>
              ) : (
                <ol className="space-y-1.5 border-l-2 border-border ml-2 pl-4">
                  {events.map(ev => (
                    <li key={ev.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 inline-flex items-center justify-center bg-background rounded-full p-0.5 border">
                        {EVENT_ICON[ev.event_name] ?? <AlertTriangle className="h-3 w-3 text-muted-foreground" />}
                      </span>
                      <div className="flex flex-wrap items-baseline gap-2 text-sm">
                        <span className="font-medium">{EVENT_LABEL[ev.event_name] ?? ev.event_name}</span>
                        {ev.match_status && (
                          <Badge className={`${MATCH_STATUS_COLOR[ev.match_status]} text-[10px] px-1.5 py-0`}>
                            {MATCH_STATUS_LABEL[ev.match_status]}
                          </Badge>
                        )}
                        {typeof ev.variance_pct === 'number' && (
                          <span className="text-xs text-muted-foreground">
                            variance {ev.variance_pct.toFixed(2)}%
                          </span>
                        )}
                        {typeof ev.variance_cents === 'number' && ev.variance_cents !== 0 && (
                          <span className="text-xs font-mono text-muted-foreground">
                            ({fmt(ev.variance_cents, cur)})
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {format(new Date(ev.created_at), 'yyyy-MM-dd HH:mm')} · {ev.source}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
