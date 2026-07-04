/**
 * Public quote page — anonymous customer can view and sign their quote via /quote/:token
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, XCircle, FileText, Clock, ShieldCheck, CreditCard } from 'lucide-react';
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
import { format } from 'date-fns';

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
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const paymentReturn = searchParams.get('payment'); // 'success' | 'cancelled' | null
  const { data: quote, isLoading, refetch } = usePublicQuote(token);
  const signQuote = useSignQuote();
  const qc = useQueryClient();

  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<'view' | 'accept' | 'reject'>('view');
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [payPending, setPayPending] = useState(false);
  const [payNotice, setPayNotice] = useState<string | null>(null);

  const quoteStatus = (quote as { status?: string } | null)?.status;

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

  const itemsKey = ['public-quote-items', quote?.id];
  const { data: items = [] } = useQuery({
    queryKey: itemsKey,
    queryFn: async () => {
      if (!quote?.id) return [];
      const { data } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quote.id)
        .order('position', { ascending: true });
      return data || [];
    },
    enabled: !!quote?.id,
  });

  const toggleOptional = async (itemId: string, selected: boolean) => {
    if (!token) return;
    const { error } = await supabase.rpc('set_quote_item_selection' as never, {
      _accept_token: token, _item_id: itemId, _selected: selected,
    } as never);
    if (!error) {
      qc.invalidateQueries({ queryKey: itemsKey });
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
            <CardTitle>Quote not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">This quote link is invalid or has expired.</p>
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
  const fmt = (cents: number) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);

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
            <span>Payment was cancelled — you can try again below whenever you are ready.</span>
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
              <Badge variant={isFinal ? 'secondary' : 'default'}>{status}</Badge>
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
                  <p className="p-4 text-sm text-muted-foreground">No items</p>
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
                            {isOptional && <Badge variant="outline" className="text-xs">Optional</Badge>}
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
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
              <div className="flex justify-between"><span>Tax</span><span className="font-mono">{fmt(tax)}</span></div>
              <div className="flex justify-between font-medium text-base border-t pt-1"><span>Total</span><span className="font-mono">{fmt(total)}</span></div>
            </div>

            {validUntil && (
              <p className="text-xs text-muted-foreground">Valid until {format(new Date(validUntil), 'yyyy-MM-dd')}</p>
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
                  This quote expired on {format(new Date(validUntil!), 'yyyy-MM-dd')} — contact us for a renewed offer.
                </span>
              </div>
            )}

            {/* Signing */}
            {!isFinal && mode === 'view' && (
              <div className="border-t pt-4 flex flex-wrap gap-2">
                <Button onClick={() => setMode('accept')} disabled={isExpired} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Accept Quote
                </Button>
                <Button onClick={() => setMode('reject')} variant="outline" className="gap-2">
                  <XCircle className="h-4 w-4" /> Decline
                </Button>
              </div>
            )}

            {!isFinal && mode !== 'view' && (
              <div className="border-t pt-4 space-y-3">
                <h3 className="font-medium">{mode === 'accept' ? 'Confirm acceptance' : 'Decline this quote'}</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Your name</Label>
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
                {mode === 'accept' && (
                  <div className="space-y-1">
                    <Label>Signature</Label>
                    <Tabs defaultValue="type" onValueChange={(v) => { if (v === 'type') setSignatureImage(null); }}>
                      <TabsList>
                        <TabsTrigger value="type">Type name</TabsTrigger>
                        <TabsTrigger value="draw">Draw</TabsTrigger>
                      </TabsList>
                      <TabsContent value="type">
                        <p className="font-serif italic text-2xl border rounded-md px-4 py-3 min-h-[3.5rem] text-foreground/80">
                          {signerName || <span className="text-sm not-italic font-sans text-muted-foreground">Your typed name is used as your signature</span>}
                        </p>
                      </TabsContent>
                      <TabsContent value="draw">
                        <SignaturePad onChange={setSignatureImage} />
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  By {mode === 'accept' ? 'signing' : 'typing your name'} and clicking {mode === 'accept' ? 'Accept' : 'Decline'} you create a binding electronic signature.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={!signerName.trim() || !signerEmail.trim() || signQuote.isPending}
                    variant={mode === 'accept' ? 'default' : 'destructive'}
                  >
                    {mode === 'accept' ? 'Accept & Sign' : 'Decline'}
                  </Button>
                  <Button variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
                </div>
              </div>
            )}

            {isFinal && (
              <div className="border-t pt-4 space-y-3">
                {status === 'accepted' ? (
                  <>
                    <div className="flex items-center gap-2 text-primary">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">This quote has been accepted. Thank you!</span>
                    </div>

                    {/* Sign-and-pay: settle the auto-created invoice right here */}
                    {payStatus && payStatus.remaining_cents <= 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge>Paid</Badge>
                        <span className="text-muted-foreground">
                          Invoice {payStatus.invoice_number} is paid in full
                          {payStatus.quote_paid_at ? ` (${format(new Date(payStatus.quote_paid_at), 'yyyy-MM-dd')})` : ''}.
                        </span>
                      </div>
                    )}
                    {payStatus && payStatus.remaining_cents > 0 && (
                      <div className="rounded-md border p-3 space-y-2 bg-muted/40">
                        {payStatus.paid_amount_cents > 0 ? (
                          <p className="text-sm">
                            <Badge variant="secondary" className="mr-2">Deposit paid</Badge>
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
                    <span>This quote has been declined.</span>
                  </div>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/quote/${token}/certificate`}>
                    <ShieldCheck className="h-4 w-4 mr-1" /> View signature certificate
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
