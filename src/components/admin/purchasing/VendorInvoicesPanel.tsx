import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';
import {
  useVendorInvoices,
  useVendorInvoicesRealtime,
  useMatchInvoice,
  useAutoApproveInvoice,
  MATCH_STATUS_LABEL,
  MATCH_STATUS_COLOR,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_COLOR,
  type MatchStatus,
  type VendorInvoiceStatus,
} from '@/hooks/useVendorInvoices';

const STATUS_TABS: Array<VendorInvoiceStatus | 'all'> = ['all', 'registered', 'approved', 'paid', 'draft', 'cancelled'];

export function VendorInvoicesPanel() {
  useVendorInvoicesRealtime();
  const [status, setStatus] = useState<VendorInvoiceStatus | 'all'>('all');
  const [matchFilter, setMatchFilter] = useState<MatchStatus | 'all'>('all');
  const { data: invoices = [], isLoading } = useVendorInvoices({ status, matchStatus: matchFilter });
  const rematch = useMatchInvoice();
  const autoApprove = useAutoApproveInvoice();

  const kpis = useMemo(() => {
    const total = invoices.length;
    const matched = invoices.filter(i => i.match_status === 'matched').length;
    const issues = invoices.filter(i => i.match_status === 'over_invoiced' || i.match_status === 'under_invoiced').length;
    const autoApproved = invoices.filter(i => i.status === 'approved' && i.match_status === 'matched').length;
    return { total, matched, issues, autoApproved };
  }, [invoices]);

  const fmt = (cents: number, currency: string) =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Invoices" value={kpis.total} />
          <KpiCard label="Matched" value={kpis.matched} tone="success" />
          <KpiCard label="Variance issues" value={kpis.issues} tone={kpis.issues ? 'warning' : 'default'} />
          <KpiCard label="Auto-approved" value={kpis.autoApproved} tone="success" icon={<Sparkles className="h-3 w-3" />} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={status} onValueChange={(v) => setStatus(v as VendorInvoiceStatus | 'all')}>
            <TabsList>
              {STATUS_TABS.map(s => (
                <TabsTrigger key={s} value={s} className="capitalize">{s === 'all' ? 'All' : INVOICE_STATUS_LABEL[s]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1 ml-auto text-xs">
            <span className="text-muted-foreground mr-1">Match:</span>
            {(['all', 'matched', 'unmatched', 'over_invoiced', 'under_invoiced', 'no_po'] as Array<MatchStatus | 'all'>).map(m => (
              <Button
                key={m}
                size="sm"
                variant={matchFilter === m ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setMatchFilter(m)}
              >
                {m === 'all' ? 'All' : MATCH_STATUS_LABEL[m]}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>PO</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : invoices.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No vendor invoices found</TableCell></TableRow>
              ) : invoices.map((inv) => {
                const autoApproved = inv.status === 'approved' && inv.match_status === 'matched' && !inv.approved_by;
                const variance = inv.variance_cents;
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.vendors?.name ?? '—'}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {inv.purchase_orders?.po_number ?? <span className="text-muted-foreground italic">none</span>}
                    </TableCell>
                    <TableCell className="text-sm">{format(new Date(inv.invoice_date), 'yyyy-MM-dd')}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(inv.total_cents, inv.currency)}</TableCell>
                    <TableCell className={`text-right font-mono ${variance > 0 ? 'text-red-600' : variance < 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                      {variance === 0 ? '—' : fmt(variance, inv.currency)}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge className={MATCH_STATUS_COLOR[inv.match_status]}>
                            {MATCH_STATUS_LABEL[inv.match_status]}
                          </Badge>
                        </TooltipTrigger>
                        {inv.variance_notes && (
                          <TooltipContent className="max-w-xs">{inv.variance_notes}</TooltipContent>
                        )}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge className={INVOICE_STATUS_COLOR[inv.status]}>
                          {INVOICE_STATUS_LABEL[inv.status]}
                        </Badge>
                        {autoApproved && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                            </TooltipTrigger>
                            <TooltipContent>Auto-approved by 3-way match</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={rematch.isPending || !inv.purchase_order_id}
                              onClick={() => rematch.mutate(inv.id)}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Re-run 3-way match</TooltipContent>
                        </Tooltip>
                        {inv.status === 'registered' && inv.match_status === 'matched' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={autoApprove.isPending}
                                onClick={() => autoApprove.mutate(inv.id)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Approve now</TooltipContent>
                          </Tooltip>
                        )}
                        {(inv.match_status === 'over_invoiced' || inv.match_status === 'under_invoiced') && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="h-4 w-4 text-amber-600 self-center" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {inv.variance_notes ?? 'Variance outside tolerance — needs human review.'}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}

function KpiCard({ label, value, tone = 'default', icon }: { label: string; value: number; tone?: 'default' | 'success' | 'warning'; icon?: React.ReactNode }) {
  const toneClass = tone === 'success' ? 'text-emerald-600' : tone === 'warning' ? 'text-amber-600' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1">{icon} {label}</div>
        <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
