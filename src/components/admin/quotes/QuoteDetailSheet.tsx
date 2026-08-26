import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, Building2, FileCheck, FileSignature, Send, ShieldCheck, Link as LinkIcon, Repeat } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { computeInvoiceTotals, type InvoiceLineItem } from '@/hooks/useInvoices';
import { useProducts } from '@/hooks/useProducts';
import { computeRecurringRollup, deriveContractBilling } from '@/lib/recurring-value';
import {
  useQuote, useQuoteItems, useUpdateQuote, useDeleteQuote, useConvertQuoteToInvoice,
  getQuoteCustomerName, getQuoteCustomerEmail, getQuoteCompanyName,
  type QuoteStatus,
} from '@/hooks/useQuotes';
import { decideQuoteSave, resolveQuoteLines } from '@/lib/quote-lines';
import { useRequestQuoteApproval, useSendQuote, useSendQuoteReminder, publicQuoteUrl } from '@/hooks/useQuoteWorkflow';
import { useQuoteProcessSettings } from '@/hooks/useSiteSettings';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { NewContractDialog } from '@/components/admin/contracts/NewContractDialog';
import { QuoteAttachmentsPanel } from './QuoteAttachmentsPanel';
import { QuoteRevisionsPanel } from './QuoteRevisionsPanel';
import { toast } from 'sonner';

