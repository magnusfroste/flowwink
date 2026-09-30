/**
 * MeetingPollRespond — the public face of a meeting poll.
 *
 * One component, two doors: the /poll/:token page and the `meeting-poll` block
 * both render this. It reads the poll through get_meeting_poll_by_token and
 * answers through respond_to_meeting_poll_by_token — the ONLY two things anon
 * may call (the base tables carry no policy for anon at all). The view the RPC
 * returns already withholds e-mail addresses: respondents come back as
 * initials + name, and that is all this component ever sees.
 *
 * "Realtime" for a visitor is a refresh: anon cannot receive postgres_changes on
 * a table it has no policy for (the same reason useChat falls back to
 * broadcast), so the answers re-read every REFRESH_MS while the poll is open,
 * and immediately after the visitor's own answer lands.
 *
 * Law 3: interface only. No AI, no decision — the rule lives in
 * resolve_meeting_poll, and the organizer runs it from the admin panel or
 * FlowPilot does.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, CheckCircle2, Clock, Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useUiText, useUiTextLanguage } from '@/lib/ui-text';
import { cn } from '@/lib/utils';

const REFRESH_MS = 15_000;

export interface MeetingPollSlot {
  id: string;
  starts_at: string;
  duration_min: number;
  position: number;
  count: number;
}

export interface MeetingPollRespondent {
  initials: string;
  name: string;
  slot_ids: string[];
}

export interface MeetingPollPublicView {
  id: string;
  title: string;
  description: string | null;
  organizer_name: string;
  timezone: string;
  policy: 'first_all' | 'first_quorum' | 'max_attendance';
  quorum: number | null;
  status: 'open' | 'resolved' | 'expired' | 'cancelled';
  expires_at: string | null;
  resolved_slot_id: string | null;
  slots: MeetingPollSlot[];
  respondents: MeetingPollRespondent[];
  response_count: number;
}

/** What respond_to_meeting_poll_by_token answers with. */
interface RpcEnvelope {
  success?: boolean;
  error?: string;
  poll?: MeetingPollPublicView;
}

interface MeetingPollRespondProps {
  token: string;
  /** Show the initials of who answered which slot. Default true. */
  showRespondents?: boolean;
  className?: string;
}

/** A slot's time, in the organizer's zone, in the visitor's language. */
function useSlotFormatter(timeZone: string) {
  const { lang, siteLang } = useUiTextLanguage();
  const locale = lang || siteLang || 'en';
  return useMemo(() => {
    const safeZone = (() => {
      try { new Intl.DateTimeFormat('en', { timeZone }); return timeZone; } catch { return 'UTC'; }
    })();
    const day = new Intl.DateTimeFormat(locale, { timeZone: safeZone, weekday: 'short', day: 'numeric', month: 'short' });
    const time = new Intl.DateTimeFormat(locale, { timeZone: safeZone, hour: '2-digit', minute: '2-digit' });
    return {
      zone: safeZone,
      day: (iso: string) => day.format(new Date(iso)),
      range: (iso: string, minutes: number) => {
        const start = new Date(iso);
        const end = new Date(start.getTime() + minutes * 60_000);
        return `${time.format(start)}–${time.format(end)}`;
      },
    };
  }, [locale, timeZone]);
}

