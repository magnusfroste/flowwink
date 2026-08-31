/**
 * Public quote page — anonymous customer can view and sign their quote via /quote/:token
 */
import { useEffect, useState } from 'react';
import { useUiText } from '@/lib/ui-text';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, XCircle, FileText, Clock, ShieldCheck, CreditCard, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { SignaturePad } from '@/components/public/SignaturePad';
import { usePublicQuote, useSignQuote, markQuoteViewed } from '@/hooks/useQuoteWorkflow';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useQuoteProcessSettings } from '@/hooks/useSiteSettings';

interface QuotePaymentStatus {
  invoice_number: string;
  invoice_status: string;
  total_cents: number;
  paid_amount_cents: number;
  remaining_cents: number;
  pay_now_cents: number;
  currency: string;
  prepayment_pct: number | null;
  quote_paid_at: string | null;
}

export default function PublicQuotePage() {
  const t = useUiText();
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const paymentReturn = searchParams.get('payment'); // 'success' | 'cancelled' | null
  const { data: quote, isLoading, refetch } = usePublicQuote(token);
  const signQuote = useSignQuote();
  const qc = useQueryClient();
  const { formatCurrency, formatDate, formatDateTime } = usePlatformFormat();

  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<'view' | 'accept' | 'reject'>('view');
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [payPending, setPayPending] = useState(false);
  const [payNotice, setPayNotice] = useState<string | null>(null);

  const quoteStatus = (quote as { status?: string } | null)?.status;

  // The accept-behavior dial decides what this page's language may claim.
  // In 'invoice' mode the quote IS the final document, so accepting it is a
  // binding e-signature. In 'contract' mode the binding moment is the
  // agreement signature that follows — calling the quote accept a signature
  // would have the customer "signing" twice for one deal, and makes the
  // second, real signature look like a formality. site_settings is
  // anon-readable, so the same hook the admin UI uses works here.
  const { data: quoteProcess } = useQuoteProcessSettings();
  const contractMode = quoteProcess?.accept_behavior === 'contract';

  // Payment state for accepted quotes (anon-safe token-gated RPC — invoices
  // are not readable by anon directly).
  const { data: payStatus, refetch: refetchPayStatus } = useQuery({
    queryKey: ['public-quote-payment', token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase.rpc('get_quote_payment_status' as never, {
        p_token: token,
      } as never);
      if (error) throw error;
      return (data as unknown as QuotePaymentStatus | null) ?? null;
    },
    enabled: !!token && quoteStatus === 'accepted',
    // Returning from Stripe: the webhook confirms asynchronously — poll briefly.
    refetchInterval: (q) =>
      paymentReturn === 'success' && (q.state.data?.remaining_cents ?? 1) > 0 ? 4000 : false,
  });

  const handlePayNow = async () => {
    if (!token) return;
    setPayPending(true);
    setPayNotice(null);
    try {
      // Anon-safe pattern (same as useChat/useSignQuote): plain fetch with the
      // publishable key — supabase.functions.invoke would send a user JWT.
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quote-pay`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ accept_token: token, return_url: window.location.origin }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start payment');
      if (data.configured === false) {
        setPayNotice(data.message || 'Online payment is not configured — the invoice will be sent separately.');
      } else if (data.already_paid) {
        refetchPayStatus();
      } else if (data.url) {
        window.location.href = data.url;
        return; // keep the button disabled while redirecting
      }
    } catch (e) {
      setPayNotice(e instanceof Error ? e.message : 'Could not start payment');
    }
    setPayPending(false);
  };

  // Items arrive with the quote from get_public_quote — the anon client has no
  // read on the quote_items table, and admin-composed quotes keep their lines
  // in the line_items jsonb the RPC falls back to. One fetch, one truth.
  const items = ((quote as { _public_items?: unknown[] } | null)?._public_items ?? []) as {
    id: string; description: string; quantity: number; unit?: string;
    unit_price_cents: number; line_total_cents: number;
    is_optional?: boolean; selected_by_customer?: boolean;
  }[];

  const toggleOptional = async (itemId: string, selected: boolean) => {
    if (!token) return;
    const { error } = await supabase.rpc('set_quote_item_selection' as never, {
      _accept_token: token, _item_id: itemId, _selected: selected,
    } as never);
    if (!error) {
      // Items travel inside the public-quote payload now — refetching the
      // quote refreshes them and the recalculated totals together.
      refetch();
    }
  };

  // Mark viewed once
  useEffect(() => {
    if (quote?.id && (quote as { status: string }).status === 'sent') {
      markQuoteViewed(quote.id).catch(() => {});
    }
  }, [quote?.id, quote]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{t('quote.notFound', 'Quote not found')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('quote.linkInvalid', 'This quote link is invalid or has expired.')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = (quote as { status: string }).status;
  const currency = (quote as { currency: string }).currency || 'SEK';
  const total = (quote as { total_cents: number }).total_cents || 0;
  const subtotal = (quote as { subtotal_cents: number }).subtotal_cents || 0;
  const tax = (quote as { tax_cents: number }).tax_cents || 0;
  const validUntil = (quote as { valid_until: string | null }).valid_until;
  const fmt = (cents: number) => formatCurrency(cents, currency);

  const isFinal = status === 'accepted' || status === 'rejected';
  // Expiry mirrors the server-side gate in quote-sign: valid through valid_until, expired after.
  const todayStr = new Date().toISOString().slice(0, 10);
  const isExpired = !isFinal && !!validUntil && validUntil < todayStr;

  const handleSubmit = async () => {
    if (!signerName.trim() || !signerEmail.trim()) return;
    if (!token) return;
    await signQuote.mutateAsync({
      accept_token: token,
      action: mode === 'accept' ? 'accept' : 'reject',
      signer_name: signerName,
      signer_email: signerEmail,
      signature_data: signerName, // typed signature (always recorded)
      signature_image: signatureImage ?? undefined, // drawn signature (optional)
      comment,
    });
    setMode('view');
    refetch();
  };

  return (
    <div className="min-h-screen bg-muted/20 py-8 px-4">
      <Helmet>
        <title>{`Quote ${(quote as { quote_number: string }).quote_number}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="max-w-3xl mx-auto space-y-6">
        {paymentReturn === 'success' && (
          <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-3 text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Payment completed — thank you!
              {payStatus && payStatus.remaining_cents > 0 && payStatus.paid_amount_cents === 0
                ? ' It may take a moment for the confirmation to appear below.'
                : ''}
            </span>
          </div>
        )}
        {paymentReturn === 'cancelled' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t('quote.paymentCancelled', 'Payment was cancelled — you can try again below whenever you are ready.')}</span>
          </div>
        )}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle className="text-2xl">
                    Quote {(quote as { quote_number: string }).quote_number}
                  </CardTitle>
                  {(quote as { title: string | null }).title && (
                    <p className="text-muted-foreground mt-1">{(quote as { title: string }).title}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
                  <Download className="h-4 w-4" />{t('sign.savePdf', 'Save as PDF')}</Button>
                <Badge variant={isFinal ? 'secondary' : 'default'}>{status}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {(quote as { intro_text: string | null }).intro_text && (
              <p className="text-sm whitespace-pre-wrap">{(quote as { intro_text: string }).intro_text}</p>
            )}

            <div className="space-y-2">
              <h3 className="font-medium">Items</h3>
              <div className="border rounded-md divide-y">
                {items.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">{t('quote.noItems', 'No items')}</p>
                ) : (
                  items.map((it) => {
                    const item = it as {
                      id: string;
                      description: string;
                      quantity: number;
                      unit?: string;
                      unit_price_cents: number;
                      line_total_cents: number;
                      is_optional?: boolean;
                      selected_by_customer?: boolean;
                    };
                    const isOptional = !!item.is_optional;
                    const isSelected = item.selected_by_customer !== false;
                    const dimmed = isOptional && !isSelected;
                    return (
                      <div key={item.id} className={`p-3 flex items-center gap-3 ${dimmed ? 'opacity-50' : ''}`}>
                        {isOptional && !isFinal && (
                          <Checkbox checked={isSelected} onCheckedChange={(v) => toggleOptional(item.id, !!v)} />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm">{item.description}</p>
                            {isOptional && <Badge variant="outline" className="text-xs">{t('quote.optional', 'Optional')}</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit || ''} × {fmt(item.unit_price_cents)}
                          </p>
                        </div>
                        <p className={`font-mono text-sm ${dimmed ? 'line-through' : ''}`}>{fmt(item.line_total_cents)}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-1 text-sm border-t pt-3">
              <div className="flex justify-between"><span>{t('quote.subtotal', 'Subtotal')}</span><span className="font-mono">{fmt(subtotal)}</span></div>
              <div className="flex justify-between"><span>Tax</span><span className="font-mono">{fmt(tax)}</span></div>
              <div className="flex justify-between font-medium text-base border-t pt-1"><span>Total</span><span className="font-mono">{fmt(total)}</span></div>

              <div className="hidden print:block border-t pt-4 mt-4 text-xs text-muted-foreground">
                <p>
                  Quote {(quote as { quote_number: string }).quote_number} — status: {status}
                  {(quote as { accepted_at?: string | null }).accepted_at
                    ? ` — accepted ${new Date((quote as { accepted_at: string }).accepted_at).toLocaleString('sv-SE')}`
                    : ''}
                  {validUntil ? ` — valid until ${validUntil}` : ''}
                </p>
                <p>
                  Rendered from the live quote on {new Date().toLocaleString('sv-SE')}. The web page
                  is the authoritative copy; this PDF is a snapshot of it.
                </p>
              </div>
            </div>

            {validUntil && (
              <p className="text-xs text-muted-foreground">Valid until {formatDate(validUntil)}</p>
            )}

            {(quote as { terms_text: string | null }).terms_text && (
              <div className="border-t pt-4 space-y-1">
                <h3 className="text-xs font-medium uppercase text-muted-foreground">Terms</h3>
                <p className="text-xs whitespace-pre-wrap">{(quote as { terms_text: string }).terms_text}</p>
              </div>
            )}

            {/* Expired notice — accepting is blocked server-side too (quote-sign returns 410) */}
            {isExpired && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm flex items-start gap-2">
                <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  This quote expired on {formatDate(validUntil!)} — contact us for a renewed offer.
                </span>
              </div>
            )}

            {/* Signing */}
            {!isFinal && mode === 'view' && (
              <div className="print:hidden border-t pt-4 flex flex-wrap gap-2">
                <Button onClick={() => setMode('accept')} disabled={isExpired} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" /> {contractMode ? 'Approve Quote' : 'Accept Quote'}
                </Button>
                <Button onClick={() => setMode('reject')} variant="outline" className="gap-2">
                  <XCircle className="h-4 w-4" />{t('quote.decline', 'Decline')}</Button>
              </div>
            )}

            {!isFinal && mode !== 'view' && (
              <div className="print:hidden border-t pt-4 space-y-3">
                <h3 className="font-medium">
                  {mode === 'accept'
                    ? (contractMode ? 'Confirm approval' : 'Confirm acceptance')
                    : 'Decline this quote'}
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t('sign.yourName', 'Your name')}</Label>
                    <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Comment (optional)</Label>
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
                </div>
                {/* The signature pad belongs only to invoice mode, where the
                    quote is the final document. In contract mode the customer
                    signs ONE thing — the agreement — and offering a pad here
                    would stage a second signing ceremony for the same deal. */}
                {mode === 'accept' && !contractMode && (
                  <div className="space-y-1">
                    <Label>{t('sign.signature', 'Signature')}</Label>
                    <Tabs defaultValue="type" onValueChange={(v) => { if (v === 'type') setSignatureImage(null); }}>
                      <TabsList>
                        <TabsTrigger value="type">{t('sign.typeName', 'Type name')}</TabsTrigger>
                        <TabsTrigger value="draw">Draw</TabsTrigger>
                      </TabsList>
                      <TabsContent value="type">
                        <p className="font-serif italic text-2xl border rounded-md px-4 py-3 min-h-[3.5rem] text-foreground/80">
                          {signerName || <span className="text-sm not-italic font-sans text-muted-foreground">{t('sign.typedIsSignature', 'Your typed name is used as your signature')}</span>}
                        </p>
                      </TabsContent>
                      <TabsContent value="draw">
                        <SignaturePad onChange={setSignatureImage} />
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {mode === 'accept' && contractMode
                    ? 'By clicking Approve you confirm your order. The formal agreement follows for signature — that signature is the binding step.'
                    : `By ${mode === 'accept' ? 'signing' : 'typing your name'} and clicking ${mode === 'accept' ? 'Accept' : 'Decline'} you create a binding electronic signature.`}
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={!signerName.trim() || !signerEmail.trim() || signQuote.isPending}
                    variant={mode === 'accept' ? 'default' : 'destructive'}
                  >
                    {mode === 'accept' ? (contractMode ? 'Approve quote' : 'Accept & Sign') : 'Decline'}
                  </Button>
                  <Button variant="ghost" onClick={() => setMode('view')}>{t('sign.cancel', 'Cancel')}</Button>
                </div>
              </div>
            )}

            {isFinal && (
              <div className="border-t pt-4 space-y-3">
                {status === 'accepted' ? (
                  <>
                    <div className="flex items-center gap-2 text-primary">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">
                        {contractMode
                          ? 'This quote has been approved. Thank you!'
                          : 'This quote has been accepted. Thank you!'}
                      </span>
                    </div>
                    {contractMode && (
                      // Set the expectation for step two, so the agreement
                      // arriving for signature reads as the plan, not a
                      // surprise second round of paperwork.
                      <p className="text-sm text-muted-foreground">
                        We are preparing your agreement — it will be sent to you
                        for signature.
                      </p>
                    )}

                    {/* Sign-and-pay: settle the auto-created invoice right here */}
                    {payStatus && payStatus.remaining_cents <= 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge>Paid</Badge>
                        <span className="text-muted-foreground">
                          Invoice {payStatus.invoice_number} is paid in full
                          {payStatus.quote_paid_at ? ` (${formatDateTime(payStatus.quote_paid_at)})` : ''}.
                        </span>
                      </div>
                    )}
                    {payStatus && payStatus.remaining_cents > 0 && (
                      <div className="rounded-md border p-3 space-y-2 bg-muted/40">
                        {payStatus.paid_amount_cents > 0 ? (
                          <p className="text-sm">
                            <Badge variant="secondary" className="mr-2">{t('quote.depositPaid', 'Deposit paid')}</Badge>
                            {fmt(payStatus.paid_amount_cents)} received — remaining balance{' '}
                            <span className="font-medium">{fmt(payStatus.remaining_cents)}</span> on invoice {payStatus.invoice_number}.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {payStatus.prepayment_pct
                              ? `A ${payStatus.prepayment_pct}% prepayment confirms your order — the remainder is invoiced separately (invoice ${payStatus.invoice_number}).`
                              : `You can settle invoice ${payStatus.invoice_number} right away.`}
                          </p>
                        )}
                        <Button onClick={handlePayNow} disabled={payPending} className="gap-2">
                          <CreditCard className="h-4 w-4" />
                          {payPending ? 'Redirecting…' : `Pay now — ${fmt(payStatus.pay_now_cents)}`}
                        </Button>
                        {payNotice && <p className="text-xs text-muted-foreground">{payNotice}</p>}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="h-5 w-5" />
                    <span>{t('quote.declined', 'This quote has been declined.')}</span>
                  </div>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/quote/${token}/certificate`}>
                    <ShieldCheck className="h-4 w-4 mr-1" />
                    {contractMode ? 'View acceptance record' : 'View signature certificate'}
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