interface Props {
  quoteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_ACTIONS: Record<QuoteStatus, { label: string; next: QuoteStatus; variant?: 'destructive' | 'outline' | 'default' }[]> = {
  draft: [
    { label: 'Mark as Sent', next: 'sent', variant: 'outline' },
    { label: 'Reject', next: 'rejected', variant: 'destructive' },
  ],
  sent: [
    { label: 'Accept', next: 'accepted', variant: 'default' },
    { label: 'Reject', next: 'rejected', variant: 'destructive' },
  ],
  accepted: [],
  rejected: [{ label: 'Revert to Draft', next: 'draft', variant: 'outline' }],
  expired: [{ label: 'Revert to Draft', next: 'draft', variant: 'outline' }],
};

export function QuoteDetailSheet({ quoteId, open, onOpenChange }: Props) {
  const { data: quote } = useQuote(quoteId || undefined);
  // The lines may live in `quote_items` (agent/API path) instead of the
  // quotes.line_items JSONB this panel has always edited. Read that store too:
  // a Save that never loaded the real lines must not be allowed to rewrite the
  // totals. See src/lib/quote-lines.ts.
  const { data: quoteItemRows, isSuccess: itemsRead } = useQuoteItems(quoteId || undefined);
  const updateQuote = useUpdateQuote();
  const deleteQuote = useDeleteQuote();
  const convertToInvoice = useConvertQuoteToInvoice();
  const [contractOpen, setContractOpen] = useState(false);
  // The instance's accept model decides which follow-through is primary here:
  // contract mode leads with the agreement, invoice mode with Quote-to-Cash.
  const { data: quoteProcess } = useQuoteProcessSettings();
  const contractFirst = quoteProcess?.accept_behavior === 'contract';
  const requestApproval = useRequestQuoteApproval();
  const sendQuote = useSendQuote();
  const sendReminder = useSendQuoteReminder();

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  /** How many lines were actually LOADED for this quote (before any editing).
   *  Zero-because-nothing-was-there and zero-because-the-user-deleted-them are
   *  different facts, and only the second one may be saved as a zero. */
  const [loadedLineCount, setLoadedLineCount] = useState<number | null>(null);
  const [taxRate, setTaxRate] = useState(0.25);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [prepaymentPct, setPrepaymentPct] = useState('');
  const [defaultTerm, setDefaultTerm] = useState('');

  const { data: products = [] } = useProducts();

  const resolvedLines = useMemo(
    () => resolveQuoteLines({
      itemsLoaded: !!quoteId && itemsRead,
      itemRows: quoteItemRows,
      jsonbLines: quote?.line_items,
    }),
    [quoteId, itemsRead, quoteItemRows, quote?.line_items],
  );
  const linesEditable = resolvedLines.editable;

  useEffect(() => {
    if (!quote) return;
    // Never seed the form from a half-read: an empty list here would look
    // exactly like a quote with no lines, and Save would believe it.
    if (resolvedLines.origin === 'unknown') return;
    setLineItems(resolvedLines.items);
    setLoadedLineCount(resolvedLines.items.length);
    setTaxRate(quote.tax_rate);
    setNotes(quote.notes || '');
    setValidUntil(quote.valid_until || '');
    setPrepaymentPct(quote.prepayment_pct != null ? String(quote.prepayment_pct) : '');
    setDefaultTerm(quote.default_term_months != null ? String(quote.default_term_months) : '');
  }, [quote, resolvedLines]);

  // Totals are only ours to compute when the lines are ours to edit. For a
  // quote whose lines live in `quote_items` the header totals are maintained by
  // the recalc_quote_totals trigger — show those, don't invent new ones.
  const totals = useMemo(
    () => (linesEditable
      ? computeInvoiceTotals(lineItems, taxRate)
      : {
          subtotal_cents: quote?.subtotal_cents ?? 0,
          tax_cents: quote?.tax_cents ?? 0,
          total_cents: quote?.total_cents ?? 0,
        }),
    [linesEditable, lineItems, taxRate, quote?.subtotal_cents, quote?.tax_cents, quote?.total_cents],
  );
  // Derived recurring rollup — silent for a pure one-time quote (the degenerate
  // case where every line is one_time). See recurring-value-model.md.
  const termMonths = defaultTerm.trim() === '' ? null : Number(defaultTerm);
  const rollup = computeRecurringRollup(lineItems, termMonths);

  const { formatCurrency } = usePlatformFormat();

  const formatAmount = (cents: number) => formatCurrency(cents, quote?.currency);

  const handleSave = useCallback(() => {
    if (!quote) return;
    const pct = prepaymentPct.trim() === '' ? null : Number(prepaymentPct);
    if (pct !== null && (!Number.isFinite(pct) || pct < 1 || pct > 100)) {
      toast.error('Prepayment % must be between 1 and 100 (leave empty for full amount)');
      return;
    }
    // A Save must never delete lines it never loaded. This is the whole reason
    // the guard exists: an agent-written quote kept its lines in `quote_items`,
    // this panel loaded the empty JSONB column, recomputed 0 and wrote it back —
    // 2 247,50 kr became 0 kr with nothing edited.
    const decision = decideQuoteSave({
      origin: resolvedLines.origin,
      editedLineCount: lineItems.length,
      loadedLineCount: loadedLineCount ?? 0,
      currentTotalCents: quote.total_cents ?? 0,
    });
    if (!decision.allowed) {
      toast.error(decision.reason);
      return;
    }

    const payload: Record<string, unknown> = {
      id: quote.id,
      notes: notes || null,
      valid_until: validUntil || null,
      prepayment_pct: pct,
      default_term_months: termMonths != null && Number.isFinite(termMonths) && termMonths > 0
        ? Math.round(termMonths) : null,
    };
    if (decision.writeLines) {
      payload.line_items = lineItems;
      payload.tax_rate = taxRate;
      Object.assign(payload, totals);
    } else {
      // Lines and totals belong to another store — say so instead of pretending
      // the save covered them.
      toast.warning(decision.reason);
    }
    updateQuote.mutate(payload as any);
  }, [quote, lineItems, loadedLineCount, resolvedLines, taxRate, notes, validUntil, prepaymentPct, termMonths, totals, updateQuote]);

  const handleStatusChange = (next: QuoteStatus) => {
    if (!quote) return;
    const extra: Record<string, any> = {};
    if (next === 'sent') extra.sent_at = new Date().toISOString();
    if (next === 'accepted') extra.accepted_at = new Date().toISOString();
    if (next === 'rejected') extra.rejected_at = new Date().toISOString();
    updateQuote.mutate({ id: quote.id, status: next, ...extra } as any);
  };

  const handleConvert = () => {
    if (!quote) return;
    convertToInvoice.mutate(quote);
  };

  const handleDelete = () => {
    if (!quote) return;
    if (confirm('Delete this quote?')) {
      deleteQuote.mutate(quote.id);
      onOpenChange(false);
    }
  };

  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    setLineItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const addLineItem = () => {
    // A hand-typed line defaults to one-time — the degenerate case.
    setLineItems(prev => [...prev, { description: '', qty: 1, unit_price_cents: 0, recurrence: 'one_time' }]);
  };

  // Product-driven: picking a product carries its dimension into the line —
  // recurring products inherit their cadence, one-time products stay one-time.
  const addFromProduct = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const recurrence = p.type === 'recurring' ? (p.billing_interval ?? 'month') : 'one_time';
    setLineItems((prev) => [...prev, {
      description: p.name,
      qty: 1,
      unit_price_cents: p.price_cents,
      product_id: p.id,
      recurrence,
      ...(p.default_term_months ? { term_months: p.default_term_months } : {}),
    }]);
    // A recurring product with a suggested term pre-fills the quote's binding term.
    if (p.type === 'recurring' && p.default_term_months && defaultTerm.trim() === '') {
      setDefaultTerm(String(p.default_term_months));
    }
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  if (!quote) return null;

  const customerName = getQuoteCustomerName(quote);
  const customerEmail = getQuoteCustomerEmail(quote);
  const companyName = getQuoteCompanyName(quote);
  const actions = STATUS_ACTIONS[quote.status] || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono">{quote.quote_number}</span>
            <Badge variant="secondary">{quote.status}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Customer info */}
          <div className="space-y-1">
            <p className="font-medium">{customerName}</p>
            <p className="text-sm text-muted-foreground">{customerEmail}</p>
            {companyName && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {companyName}
              </p>
            )}
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <Label>Line Items</Label>
            {resolvedLines.origin === 'unknown' && (
              <p className="text-sm text-muted-foreground">Loading line items…</p>
            )}
            {resolvedLines.origin === 'quote_items' && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                These lines are stored on the quote itself (written by the agent/API path), not in this
                editor. They are shown read-only — saving here leaves them and the totals untouched.
              </p>
            )}
            {lineItems.map((item, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateLineItem(i, 'description', e.target.value)}
                  className="flex-1"
                  disabled={!linesEditable}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  placeholder="Qty"
                  value={item.qty === 0 ? '' : item.qty}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateLineItem(i, 'qty', v === '' ? 0 : Number(v));
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-16"
                  disabled={!linesEditable}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder={`Price (${quote?.currency || 'SEK'})`}
                  value={item.unit_price_cents === 0 ? '' : (item.unit_price_cents / 100).toString()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      updateLineItem(i, 'unit_price_cents', 0);
                    } else {
                      const num = Number(v);
                      updateLineItem(i, 'unit_price_cents', Number.isFinite(num) ? Math.round(num * 100) : 0);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-32"
                  disabled={!linesEditable}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="1"
                  placeholder="Disc %"
                  value={!item.discount_pct ? '' : item.discount_pct}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      updateLineItem(i, 'discount_pct', 0);
                    } else {
                      const num = Number(v);
                      updateLineItem(i, 'discount_pct', Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : 0);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-20"
                  title="Line discount %"
                  disabled={!linesEditable}
                />
                <Select
                  value={item.recurrence ?? 'one_time'}
                  onValueChange={(v) => updateLineItem(i, 'recurrence', v)}
                  disabled={!linesEditable}
                >
                  <SelectTrigger className="w-[92px]" title="Billing cadence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">One-time</SelectItem>
                    <SelectItem value="month">/ month</SelectItem>
                    <SelectItem value="year">/ year</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => removeLineItem(i)} disabled={!linesEditable}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={addLineItem} disabled={!linesEditable}>
                <Plus className="h-3 w-3 mr-1" /> Add item
              </Button>
              {products.length > 0 && (
                <Select value="" onValueChange={addFromProduct} disabled={!linesEditable}>
                  <SelectTrigger className="w-[220px] h-8 text-sm">
                    <SelectValue placeholder="Add from product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.filter((p) => p.is_active).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.type === 'recurring'
                          ? ` · ${formatCurrency(p.price_cents, p.currency)}/${p.billing_interval === 'year' ? 'yr' : 'mo'}`
                          : ` · ${formatCurrency(p.price_cents, p.currency)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Tax */}
          <div className="space-y-2">
            <Label>Tax Rate (%)</Label>
            <Input
              type="number"
              value={Math.round(taxRate * 100)}
              onChange={(e) => setTaxRate((parseInt(e.target.value) || 0) / 100)}
              className="w-24"
              disabled={!linesEditable}
            />
          </div>

          {/* Totals */}
          <div className="space-y-1 text-sm border-t pt-3">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">{formatAmount(totals.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax ({Math.round(taxRate * 100)}%)</span>
              <span className="font-mono">{formatAmount(totals.tax_cents)}</span>
            </div>
            <div className="flex justify-between font-medium text-base border-t pt-1">
              <span>Total</span>
              <span className="font-mono">{formatAmount(totals.total_cents)}</span>
            </div>
          </div>

          {/* Recurring value — shown only when the quote has a recurring line.
              A pure one-time quote stays with the plain Total above. The number
              the customer signs up to is the cadence AND the binding term; TCV
              is the consequence. See recurring-value-model.md. */}
          {rollup.hasRecurring && (
            <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Repeat className="h-4 w-4 text-primary" /> Recurring service
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="binding-term" className="text-sm text-muted-foreground">
                  Binding term (months)
                </Label>
                <Input
                  id="binding-term"
                  type="number"
                  min={1}
                  placeholder="e.g. 36"
                  value={defaultTerm}
                  onChange={(e) => setDefaultTerm(e.target.value)}
                  className="w-24"
                />
              </div>
              <div className="space-y-1 text-sm border-t pt-2">
                {rollup.oneTimeCents > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">One-time</span>
                    <span className="font-mono">{formatAmount(rollup.oneTimeCents)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly (MRR)</span>
                  <span className="font-mono">{formatAmount(rollup.mrrCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Annual (ARR)</span>
                  <span className="font-mono">{formatAmount(rollup.arrCents)}</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-1">
                  <span>Total contract value{termMonths ? ` · ${termMonths} mo` : ''}</span>
                  <span className="font-mono">{rollup.termMissing ? '—' : formatAmount(rollup.tcvCents)}</span>
                </div>
                {rollup.termMissing && (
                  <p className="text-xs text-warning">
                    Set a binding term to see the total contract value.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Valid until */}
          <div className="space-y-2">
            <Label>Valid Until</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>

          {/* Prepayment % (sign-and-pay) */}
          <div className="space-y-2">
            <Label>Prepayment %</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step="1"
              placeholder="Full amount"
              value={prepaymentPct}
              onChange={(e) => setPrepaymentPct(e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              When set, the customer's "Pay now" after accepting charges only this share as a deposit — the
              invoice stays partially paid with the balance open. Leave empty to charge the full amount.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Attachments */}
          <QuoteAttachmentsPanel quoteId={quote.id} />

          {/* Revisions */}
          <QuoteRevisionsPanel
            quoteId={quote.id}
            currency={quote.currency}
            currentSnapshot={{ line_items: lineItems, tax_rate: taxRate, notes, valid_until: validUntil, ...totals }}
            currentTotalCents={totals.total_cents}
            isSent={quote.status === 'sent'}
          />

          {/* Invoice link */}
          {quote.invoice_id && (
            <div className="rounded-md border p-3 text-sm flex items-center gap-2 bg-muted/50">
              <FileCheck className="h-4 w-4 text-green-600" />
              <span>Invoice created from this quote</span>
              {quote.paid_at && (
                <Badge variant="outline" className="ml-auto">
                  Paid online {new Date(quote.paid_at).toISOString().slice(0, 10)}
                </Badge>
              )}
            </div>
          )}

          {/* Public link (when sent) */}
          {(quote as unknown as { accept_token?: string }).accept_token && (
            <div className="rounded-md border p-3 text-sm flex items-center gap-2 bg-muted/50">
              <LinkIcon className="h-4 w-4" />
              <span className="flex-1 truncate font-mono text-xs">
                {publicQuoteUrl((quote as unknown as { accept_token: string }).accept_token)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const url = publicQuoteUrl((quote as unknown as { accept_token: string }).accept_token);
                  navigator.clipboard.writeText(url);
                  toast.success('Link copied');
                }}
              >
                Copy
              </Button>
            </div>
          )}

          {/* Signature certificate (after customer accepted/declined via public link) */}
          {(quote.status === 'accepted' || quote.status === 'rejected') &&
            (quote as unknown as { accept_token?: string }).accept_token && (
              <div className="rounded-md border p-3 text-sm flex items-center gap-2 bg-muted/50">
                <ShieldCheck className="h-4 w-4" />
                <span className="flex-1">Signature certificate (evidence of {quote.status === 'accepted' ? 'acceptance' : 'decline'})</span>
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href={`/quote/${(quote as unknown as { accept_token: string }).accept_token}/certificate`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </Button>
              </div>
            )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={updateQuote.isPending || resolvedLines.origin === 'unknown'}
            >
              Save Changes
            </Button>
            {quote.status === 'draft' && (
              <>
                <Button variant="outline" onClick={() => requestApproval.mutate(quote)} disabled={requestApproval.isPending}>
                  <ShieldCheck className="h-4 w-4 mr-1" /> Request Approval
                </Button>
                <Button onClick={() => sendQuote.mutate(quote)} disabled={sendQuote.isPending}>
                  <Send className="h-4 w-4 mr-1" /> Send to Customer
                </Button>
              </>
            )}
            {(quote.status as string) === 'pending_approval' && (
              <Badge variant="outline" className="self-center">Awaiting approval</Badge>
            )}
            {quote.status === 'sent' && (quote as unknown as { accept_token?: string }).accept_token && (
              <Button
                variant="outline"
                onClick={() => sendReminder.mutate({ quote })}
                disabled={sendReminder.isPending}
              >
                <Send className="h-4 w-4 mr-1" /> Send Reminder
              </Button>
            )}
            {actions.map((action) => (
              <Button
                key={action.next}
                variant={action.variant === 'destructive' ? 'destructive' : 'outline'}
                onClick={() => handleStatusChange(action.next)}
                disabled={updateQuote.isPending}
              >
                {action.label}
              </Button>
            ))}
            {quote.status === 'accepted' && !quote.invoice_id && (
              <Button
                variant={contractFirst ? 'outline' : 'default'}
                onClick={handleConvert}
                disabled={convertToInvoice.isPending}
              >
                <FileCheck className="h-4 w-4 mr-1" />
                Create Invoice
              </Button>
            )}
            {/* An accepted quote is exactly the moment an agreement gets drafted,
                and there was no way to do it from here — the salesperson had to
                leave for Contracts and retype the customer and the amount. */}
            {quote.status === 'accepted' && (
              <Button variant={contractFirst ? 'default' : 'outline'} onClick={() => setContractOpen(true)}>
                <FileSignature className="h-4 w-4 mr-1" />
                Draft contract
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleDelete} className="ml-auto text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>

      <NewContractDialog
        open={contractOpen}
        onOpenChange={setContractOpen}
        prefill={{
          counterparty_name: quote.leads?.name || '',
          counterparty_email: quote.leads?.email || '',
          // A recurring quote's agreement is worth its TCV, not one period's
          // total — the dimension travels instead of being re-invented. Falls
          // back to the plain total when nothing recurs or no term is set.
          value_cents: rollup.hasRecurring && !rollup.termMissing ? rollup.tcvCents : quote.total_cents,
          title: `Avtal — ${quote.quote_number}`,
          // The link, not just the label. The title has always mentioned the
          // quote; nothing could query on it.
          quote_id: quote.id,
          // What the agreement bills, inherited from the recurring lines —
          // null for a pure one-time quote (nothing to bill recurringly).
          billing: deriveContractBilling(lineItems),
          term_months: rollup.hasRecurring && termMonths && Number.isFinite(termMonths)
            ? Math.round(termMonths) : null,
        }}
      />
    </Sheet>
  );
}
