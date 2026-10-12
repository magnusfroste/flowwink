/**
 * The lobby outside a WebMeet room with a waiting room on.
 *
 * Two sides of one Realtime channel, `webmeet-lobby:<slug>`:
 *   - a guest stands in it with their knock id and name, and listens for the
 *     host's answer;
 *   - the host stands in it as `host`, sees who is waiting (presence — someone
 *     who closes the tab is gone at once) and answers.
 *
 * The channel is the doorbell, not the lock. The answer that counts is the row
 * `answer_webmeet_knock` writes; the door (`webmeet-ice`) reads it before it
 * hands out anything. The broadcast only tells the guest to ask the door again
 * now instead of on the next poll.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export const lobbyChannelName = (slug: string) => `webmeet-lobby:${slug}`;

/** How often a waiting guest asks the door again, in case the host's broadcast was missed. */
export const LOBBY_POLL_MS = 8 * 1000;

export interface Knocker {
  knockId: string;
  name: string;
  since: number;
}

interface LobbyPresence {
  role: 'guest' | 'host';
  knockId?: string;
  name?: string;
  since?: number;
}

interface LobbyAnswer {
  knock_id?: string;
  admitted?: boolean;
}

/** Guest side: stand in the lobby while `knockId` is set; `onAnswer` fires when the host decides. */
export function useLobbyGuest(slug: string | undefined, knockId: string | null, name: string, onAnswer: (admitted: boolean) => void) {
  const [hostPresent, setHostPresent] = useState(false);
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;

  useEffect(() => {
    if (!slug || !knockId) { setHostPresent(false); return; }
    const ch = supabase.channel(lobbyChannelName(slug), { config: { presence: { key: knockId } } });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<LobbyPresence>();
      setHostPresent(Object.values(state).flat().some((e) => e.role === 'host'));
    });
    ch.on('broadcast', { event: 'answer' }, ({ payload }) => {
      const a = payload as LobbyAnswer;
      if (a?.knock_id === knockId) onAnswerRef.current(a.admitted === true);
    });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') ch.track({ role: 'guest', knockId, name, since: Date.now() } satisfies LobbyPresence);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') logger.warn('[meet] lobby channel', status);
    });
    return () => { supabase.removeChannel(ch); };
  }, [slug, knockId, name]);

  return { hostPresent };
}

/** Host side: who is waiting, and the two answers. Active only while `enabled`. */
export function useLobbyHost(slug: string | undefined, enabled: boolean) {
  const [waiting, setWaiting] = useState<Knocker[]>([]);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!slug || !enabled) { setWaiting([]); return; }
    const key = `host:${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(lobbyChannelName(slug), { config: { presence: { key } } });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<LobbyPresence>();
      const guests = Object.values(state).flat()
        .filter((e) => e.role === 'guest' && e.knockId)
        .map((e) => ({ knockId: e.knockId!, name: (e.name || 'Guest').slice(0, 80), since: Number(e.since) || Date.now() }))
        .sort((a, b) => a.since - b.since);
      setWaiting(guests);
    });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') ch.track({ role: 'host', since: Date.now() } satisfies LobbyPresence);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') logger.warn('[meet] lobby channel', status);
    });
    chRef.current = ch;
    return () => { supabase.removeChannel(ch); chRef.current = null; setWaiting([]); };
  }, [slug, enabled]);

  const answer = useCallback(async (knockId: string, admit: boolean) => {
    const { error } = await supabase.rpc('answer_webmeet_knock', { p_knock_id: knockId, p_admit: admit });
    if (error) throw error;
    chRef.current?.send({ type: 'broadcast', event: 'answer', payload: { knock_id: knockId, admitted: admit } satisfies LobbyAnswer });
  }, []);

  return {
    waiting,
    admit: useCallback((knockId: string) => answer(knockId, true), [answer]),
    deny: useCallback((knockId: string) => answer(knockId, false), [answer]),
  };
}

/** One soft note each time the count goes up — the knock on the door. */
export function useKnockChime(count: number) {
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
          const at = ctx.currentTime;
          g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
          o.start(at); o.stop(at + 0.55);
          o.onended = () => { ctx.close().catch(() => { /* already closed */ }); };
        }
      } catch (err) {
        logger.warn('[meet] chime unavailable', err);
      }
    }
    prev.current = count;
  }, [count]);
}