export function MeetingPollRespond({ token, showRespondents = true, className }: MeetingPollRespondProps) {
  const t = useUiText();
  const [poll, setPoll] = useState<MeetingPollPublicView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  const load = useCallback(async () => {
    // A share token is a uuid; anything else is a mistyped link, not a query.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      setLoadError('not_found');
      setPoll(null);
      setLoading(false);
      return;
    }
    // get_meeting_poll_by_token returns the public view itself, or NULL when no
    // poll carries that token.
    const { data, error } = await supabase.rpc('get_meeting_poll_by_token' as never, { p_token: token } as never);
    const view = (data ?? null) as MeetingPollPublicView | null;
    if (error) {
      setLoadError(error.message);
      setPoll(null);
    } else if (!view) {
      setLoadError('not_found');
      setPoll(null);
    } else {
      setLoadError(null);
      setPoll(view);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // The visitor's "realtime": re-read while the poll is still taking answers.
  useEffect(() => {
    if (!poll || poll.status !== 'open') return;
    const id = window.setInterval(() => { void load(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [poll, load]);

  const fmt = useSlotFormatter(poll?.timezone ?? 'UTC');

  const toggle = (slotId: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId); else next.add(slotId);
      return next;
    });
  };

  const submit = async () => {
    if (!poll) return;
    setSubmitting(true);
    setSubmitError(null);
    const { data, error } = await supabase.rpc('respond_to_meeting_poll_by_token' as never, {
      p_token: token,
      p_email: email.trim(),
      p_name: name.trim(),
      p_slot_ids: Array.from(picked),
    } as never);
    setSubmitting(false);
    const env = (data ?? {}) as RpcEnvelope;
    if (error || env.success === false) {
      setSubmitError(error?.message || env.error || t('meetingPoll.submitFailed', 'Your answer could not be saved. Try again.'));
      return;
    }
    setAnswered(true);
    void load();
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!poll) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center text-muted-foreground">
          {loadError === 'not_found' || !loadError
            ? t('meetingPoll.notFound', 'This poll does not exist or the link is wrong.')
            : t('meetingPoll.loadFailed', 'The poll could not be loaded right now.')}
        </CardContent>
      </Card>
    );
  }

  const resolvedSlot = poll.resolved_slot_id ? poll.slots.find((s) => s.id === poll.resolved_slot_id) : undefined;
  const closed = poll.status !== 'open';
  const canSubmit = name.trim().length > 0 && /.+@.+\..+/.test(email.trim()) && !submitting;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl">{poll.title}</CardTitle>
            <CardDescription>
              {t('meetingPoll.proposedBy', 'Proposed by')} {poll.organizer_name}
              {' · '}
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmt.zone}</span>
            </CardDescription>
          </div>
          <Badge variant={closed ? 'secondary' : 'default'}>
            {poll.status === 'open' && t('meetingPoll.statusOpen', 'Open')}
            {poll.status === 'resolved' && t('meetingPoll.statusResolved', 'Decided')}
            {poll.status === 'expired' && t('meetingPoll.statusExpired', 'Expired')}
            {poll.status === 'cancelled' && t('meetingPoll.statusCancelled', 'Cancelled')}
          </Badge>
        </div>
        {poll.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{poll.description}</p>}
      </CardHeader>

      <CardContent className="space-y-6">
        {resolvedSlot && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
            <CalendarCheck2 className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">{t('meetingPoll.decidedTitle', 'The meeting is set')}</p>
              <p className="text-sm text-muted-foreground">
                {fmt.day(resolvedSlot.starts_at)} · {fmt.range(resolvedSlot.starts_at, resolvedSlot.duration_min)}
              </p>
            </div>
          </div>
        )}

        <ul className="space-y-2">
          {poll.slots.map((slot) => {
            const isPicked = picked.has(slot.id);
            const isWinner = slot.id === poll.resolved_slot_id;
            const who = showRespondents
              ? poll.respondents.filter((r) => r.slot_ids.includes(slot.id))
              : [];
            return (
              <li key={slot.id}>
                <label
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                    closed ? 'cursor-default' : 'cursor-pointer hover:bg-muted/40',
                    isPicked && !closed && 'border-primary bg-primary/5',
                    isWinner && 'border-primary',
                  )}
                >
                  {!closed && (
                    <Checkbox checked={isPicked} onCheckedChange={() => toggle(slot.id)} aria-label={fmt.day(slot.starts_at)} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{fmt.day(slot.starts_at)}</p>
                    <p className="text-sm text-muted-foreground">{fmt.range(slot.starts_at, slot.duration_min)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {showRespondents && who.length > 0 && (
                      <div className="hidden sm:flex -space-x-1.5">
                        {who.slice(0, 6).map((r, i) => (
                          <span
                            key={`${r.initials}-${i}`}
                            title={r.name}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-background"
                          >
                            {r.initials}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                      <Users className="h-3.5 w-3.5" />{slot.count}
                    </span>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        {closed ? (
          <p className="text-sm text-muted-foreground">
            {poll.status === 'resolved'
              ? t('meetingPoll.closedResolved', 'This poll is decided and no longer takes answers.')
              : t('meetingPoll.closedOther', 'This poll no longer takes answers.')}
          </p>
        ) : answered ? (
          <div className="rounded-lg border p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">{t('meetingPoll.thanks', 'Thanks — your answer is in.')}</p>
              <p className="text-sm text-muted-foreground">
                {t('meetingPoll.changeAnswer', 'Changed your mind? Pick again and send with the same e-mail to replace it.')}
              </p>
              <Button variant="link" className="px-0 h-auto" onClick={() => setAnswered(false)}>
                {t('meetingPoll.editAnswer', 'Edit my answer')}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`mp-name-${poll.id}`}>{t('meetingPoll.nameLabel', 'Your name')}</Label>
                <Input id={`mp-name-${poll.id}`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`mp-email-${poll.id}`}>{t('meetingPoll.emailLabel', 'Your e-mail')}</Label>
                <Input id={`mp-email-${poll.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {picked.size === 0
                ? t('meetingPoll.noneSelectedHint', 'Sending with nothing ticked means "none of these work for me".')
                : t('meetingPoll.emailPrivacy', 'Your e-mail is only used to keep one answer per person. Others see your initials.')}
            </p>
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <Button type="submit" disabled={!canSubmit}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('meetingPoll.submit', 'Send my availability')}
            </Button>
          </form>
        )}

        <p className="text-xs text-muted-foreground">
          {poll.response_count === 1
            ? t('meetingPoll.oneAnswer', '1 person has answered.')
            : `${poll.response_count} ${t('meetingPoll.answersSuffix', 'people have answered.')}`}
          {' '}
          {poll.policy === 'first_all' && t('meetingPoll.ruleFirstAll', 'The earliest time everyone can make wins.')}
          {poll.policy === 'first_quorum' && `${t('meetingPoll.ruleFirstQuorumPrefix', 'The earliest time at least')} ${poll.quorum ?? 1} ${t('meetingPoll.ruleFirstQuorumSuffix', 'people can make wins.')}`}
          {poll.policy === 'max_attendance' && t('meetingPoll.ruleMaxAttendance', 'The time most people can make wins.')}
        </p>
      </CardContent>
    </Card>
  );
}
