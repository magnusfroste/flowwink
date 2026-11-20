/**
 * My bookings — the times the signed-in customer has booked with the business.
 *
 * The portal showed invoices, agreements, quotes, services and orders, and no
 * booking: a customer found their time only in the confirmation mail, and had
 * to find that mail again to move it. Reads my_account(): what is coming, with
 * the same "change or cancel" door the mail linked to, and what passed in the
 * last 90 days.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarClock, Video } from 'lucide-react';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { useUiText } from '@/lib/ui-text';
import { bookingStatusWord } from '@/lib/customer-words';
import { bookingIsAhead, useMyAccount, type MyBooking } from '@/hooks/useMyAccount';

export default function MyBookingsPage() {
  const t = useUiText();
  const { formatDateTime, formatTime } = useCustomerFormat();
  const { data, isLoading } = useMyAccount();
  const bookings = data?.bookings ?? [];
  const ahead = bookings.filter(bookingIsAhead);
  const passed = bookings.filter((b) => !bookingIsAhead(b)).reverse();

  const row = (b: MyBooking) => {
    const live = bookingIsAhead(b);
    return (
      <Card key={b.id} data-testid="my-booking" data-ahead={live ? 'true' : 'false'}>
        <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CalendarClock className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{b.service_name || t('account.bookings.booking', 'Booking')}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(b.start_time, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: undefined, minute: undefined })}
                {' · '}{formatTime(b.start_time)}{b.end_time ? `–${formatTime(b.end_time)}` : ''}
              </p>
            </div>
          </div>
          <Badge variant={live ? 'default' : 'secondary'}>{bookingStatusWord(b.status, b.upcoming, t)}</Badge>
          {live && b.meeting_url && (
            <Button asChild size="sm" variant="outline">
              <a href={b.meeting_url} target="_blank" rel="noreferrer"><Video className="h-4 w-4 mr-1.5" />{t('account.bookings.join', 'Join the meeting')}</a>
            </Button>
          )}
          {b.manage_token && (
            <Button asChild size="sm">
              <Link to={`/my-booking/${b.manage_token}`}>{t('account.bookings.change', 'Change or cancel')}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('account.bookings.title', 'My bookings')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('account.bookings.intro', 'The times you have booked with us — move or cancel one that is coming up.')}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!isLoading && bookings.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {t('account.bookings.empty', 'You have no bookings with us.')}
          </CardContent>
        </Card>
      )}

      {ahead.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t('account.bookings.ahead', 'Coming up')}</h2>
          {ahead.map(row)}
        </section>
      )}

      {passed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t('account.bookings.passed', 'Earlier')}</h2>
          {passed.map(row)}
        </section>
      )}
    </div>
  );
}
