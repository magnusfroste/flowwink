/**
 * Public invoice page — anonymous customer can view and pay invoice via /invoice/:token
 */
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, FileText, CreditCard, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get('paid') === '1';
  const [paying, setPaying] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data: invoice, isLoading, refetch } = useQuery({
    queryKey: ['public-invoice', token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('public_token', token)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!token,
    refetchInterval: justPaid ? 3000 : false,
  });

  // Mark viewed once
  useEffect(() => {
    if (invoice?.id && !invoice.viewed_at) {
      supabase.from('invoices').update({ viewed_at: new Date().toISOString() }).eq('id', invoice.id).then(() => {});
    }
  }, [invoice?.id, invoice?.viewed_at]);

  const handlePay = async () => {
    if (!token) return;
    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-invoice-payment', {
        body: { public_token: token, return_url: window.location.origin },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No payment URL returned');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to start payment');
      setPaying(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-invoice-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ invoice_id: invoice.id }),
        }
      );
      if (!resp.ok) throw new Error('PDF download failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Invoice not found</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground">This invoice link is invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currency = invoice.currency || 'SEK';
  const fmt = (cents: number) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format((cents || 0) / 100);
  const items = Array.isArray(invoice.line_items) ? (invoice.line_items as any[]) : [];
  const isPaid = invoice.status === 'paid';
  const isCancelled = invoice.status === 'cancelled';

  return (
    <div className="min-h-screen bg-muted/20 py-8 px-4">
      <Helmet>
        <title>{`Invoice ${invoice.invoice_number}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="max-w-3xl mx-auto space-y-6">
        {justPaid && !isPaid && (
          <Card className="border-primary">
            <CardContent className="pt-6 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm">Payment received — confirming…</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle className="text-2xl">Invoice {invoice.invoice_number}</CardTitle>
                  {invoice.customer_name && (
                    <p className="text-muted-foreground mt-1">{invoice.customer_name}</p>
                  )}
                </div>
              </div>
              <Badge variant={isPaid ? 'default' : isCancelled ? 'secondary' : 'outline'}>
                {invoice.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <h3 className="font-medium">Items</h3>
              <div className="border rounded-md divide-y">
                {items.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No items</p>
                ) : (
                  items.map((it, i) => {
                    const qty = Number(it.qty ?? it.quantity ?? 1);
                    const unit = Number(it.unit_price_cents ?? 0);
                    return (
                      <div key={i} className="p-3 flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm">{it.description}</p>
                          <p className="text-xs text-muted-foreground">{qty} × {fmt(unit)}</p>
                        </div>
                        <p className="font-mono text-sm">{fmt(qty * unit)}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-1 text-sm border-t pt-3">
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{fmt(invoice.subtotal_cents)}</span></div>
              <div className="flex justify-between"><span>Tax</span><span className="font-mono">{fmt(invoice.tax_cents)}</span></div>
              <div className="flex justify-between font-medium text-base border-t pt-1">
                <span>Total</span><span className="font-mono">{fmt(invoice.total_cents)}</span>
              </div>
            </div>

            {invoice.due_date && (
              <p className="text-xs text-muted-foreground">
                Due {format(new Date(invoice.due_date), 'yyyy-MM-dd')}
              </p>
            )}

            {invoice.notes && (
              <div className="border-t pt-4 space-y-1">
                <h3 className="text-xs font-medium uppercase text-muted-foreground">Notes</h3>
                <p className="text-xs whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            <div className="border-t pt-4 flex flex-wrap gap-2">
              {isPaid ? (
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">This invoice has been paid. Thank you!</span>
                </div>
              ) : isCancelled ? (
                <p className="text-sm text-muted-foreground">This invoice has been cancelled.</p>
              ) : (
                <Button onClick={handlePay} disabled={paying} className="gap-2">
                  {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Pay {fmt(invoice.total_cents)}
                </Button>
              )}
              <Button variant="outline" onClick={handleDownloadPdf} disabled={downloading} className="gap-2">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
