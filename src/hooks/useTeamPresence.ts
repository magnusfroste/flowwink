import { createContext, useContext } from 'react';

/**
 * Who is here, and ring them.
 *
 * The WhatsApp half of ad hoc video: you see that a colleague is here, one
 * tap later it rings at their end. Presence is a by-product of having FlowWink
 * open — no status to set, nothing stored, nothing remembered. One Realtime
 * channel (`team-presence`) per tab, tracked while the admin shell is mounted;
 * five minutes without input marks you away, closing the tab removes you.
 *
 * A ring is a broadcast on the same channel: the caller makes a WebMeet room
 * and goes in to wait; the callee gets a dialog with Answer / Decline and a
 * tone. No answer in 30 s → the link is left in River, where the team already
 * talks, so "Peter called" survives the moment.
 *
 * Only staff see this (it lives in the admin shell). A person can hide
 * themselves under Profile → "Show me under Here now".
 */

export interface Presence {
  userId: string;
  name: string;
  avatarUrl: string | null;
  since: number;
  away: boolean;
}

export interface IncomingRing {
  from: string;
  fromName: string;
  slug: string;
  at: number;
}

export interface TeamPresenceApi {
  /** Everyone here right now, you included, away ones excluded. */
  here: Presence[];
  /** True while this tab is connected to the channel. */
  connected: boolean;
  /** True when the signed-in person has hidden themselves in their profile. */
  hidden: boolean;
  /** Make a room, ring the person, open the room. Resolves with the room slug. */
  ring: (to: Presence) => Promise<string | null>;
  /** The ring waiting for an answer in this tab, if any. */
  incoming: IncomingRing | null;
  answer: () => void;
  decline: () => void;
  /** Outbound ring state for the caller's own feedback. */
  calling: { to: Presence; slug: string } | null;
}

export const TeamPresenceContext = createContext<TeamPresenceApi | null>(null);

export const PRESENCE_CHANNEL = 'team-presence';
export const AWAY_AFTER_MS = 5 * 60 * 1000;
export const RING_TIMEOUT_MS = 30 * 1000;

export type Broadcast =
  | { kind: 'ring'; to: string; from: string; fromName: string; slug: string; at: number }
  | { kind: 'ring-answer'; to: string; from: string; accepted: boolean; slug: string };

export function useTeamPresence(): TeamPresenceApi {
  const ctx = useContext(TeamPresenceContext);
  if (!ctx) return { here: [], connected: false, hidden: false, ring: async () => null, incoming: null, answer: () => {}, decline: () => {}, calling: null };
  return ctx;
}
