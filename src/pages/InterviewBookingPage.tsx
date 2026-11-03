import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarPlus, Loader2, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { useUiText } from '@/lib/ui-text';
import { useVisitorDateTimeFormat } from '@/lib/visitor-date';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface InvitationView {
  found: boolean;
  status?: 'open' | 'booked' | 'cancelled' | 'expired';
  candidate_first_name?: string;
  job_title?: string;
  kind?: string;
  duration_minutes?: number;
  message?: string | null;
  slots?: string[];
  booked?: { start: string; end: string; meeting_url: string | null; status: string };
}

/** An .ics the candidate adds to their own calendar — built in the browser, nothing stored. */
function icsHref(title: string, start: string, end: string, url: string | null): string {
  const stamp = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FlowWink//Interview//EN', 'BEGIN:VEVENT',
    `UID:${stamp(start)}-${Math.random().toString(36).slice(2)}@flowwink`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${title.replace(/[,;]/g, ' ')}`,
    ...(url ? [`URL:${url}`, `LOCATION:${url}`] : []), 'END:VEVENT', 'END:VCALENDAR',
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}

/**
 * /interview/:token — the candidate picks one of the proposed times. No
 * account: the token is the invitation. Booking makes the video interview
 * (a WebMeet room) and the candidate's confirmation mail is sent once.
 */
export default function InterviewBookingPage() {
  const { token } = useParams<{ token: string }>();
  const t = useUiText();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['interview_invitation', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('interview_invitation_view' as never, { p_token: token } as never);
      if (error) throw error;
      return data as unknown as InvitationView;
    },
  });

  const when = useVisitorDateTimeFormat();
  const byDay = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const s of data?.slots ?? []) {
      const key = when.day(s);
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups];
  }, [data?.slots, when]);

  const book = async () => {
    if (!picked || !token) return;
    setBusy(true);
    setError(null);
    try {
      const { data: res, error: rpcErr } = await supabase.rpc('book_interview_slot' as never, { p_token: token, p_start: picked } as never);
      if (rpcErr) throw rpcErr;
      const r = res as unknown as { success?: boolean; reason?: string };
      if (!r?.success) {
        setError(r?.reason === 'taken' || r?.reason === 'interviewer_conflict'
          ? t('interview.errTaken', 'That time was just taken — please pick another.')
          : t('interview.errClosed', 'This invitation can no longer be booked.'));
        await qc.invalidateQueries({ queryKey: ['interview_invitation', token] });
        return;
      }
      // The confirmation mail — the recipient comes from the application, once.
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comms-send?kind=interview_booked`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ token, public_url: window.location.origin }),
        });
      } catch (mailErr) {
        logger.error('[interview] confirmation mail failed', mailErr);
      }
      await qc.invalidateQueries({ queryKey: ['interview_invitation', token] });
    } catch (e) {
      logger.error('[interview] booking failed', e);
      setError(t('interview.errGeneric', 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const shell = (body: React.ReactNode) => (
    <>
      <Helmet><title>{t('interview.metaTitle', 'Book your interview')}</title><meta name="robots" content="noindex" /></Helmet>
      <PublicNavigation />
      <main className="pt-[var(--overlay-header-offset,0px)] min-h-screen bg-background">
        <div className="container mx-auto max-w-2xl px-4 py-12">{body}</div>
      </main>
    </>
  );

  if (isLoading) return shell(<Skeleton className="h-72 w-full" />);
  if (!data?.found) return shell(<p className="text-center text-muted-foreground">{t('interview.notFound', 'This invitation link is not valid.')}</p>);

  if (data.status === 'booked' && data.booked) {
    const meet = data.booked.meeting_url ? (data.booked.meeting_url.startsWith('/') ? `${window.location.origin}${data.booked.meeting_url}` : data.booked.meeting_url) : null;
    const title = `${t('interview.icsTitle', 'Interview')}${data.job_title ? ` — ${data.job_title}` : ''}`;
    return shell(
      <Card>
        <CardHeader className="text-center">
          <CalendarCheck className="mx-auto mb-2 h-12 w-12 text-primary" />
          <CardTitle>{t('interview.bookedTitle', 'Your interview is booked')}</CardTitle>
          <CardDescription>
            {when.day(data.booked.start)}, {when.time(data.booked.start)}–{when.time(data.booked.end)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{t('interview.bookedBody', 'We have sent you a confirmation by e-mail. Open the link a few minutes early — we will let you in.')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {meet && <Button asChild><a href={meet}><Video className="mr-2 h-4 w-4" /> {t('interview.join', 'Join the interview')}</a></Button>}
            <Button variant="outline" asChild>
              <a href={icsHref(title, data.booked.start, data.booked.end, meet)} download="interview.ics"><CalendarPlus className="mr-2 h-4 w-4" /> {t('interview.addToCalendar', 'Add to calendar')}</a>
            </Button>
          </div>
        </CardContent>
      </Card>,
    );
  }

  if (data.status !== 'open' || !(data.slots?.length)) {
    return shell(
      <Card>
        <CardHeader>
          <CardTitle>{t('interview.closedTitle', 'No times to book')}</CardTitle>
          <CardDescription>{t('interview.closedBody', 'This invitation has expired or all times are taken. Reply to the e-mail you received and we will find a new time.')}</CardDescription>
        </CardHeader>
      </Card>,
    );
  }

  return shell(
    <Card>
      <CardHeader>
        <CardTitle>
          {t('interview.pickTitle', 'Hi {name}, pick a time for your interview').replace('{name}', data.candidate_first_name ?? '')}
        </CardTitle>
        <CardDescription>
          {data.job_title && <span className="font-medium text-foreground">{data.job_title} · </span>}
          {t('interview.pickBody', '{minutes} minutes on video, in your browser — no account or app needed.').replace('{minutes}', String(data.duration_minutes ?? 45))}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.message && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{data.message}</p>}
        {byDay.map(([day, slots]) => (
          <div key={day} className="space-y-2">
            <h3 className="text-sm font-semibold first-letter:uppercase">{day}</h3>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPicked(s)}
                  className={cn('rounded-md border px-4 py-2 text-sm transition-colors', picked === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}
                >
                  {when.time(s)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button size="lg" className="w-full md:w-auto" disabled={!picked || busy} onClick={() => void book()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('interview.book', 'Book this time')}
        </Button>
      </CardContent>
    </Card>,
  );
}
