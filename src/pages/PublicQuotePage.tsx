/**
 * Public quote page — anonymous customer can view and sign their quote via /quote/:token
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, XCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { usePublicQuote, useSignQuote, markQuoteViewed } from '@/hooks/useQuoteWorkflow';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const { data: quote, isLoading, refetch } = usePublicQuote(token);
  const signQuote = useSignQuote();

  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<'view' | 'accept' | 'reject'>('view');

  // Items via separate query so RLS public-via-token kicks in
  const { data: items = [] } = useQuery({
    queryKey: ['public-quote-items', quote?.id],
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

  const handleSubmit = async () => {
    if (!signerName.trim() || !signerEmail.trim()) return;
    await signQuote.mutateAsync({
      quote_id: quote.id,
      action: mode === 'accept' ? 'accept' : 'reject',
      signer_name: signerName,
      signer_email: signerEmail,
      signature_data: signerName, // typed signature
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
                    };
                    return (
                      <div key={item.id} className="p-3 flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm">{item.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit || ''} × {fmt(item.unit_price_cents)}
                          </p>
                        </div>
                        <p className="font-mono text-sm">{fmt(item.line_total_cents)}</p>
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

            {/* Signing */}
            {!isFinal && mode === 'view' && (
              <div className="border-t pt-4 flex flex-wrap gap-2">
                <Button onClick={() => setMode('accept')} className="gap-2">
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
                <p className="text-xs text-muted-foreground">
                  By typing your name and clicking {mode === 'accept' ? 'Accept' : 'Decline'} you create a binding electronic signature.
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
              <div className="border-t pt-4">
                {status === 'accepted' ? (
                  <div className="flex items-center gap-2 text-primary">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">This quote has been accepted. Thank you!</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="h-5 w-5" />
                    <span>This quote has been declined.</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
