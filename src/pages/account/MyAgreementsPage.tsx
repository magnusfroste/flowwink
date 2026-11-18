/**
 * My agreements — the agreements the signed-in customer has with the business.
 *
 * "Contracts" in the portal was the EMPLOYEE's employment contract; a customer
 * who had signed a service agreement could not find it again. Reads
 * my_account(): agreements that were sent for signature or are in force, with
 * the link the mail carried. Opening one goes to the same page it was signed
 * on — to sign it if it still waits, to read it if it is signed.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileSignature } from 'lucide-react';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { useUiText } from '@/lib/ui-text';
import { agreementAwaitsSignature, useMyAccount, type MyAgreement } from '@/hooks/useMyAccount';

export default function MyAgreementsPage() {
  const t = useUiText();
  const { formatDate } = useCustomerFormat();
  const { data, isLoading } = useMyAccount();
  const agreements = data?.agreements ?? [];

  const statusLabel = (a: MyAgreement) =>
    agreementAwaitsSignature(a) ? t('account.agreements.status.toSign', 'Waiting for your signature')
      : a.status === 'active' || a.status === 'signed' ? t('account.agreements.status.active', 'In force')
        : a.status === 'terminated' || a.status === 'expired' ? t('account.agreements.status.ended', 'Ended')
          : a.status;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('account.agreements.title', 'My agreements')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('account.agreements.intro', 'The agreements between you and us — open one to read it, or to sign it if it is waiting for you.')}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!isLoading && agreements.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {t('account.agreements.empty', 'You have no agreements yet.')}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {agreements.map((a) => {
          const toSign = agreementAwaitsSignature(a);
          return (
            <Card key={a.id} data-testid="my-agreement">
              <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileSignature className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.title || a.contract_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.contract_number ?? ''}
                      {a.signed_at ? ` · ${t('account.agreements.signed', 'Signed')} ${formatDate(a.signed_at)}` : ''}
                      {a.end_date ? ` · ${t('account.agreements.until', 'Until')} ${formatDate(a.end_date)}` : ''}
                    </p>
                  </div>
                </div>
                <Badge variant={toSign ? 'default' : 'secondary'}>{statusLabel(a)}</Badge>
                <Button asChild size="sm" variant={toSign ? 'default' : 'outline'}>
                  <Link to={`/contract/${a.accept_token}`}>{toSign ? t('account.agreements.sign', 'Read and sign') : t('account.agreements.open', 'Open')}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
