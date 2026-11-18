/**
 * The customer's own booking (2026-11-19): what the link in the confirmation
 * mail opens. Whoever holds the key reads the booking, moves it to another
 * free time or calls it off — no account, no phone call. The times offered are
 * the public booking block's own (booking_free_slots), and the move meets
 * every rule a new booking does.
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUiText } from '@/lib/ui-text';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { useBookingFreeSlots } from '@/hooks/useBookings';

interface PublicBooking {
  id: string;
  status: string;
  start_time: string;
  end_time: string;
  customer_name: string | null;
  service_id: string | null;
  service_name: string | null;
  meeting_url: string | null;
  business_name: string | null;
  can_change: boolean;
}

interface Answer { success?: boolean; error?: string; code?: string }

export default function PublicBookingPage() {
  const t = useUiText();
  const { formatDateTime } = useCustomerFormat();
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();

  const { data: booking, isLoading } = useQuery({
    queryKey: ['public-booking', token],
    enabled: !!token,
    queryFn: async (): Promise<PublicBooking | null> => {
      const { data, error } = await supabase.rpc('get_booking_by_token' as never, { p_token: token } as never);
      if (error) throw error;
      return (data as PublicBooking | null) ?? null;
    },
  });

  const [mode, setMode] = useState<'view' | 'move' | 'cancel'>('view');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<'moved' | 'cancelled' | null>(null);

  const { data: free, isLoading: slotsLoading } = useBookingFreeSlots(
    mode === 'move' && date ? date : null,
    booking?.service_id ?? null,
  );

  const run = async (fn: string, args: Record<string, unknown>, outcome: 'moved' | 'cancelled') => {
    setBusy(true);
    setProblem(null);
    const { data, error } = await supabase.rpc(fn as never, args as never);
    setBusy(false);
    const answer = (data ?? {}) as Answer;
    if (error || answer.success === false) {
      setProblem(
        answer.code === 'SLOT_UNAVAILABLE'
          ? t('booking.slot_unavailable', 'That time is no longer available — please pick another.')
          : answer.code === 'TOO_LATE'
            ? t('booking.manage.tooLate', 'This booking can no longer be changed.')
            : t('booking.manage.failed', 'That did not work. Please try again, or contact us.'),
      );
      await queryClient.invalidateQueries({ queryKey: ['booking-free-slots'] });
      return;
    }
    setDone(outcome);
    setMode('view');
    await queryClient.invalidateQueries({ queryKey: ['public-booking', token] });
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader><CardTitle>{t('booking.manage.notFound', 'Booking not found')}</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">{t('booking.manage.linkInvalid', 'This booking link is not valid.')}</p></CardContent>
        </Card>
      </div>
    );
  }

  const cancelled = booking.status === 'cancelled';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-muted/20 py-8 px-4">
      <Helmet>
        <title>{t('booking.manage.title', 'Your booking')}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="max-w-xl mx-auto space-y-6">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>{t('booking.manage.title', 'Your booking')}</CardTitle>
                {booking.business_name && (
                  <p className="text-sm text-muted-foreground" data-testid="booking-business">{booking.business_name}</p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {done === 'moved' && (
              <p className="flex items-center gap-2 text-sm font-medium" data-testid="booking-moved">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t('booking.manage.moved', 'Your booking has been moved. We have sent you a new confirmation.')}
              </p>
            )}
            {cancelled && (
              <p className="flex items-center gap-2 text-sm font-medium" data-testid="booking-cancelled">
                <XCircle className="h-4 w-4 text-destructive" />
                {t('booking.manage.cancelled', 'This booking is cancelled.')}
              </p>
            )}
            <dl className="space-y-2 text-sm">
              {booking.service_name && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t('booking.manage.service', 'Service')}</dt>
                  <dd className="font-medium text-right">{booking.service_name}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t('booking.manage.when', 'When')}</dt>
                <dd className={`font-medium text-right ${cancelled ? 'line-through text-muted-foreground' : ''}`} data-testid="booking-when">
                  {formatDateTime(booking.start_time)}
                </dd>
              </div>
              {booking.customer_name && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t('booking.manage.bookedFor', 'Booked for')}</dt>
                  <dd className="font-medium text-right">{booking.customer_name}</dd>
                </div>
              )}
            </dl>

            {!cancelled && !booking.can_change && (
              <p className="text-sm text-muted-foreground">{t('booking.manage.tooLate', 'This booking can no longer be changed.')}</p>
            )}

            {booking.can_change && mode === 'view' && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => { setMode('move'); setProblem(null); setDone(null); }}>
                  {t('booking.manage.move', 'Choose another time')}
                </Button>
                <Button variant="outline" onClick={() => { setMode('cancel'); setProblem(null); setDone(null); }}>
                  {t('booking.manage.cancel', 'Cancel the booking')}
                </Button>
              </div>
            )}

            {booking.can_change && mode === 'move' && (
              <div className="space-y-3 border-t pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="booking-new-date">{t('booking.manage.newDate', 'New date')}</Label>
                  <Input id="booking-new-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                {date && (slotsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (free?.slots ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="booking-no-times">
                    {t('booking.noTimes', 'No available times for this date. Please select another day.')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(free?.slots ?? []).map((slot) => (
                      <Button
                        key={slot.starts_at}
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        data-testid="booking-slot"
                        onClick={() => run('reschedule_booking_by_token', { p_token: token, p_new_start: slot.starts_at }, 'moved')}
                      >
                        {slot.time}
                      </Button>
                    ))}
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setMode('view')}>{t('booking.back', 'Back')}</Button>
              </div>
            )}

            {booking.can_change && mode === 'cancel' && (
              <div className="space-y-3 border-t pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="booking-cancel-reason">{t('booking.manage.reason', 'Anything you want us to know? (optional)')}</Label>
                  <Textarea id="booking-cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="destructive" disabled={busy} onClick={() => run('cancel_booking_by_token', { p_token: token, p_reason: reason || null }, 'cancelled')}>
                    {t('booking.manage.confirmCancel', 'Yes, cancel the booking')}
                  </Button>
                  <Button variant="ghost" onClick={() => setMode('view')}>{t('booking.manage.keep', 'Keep the booking')}</Button>
                </div>
              </div>
            )}

            {problem && <p className="text-sm text-destructive" role="alert">{problem}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
