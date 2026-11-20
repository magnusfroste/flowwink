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
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { useUiText } from '@/lib/ui-text';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface PaymentInfo {
  seller?: { name?: string; legal_name?: string; org_number?: string; vat_number?: string; address?: string; postal_code?: string; city?: string; email?: string; phone?: string };
  payment?: { bankgiro?: string; iban?: string; bic?: string };
  reference?: string;
}

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const t = useUiText();
  const { formatCurrency, formatDate } = useCustomerFormat();
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get('paid') === '1';
  const [paying, setPaying] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data: invoice, isLoading, refetch } = useQuery({
    queryKey: ['public-invoice', token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase
        .rpc('get_invoice_by_token', { p_token: token });
      if (error) throw error;
      return Array.isArray(data) ? data[0] ?? null : data;
    },
    enabled: !!token,
    refetchInterval: justPaid ? 3000 : false,
  });

  // Who is asking and where the money goes. The page said neither until
  // 2026-11-17: no seller, no organisation or VAT number, and one way to pay —
  // a card button that failed on every instance without Stripe.
  const { data: info } = useQuery({
    queryKey: ['public-invoice-payment-info', token],
    enabled: !!token,
    queryFn: async (): Promise<PaymentInfo | null> => {
      const { data, error } = await supabase.rpc('get_invoice_payment_info' as never, { p_token: token } as never);
      if (error) {
        logger.error('[invoice] could not read the seller and payment details:', error.message);
        return null;
      }
      return (data as unknown as PaymentInfo | null) ?? null;
    },
  });
  // A card can be taken only where the payment function says so (the key is its).
  const { data: cardAvailable = false } = useQuery({
    queryKey: ['public-invoice-card-available'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-invoice-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ probe: true }),
        });
        if (!resp.ok) return false;
        return (await resp.json())?.available === true;
      } catch (e) {
        logger.error('[invoice] could not ask whether a card can be taken:', e);
        return false;
      }
    },
  });

  // Mark viewed once
  useEffect(() => {
    if (invoice?.id && !invoice.viewed_at && token) {
      supabase.rpc('mark_invoice_viewed_by_token', { p_token: token }).then(() => {});
    }
  }, [invoice?.id, invoice?.viewed_at, token]);

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
      toast.error(err.message || t('invoice.payFailed', 'Could not start the payment'));
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
          body: JSON.stringify({ public_token: token }),
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
      toast.error(err.message || t('invoice.pdfFailed', 'Could not download the PDF'));
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
          <CardHeader><CardTitle>{t('invoice.notFound', 'Invoice not found')}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('invoice.linkInvalid', 'This invoice link is invalid or has expired.')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currency = invoice.currency || undefined;
  const fmt = (cents: number) => formatCurrency(cents || 0, currency);
  const items = Array.isArray(invoice.line_items) ? (invoice.line_items as any[]) : [];
  const isPaid = invoice.status === 'paid';
  const isCancelled = invoice.status === 'cancelled';
  const seller = info?.seller ?? {};
  const sellerName = seller.legal_name || seller.name || '';
  const sellerPlace = [seller.address, [seller.postal_code, seller.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const bank = info?.payment ?? {};
  const hasBank = !!(bank.bankgiro || bank.iban);
  const isOpen = !isPaid && !isCancelled;

  return (
    <div className="min-h-screen bg-muted/20 py-8 px-4">
      <Helmet>
        <title>{`${isPaid ? t('invoice.receipt', 'Receipt') : t('invoice.title', 'Invoice')} ${invoice.invoice_number}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="max-w-3xl mx-auto space-y-6">
        {justPaid && !isPaid && (
          <Card className="border-primary">
            <CardContent className="pt-6 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm">{t('invoice.paymentConfirming', 'Payment received — confirming…')}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle className="text-2xl">{isPaid ? t('invoice.receipt', 'Receipt') : t('invoice.title', 'Invoice')} {invoice.invoice_number}</CardTitle>
                  {invoice.customer_name && (
                    <p className="text-muted-foreground mt-1">{invoice.customer_name}</p>
                  )}
                </div>
              </div>
              <Badge variant={isPaid ? 'default' : isCancelled ? 'secondary' : 'outline'}>
                {isPaid ? t('invoice.statusPaid', 'Paid') : isCancelled ? t('invoice.statusCancelled', 'Cancelled') : t('invoice.statusOpen', 'Open')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {sellerName && (
              <div className="text-sm space-y-0.5" data-testid="invoice-seller">
                <p className="text-xs font-medium uppercase text-muted-foreground">{t('invoice.from', 'From')}</p>
                <p className="font-medium">{sellerName}</p>
                {sellerPlace && <p className="text-muted-foreground">{sellerPlace}</p>}
                {seller.org_number && <p className="text-muted-foreground">{t('invoice.orgNumber', 'Org. no.')} {seller.org_number}</p>}
                {seller.vat_number && <p className="text-muted-foreground">{t('invoice.vatNumber', 'VAT no.')} {seller.vat_number}</p>}
              </div>
            )}
            <div className="space-y-2">
              <h3 className="font-medium">{t('invoice.items', 'Items')}</h3>
              <div className="border rounded-md divide-y">
                {items.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">{t('invoice.noItems', 'No items')}</p>
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
              <div className="flex justify-between"><span>{t('invoice.subtotal', 'Subtotal')}</span><span className="font-mono">{fmt(invoice.subtotal_cents)}</span></div>
              <div className="flex justify-between"><span>{t('invoice.tax', 'Tax')}</span><span className="font-mono">{fmt(invoice.tax_cents)}</span></div>
              <div className="flex justify-between font-medium text-base border-t pt-1">
                <span>{t('invoice.total', 'Total')}</span><span className="font-mono">{fmt(invoice.total_cents)}</span>
              </div>
            </div>

            {invoice.due_date && !isPaid && (
              <p className="text-xs text-muted-foreground">
                {t('invoice.due', 'Due')} {formatDate(invoice.due_date)}
              </p>
            )}

            {invoice.notes && (
              <div className="border-t pt-4 space-y-1">
                <h3 className="text-xs font-medium uppercase text-muted-foreground">{t('invoice.notes', 'Notes')}</h3>
                <p className="text-xs whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            {isOpen && (hasBank || (!cardAvailable && seller.email)) && (
              <div className="border-t pt-4 space-y-2" data-testid="invoice-how-to-pay">
                <h3 className="font-medium">{t('invoice.howToPay', 'How to pay')}</h3>
                {hasBank ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                    {bank.bankgiro && (<><dt className="text-muted-foreground">{t('invoice.bankgiro', 'Bankgiro')}</dt><dd className="font-mono">{bank.bankgiro}</dd></>)}
                    {bank.iban && (<><dt className="text-muted-foreground">{t('invoice.iban', 'IBAN')}</dt><dd className="font-mono">{bank.iban}</dd></>)}
                    {bank.iban && bank.bic && (<><dt className="text-muted-foreground">{t('invoice.bic', 'BIC')}</dt><dd className="font-mono">{bank.bic}</dd></>)}
                    <dt className="text-muted-foreground">{t('invoice.reference', 'Reference')}</dt><dd className="font-mono">{info?.reference || invoice.invoice_number}</dd>
                    <dt className="text-muted-foreground">{t('invoice.amountToPay', 'Amount')}</dt><dd className="font-mono">{fmt(invoice.total_cents - Number(invoice.paid_amount_cents || 0))}</dd>
                    {invoice.due_date && (<><dt className="text-muted-foreground">{t('invoice.due', 'Due')}</dt><dd>{formatDate(invoice.due_date)}</dd></>)}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('invoice.payContact', 'For payment details, contact {email}.').replace('{email}', seller.email ?? '')}
                  </p>
                )}
              </div>
            )}

            <div className="border-t pt-4 flex flex-wrap gap-2">
              {isPaid ? (
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">{t('invoice.paidReceipt', 'Paid in full. This is your receipt — thank you!')}</span>
                </div>
              ) : isCancelled ? (
                <p className="text-sm text-muted-foreground">{t('invoice.cancelled', 'This invoice has been cancelled.')}</p>
              ) : cardAvailable ? (
                <Button onClick={handlePay} disabled={paying} className="gap-2">
                  {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {t('invoice.payByCard', 'Pay by card')} {fmt(invoice.total_cents)}
                </Button>
              ) : null}
              <Button variant="outline" onClick={handleDownloadPdf} disabled={downloading} className="gap-2">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {t('invoice.downloadPdf', 'Download PDF')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
