/**
 * My invoices — what the business has invoiced the signed-in customer.
 *
 * The portal had no such page: a service customer could see their service and
 * not one invoice for it. Reads my_account(): only invoices that were ISSUED
 * (never a draft), with the link the invoice mail carried. Opening one goes to
 * the same public invoice page, where it is read, paid and downloaded — the
 * portal does not grow a second invoice view.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Receipt } from 'lucide-react';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { useUiText } from '@/lib/ui-text';
import { invoiceIsOpen, useMyAccount, type MyInvoice } from '@/hooks/useMyAccount';

export default function MyInvoicesPage() {
  const t = useUiText();
  const { formatCurrency, formatDate } = useCustomerFormat();
  const { data, isLoading } = useMyAccount();
  const invoices = data?.invoices ?? [];

  const statusLabel = (i: MyInvoice) =>
    i.status === 'paid' ? t('account.invoices.status.paid', 'Paid')
      : i.status === 'overdue' ? t('account.invoices.status.overdue', 'Overdue')
        : i.status === 'partially_paid' ? t('account.invoices.status.partlyPaid', 'Partly paid')
          : t('account.invoices.status.open', 'To pay');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('account.invoices.title', 'My invoices')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('account.invoices.intro', 'What we have invoiced you — open one to see how to pay it or to download it.')}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!isLoading && invoices.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {t('account.invoices.empty', 'You have no invoices yet.')}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {invoices.map((i) => {
          const open = invoiceIsOpen(i);
          return (
            <Card key={i.id} data-testid="my-invoice">
              <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Receipt className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-mono text-sm">{i.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.issue_date ? formatDate(i.issue_date) : ''}
                      {open && i.due_date ? ` · ${t('account.invoices.due', 'Due')} ${formatDate(i.due_date)}` : ''}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-sm">{formatCurrency(open ? i.total_cents - i.paid_amount_cents : i.total_cents, i.currency ?? undefined)}</span>
                <Badge variant={i.status === 'overdue' ? 'destructive' : open ? 'default' : 'secondary'}>{statusLabel(i)}</Badge>
                {i.public_token && (
                  <Button asChild size="sm" variant={open ? 'default' : 'outline'}>
                    <Link to={`/invoice/${i.public_token}`}>{open ? t('account.invoices.pay', 'View and pay') : t('account.invoices.open', 'Open')}</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
