import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreateRiverPost } from '@/hooks/useRiver';
import { logger } from '@/lib/logger';
import { TeamPresenceContext, PRESENCE_CHANNEL, AWAY_AFTER_MS, RING_TIMEOUT_MS, type Presence, type IncomingRing, type TeamPresenceApi, type Broadcast } from '@/hooks/useTeamPresence';

/**
 * The one channel per tab. Mounted once in the admin shell; everything the
 * sidebar block and the ring dialog need comes through useTeamPresence().
 * The why lives next to the hook in src/hooks/useTeamPresence.ts.
 */
export function TeamPresenceProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const createPost = useCreateRiverPost();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [here, setHere] = useState<Presence[]>([]);
  const [connected, setConnected] = useState(false);
  const [incoming, setIncoming] = useState<IncomingRing | null>(null);
  const [calling, setCalling] = useState<{ to: Presence; slug: string } | null>(null);
  const awayRef = useRef(false);
  const idleTimer = useRef<number | null>(null);
  const callTimer = useRef<number | null>(null);
  const answeredRef = useRef<Set<string>>(new Set());

  const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
  const hidden = prefs.presence_hidden === true;
  const myName = profile?.full_name || profile?.email || 'Someone';
  const myAvatar = profile?.avatar_url ?? null;

  const trackSelf = useCallback(async (away: boolean) => {
    const ch = channelRef.current;
    if (!ch || !user) return;
    awayRef.current = away;
    try {
      await ch.track({ userId: user.id, name: myName, avatarUrl: myAvatar, since: Date.now(), away });
    } catch (err) {
      logger.warn('[presence] track failed', err);
    }
  }, [user, myName, myAvatar]);

  useEffect(() => {
    if (!user?.id || hidden) return;
    const ch = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: user.id }, broadcast: { self: false } } });
    channelRef.current = ch;

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<Presence>();
      const people: Presence[] = [];
      for (const entries of Object.values(state)) {
        // A person with several tabs is here if any tab is not away.
        const live = entries.find((e) => !e.away) ?? entries[0];
        if (live?.userId) people.push({ ...live, away: entries.every((e) => e.away) });
      }
      setHere(people.filter((p) => !p.away).sort((a, b) => a.name.localeCompare(b.name)));
    });

    ch.on('broadcast', { event: 'ring' }, ({ payload }) => {
      const m = payload as Broadcast;
      if (m.kind !== 'ring' || m.to !== user.id) return;
      setIncoming({ from: m.from, fromName: m.fromName, slug: m.slug, at: m.at });
    });

    ch.on('broadcast', { event: 'ring-answer' }, ({ payload }) => {
      const m = payload as Broadcast;
      if (m.kind !== 'ring-answer' || m.to !== user.id) return;
      answeredRef.current.add(m.slug);
      if (callTimer.current) { window.clearTimeout(callTimer.current); callTimer.current = null; }
      window.dispatchEvent(new CustomEvent('team-presence:answered', { detail: { slug: m.slug, accepted: m.accepted } }));
      setCalling(null);
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setConnected(true);
        await trackSelf(false);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        setConnected(false);
      }
    });

    // Away after five minutes without input; back on the first input.
    const bump = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (awayRef.current) trackSelf(false);
      idleTimer.current = window.setTimeout(() => trackSelf(true), AWAY_AFTER_MS);
    };
    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'pointerdown', 'focus'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    bump();

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      supabase.removeChannel(ch);
      channelRef.current = null;
      setConnected(false);
      setHere([]);
    };
  }, [user?.id, hidden, trackSelf]);

  const ring = useCallback(async (to: Presence): Promise<string | null> => {
    const ch = channelRef.current;
    if (!ch || !user) return null;
    const { data, error } = await supabase.rpc('create_webmeet_room', { p_name: `${myName} & ${to.name}`, p_max_participants: 4 });
    if (error || !data) { logger.error('[presence] could not create a room', error); return null; }
    const slug = (data as { slug: string }).slug;
    const msg: Broadcast = { kind: 'ring', to: to.userId, from: user.id, fromName: myName, slug, at: Date.now() };
    await ch.send({ type: 'broadcast', event: 'ring', payload: msg });
    setCalling({ to, slug });
    // No answer in 30 s: leave the link where the team talks.
    callTimer.current = window.setTimeout(async () => {
      if (answeredRef.current.has(slug)) return;
      setCalling(null);
      try {
        await createPost.mutateAsync({ body: `Called ${to.name} on video, no answer. Join here when you can: ${window.location.origin}/meet/${slug}` });
        window.dispatchEvent(new CustomEvent('team-presence:unanswered', { detail: { slug, name: to.name } }));
      } catch (err) {
        logger.warn('[presence] could not leave the link in River', err);
      }
    }, RING_TIMEOUT_MS);
    return slug;
  }, [user, myName, createPost]);

  const reply = useCallback((accepted: boolean) => {
    const ch = channelRef.current;
    const inc = incoming;
    setIncoming(null);
    if (!ch || !user || !inc) return;
    const msg: Broadcast = { kind: 'ring-answer', to: inc.from, from: user.id, accepted, slug: inc.slug };
    ch.send({ type: 'broadcast', event: 'ring-answer', payload: msg });
    if (accepted) window.open(`/meet/${inc.slug}`, '_blank', 'noopener');
  }, [incoming, user]);

  // An unanswered ring stops ringing on its own.
  useEffect(() => {
    if (!incoming) return;
    const t = window.setTimeout(() => setIncoming(null), RING_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [incoming]);

  const value = useMemo<TeamPresenceApi>(() => ({
    here, connected, hidden, ring, incoming, calling,
    answer: () => reply(true),
    decline: () => reply(false),
  }), [here, connected, hidden, ring, incoming, calling, reply]);

  return <TeamPresenceContext.Provider value={value}>{children}</TeamPresenceContext.Provider>;
}

