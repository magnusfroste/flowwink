/**
 * My quotes — the customer's view of what has been offered to them.
 *
 * Reads my_quotes(): only quotes that were actually SENT to the signed-in
 * address, only the fields the customer already got by mail. Opening one goes
 * to the same public page the mailed link does, where it can be read, signed
 * and paid — the portal does not grow a second signing flow.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileSignature } from 'lucide-react';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useUiText } from '@/lib/ui-text';

interface MyQuote {
  id: string;
  quote_number: string;
  title: string | null;
  status: 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';
  total_cents: number;
  currency: string;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  paid_at: string | null;
  accept_token: string;
}

const STATUS_VARIANT: Record<MyQuote['status'], 'default' | 'secondary' | 'outline'> = {
  sent: 'default',
  viewed: 'default',
  accepted: 'secondary',
  rejected: 'outline',
  expired: 'outline',
};

export default function MyQuotesPage() {
  const { formatCurrency, formatDate } = usePlatformFormat();
  const t = useUiText();
  const statusLabel: Record<MyQuote['status'], string> = {
    sent: t('account.quotes.status.open', 'Awaiting your answer'),
    viewed: t('account.quotes.status.open', 'Awaiting your answer'),
    accepted: t('account.quotes.status.accepted', 'Accepted'),
    rejected: t('account.quotes.status.rejected', 'Declined'),
    expired: t('account.quotes.status.expired', 'Expired'),
  };

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['my-quotes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_quotes' as never);
      if (error) throw error;
      return ((data as { quotes?: MyQuote[] } | null)?.quotes ?? []) as MyQuote[];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('account.quotes.title', 'My quotes')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('account.quotes.intro', 'The offers we have sent you — open one to read it, accept it or decline it.')}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!isLoading && quotes.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {t('account.quotes.empty', 'You have no quotes yet.')}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {quotes.map((q) => {
          const open = q.status === 'sent' || q.status === 'viewed';
          return (
            <Card key={q.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileSignature className="h-4 w-4 text-primary shrink-0" />
                    {q.title || q.quote_number}
                  </CardTitle>
                  <Badge variant={STATUS_VARIANT[q.status]}>{statusLabel[q.status]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('account.quotes.number', 'Quote')}</span>
                  <span className="font-mono">{q.quote_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('account.quotes.total', 'Total')}</span>
                  <span className="font-mono">{formatCurrency(q.total_cents, q.currency)}</span>
                </div>
                {open && q.valid_until && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('account.quotes.validUntil', 'Valid until')}</span>
                    <span>{formatDate(q.valid_until)}</span>
                  </div>
                )}
                {q.accepted_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('account.quotes.status.accepted', 'Accepted')}</span>
                    <span>{formatDate(q.accepted_at)}{q.paid_at ? ` · ${t('account.quotes.paid', 'paid')}` : ''}</span>
                  </div>
                )}
                <Button asChild size="sm" variant={open ? 'default' : 'outline'} className="w-full">
                  <Link to={`/quote/${q.accept_token}`}>{open ? t('account.quotes.answer', 'Read and answer') : t('account.quotes.open', 'Open quote')}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
