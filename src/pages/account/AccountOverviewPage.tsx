/**
 * The portal's first page — what is waiting for the customer, and what they
 * have with the business.
 *
 * The portal opened on Orders. A customer who holds a service and has never
 * bought anything in a shop was met by "No orders yet — browse products"
 * (2026-11-18). This page is shaped by what the customer HAS, not by which
 * module came first: what needs their action on top (an invoice to pay, a
 * quote to answer, an agreement to sign), then their services, agreements,
 * invoices, orders and open cases — each section only when there is something
 * in it.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowRight, FileSignature, LifeBuoy, Package, Receipt, ShoppingBag } from 'lucide-react';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { useUiText } from '@/lib/ui-text';
import { agreementAwaitsSignature, invoiceIsOpen, useMyAccount } from '@/hooks/useMyAccount';

export default function AccountOverviewPage() {
  const t = useUiText();
  const { formatCurrency, formatDate } = useCustomerFormat();
  const { data, isLoading } = useMyAccount();

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  const toPay = data.invoices.filter(invoiceIsOpen);
  const toSign = data.agreements.filter(agreementAwaitsSignature);
  const toAnswer = data.quotes_waiting;
  const inForce = data.agreements.filter((a) => !agreementAwaitsSignature(a) && a.status !== 'terminated' && a.status !== 'expired');
  const waiting = toPay.length + toSign.length + toAnswer.length;
  const nothing = waiting === 0 && data.services.length === 0 && data.agreements.length === 0
    && data.invoices.length === 0 && data.recent_orders.length === 0 && data.open_cases.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('account.overview.title', 'Overview')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('account.overview.intro', 'What is waiting for you, and what you have with us.')}
        </p>
      </div>

      {!data.email_confirmed && (
        <Card className="border-warning/50">
          <CardContent className="py-4 flex items-start gap-3 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
            <p>{t('account.overview.confirmEmail', 'Confirm your e-mail address to see your invoices, agreements and quotes here — use the link in the e-mail we sent when you registered.')}</p>
          </CardContent>
        </Card>
      )}

      {waiting > 0 && (
        <Card className="border-primary/40" data-testid="account-waiting">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('account.overview.waiting', 'Waiting for you')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {toPay.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 text-sm">
                <Receipt className="h-4 w-4 text-primary shrink-0" />
                <span className="flex-1 min-w-0">
                  {t('account.overview.payInvoice', 'Invoice {number} to pay').replace('{number}', i.invoice_number)}
                  {i.due_date ? <span className="text-muted-foreground"> · {t('account.invoices.due', 'Due')} {formatDate(i.due_date)}</span> : null}
                </span>
                <span className="font-mono">{formatCurrency(i.total_cents - i.paid_amount_cents, i.currency ?? undefined)}</span>
                {i.public_token && (
                  <Button asChild size="sm"><Link to={`/invoice/${i.public_token}`}>{t('account.invoices.pay', 'View and pay')}</Link></Button>
                )}
              </div>
            ))}
            {toSign.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 text-sm">
                <FileSignature className="h-4 w-4 text-primary shrink-0" />
                <span className="flex-1 min-w-0">{t('account.overview.signAgreement', 'Agreement to sign: {title}').replace('{title}', a.title || a.contract_number || '')}</span>
                <Button asChild size="sm"><Link to={`/contract/${a.accept_token}`}>{t('account.agreements.sign', 'Read and sign')}</Link></Button>
              </div>
            ))}
            {toAnswer.map((q) => (
              <div key={q.id} className="flex flex-wrap items-center gap-3 text-sm">
                <FileSignature className="h-4 w-4 text-primary shrink-0" />
                <span className="flex-1 min-w-0">{t('account.overview.answerQuote', 'Quote to answer: {title}').replace('{title}', q.title || q.quote_number)}</span>
                <span className="font-mono">{formatCurrency(q.total_cents, q.currency)}</span>
                <Button asChild size="sm"><Link to={`/quote/${q.accept_token}`}>{t('account.quotes.answer', 'Read and answer')}</Link></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {nothing && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {t('account.overview.empty', 'There is nothing here yet. When we send you a quote, an agreement or an invoice — or you place an order — it shows up here.')}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data.services.length > 0 && (
          <Section icon={<Package className="h-4 w-4 text-primary" />} title={t('account.overview.services', 'Your services')} to="/account/services" more={t('account.overview.all', 'See all')}>
            {data.services.slice(0, 4).map((s) => (
              <Row key={s.id} label={s.product_name || t('account.overview.service', 'Service')}
                value={s.unit_amount_cents != null ? `${formatCurrency(s.unit_amount_cents, s.currency ?? undefined)}${s.billing_interval ? ` / ${s.billing_interval}` : ''}` : ''} />
            ))}
          </Section>
        )}
        {inForce.length > 0 && (
          <Section icon={<FileSignature className="h-4 w-4 text-primary" />} title={t('account.overview.agreements', 'Your agreements')} to="/account/agreements" more={t('account.overview.all', 'See all')}>
            {inForce.slice(0, 4).map((a) => (
              <Row key={a.id} label={a.title || a.contract_number || ''} value={a.end_date ? `${t('account.agreements.until', 'Until')} ${formatDate(a.end_date)}` : ''} />
            ))}
          </Section>
        )}
        {data.invoices.length > 0 && (
          <Section icon={<Receipt className="h-4 w-4 text-primary" />} title={t('account.overview.invoices', 'Your invoices')} to="/account/invoices" more={t('account.overview.all', 'See all')}>
            {data.invoices.slice(0, 4).map((i) => (
              <Row key={i.id} label={i.invoice_number} value={formatCurrency(i.total_cents, i.currency ?? undefined)} />
            ))}
          </Section>
        )}
        {data.recent_orders.length > 0 && (
          <Section icon={<ShoppingBag className="h-4 w-4 text-primary" />} title={t('account.overview.orders', 'Your orders')} to="/account/orders" more={t('account.overview.all', 'See all')}>
            {data.recent_orders.slice(0, 4).map((o) => (
              <Row key={o.id} label={formatDate(o.created_at)} value={formatCurrency(o.total_cents, o.currency ?? undefined)} />
            ))}
          </Section>
        )}
        {data.open_cases.length > 0 && (
          <Section icon={<LifeBuoy className="h-4 w-4 text-primary" />} title={t('account.overview.cases', 'Your open support requests')} to="/account/support" more={t('account.overview.all', 'See all')}>
            {data.open_cases.slice(0, 4).map((c) => (
              <Row key={c.id} label={c.subject} value={c.ticket_number ?? ''} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ icon, title, to, more, children }: { icon: React.ReactNode; title: string; to: string; more: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">{icon}{title}</CardTitle>
        <Button asChild size="sm" variant="ghost" className="gap-1">
          <Link to={to}>{more}<ArrowRight className="h-3.5 w-3.5" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate">{label}</span>
      <span className="font-mono text-muted-foreground shrink-0">{value}</span>
    </div>
  );
}
