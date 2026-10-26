// Test double for '@/integrations/supabase/client': Realtime over BroadcastChannel
// (same-origin tabs), the room row served from memory, no session.
const ROOM = { id: 'room-1', slug: 'audio-test', name: 'Audio test', max_participants: 6, is_locked: false, waiting_room: false };

type Handler = { type: string; filter: { event?: string }; cb: (p: unknown) => void };

function makeChannel(name: string, config: { config?: { presence?: { key?: string } } }) {
  const bc = new BroadcastChannel(name);
  const key = config?.config?.presence?.key ?? String(Math.random());
  const handlers: Handler[] = [];
  const others = new Map<string, Record<string, unknown>>();
  let mine: Record<string, unknown> | null = null;
  const fire = (type: string, event: string, payload: unknown) =>
    handlers.filter((h) => h.type === type && h.filter.event === event).forEach((h) => h.cb(payload));
  const joined = (k: string, state: Record<string, unknown>) => {
    const isNew = !others.has(k);
    others.set(k, state);
    if (isNew) fire('presence', 'join', { key: k, newPresences: [state] });
    fire('presence', 'sync', {});
  };
  bc.onmessage = (e) => {
    const m = e.data;
    if (m.kind === 'broadcast') fire('broadcast', m.event, { payload: m.payload });
    if (m.kind === 'hello') { joined(m.key, m.state); if (mine) bc.postMessage({ kind: 'here', key, state: mine }); }
    if (m.kind === 'here') joined(m.key, m.state);
    if (m.kind === 'bye') { const s = others.get(m.key); others.delete(m.key); if (s) fire('presence', 'leave', { leftPresences: [s] }); fire('presence', 'sync', {}); }
  };
  const ch = {
    on(type: string, filter: { event?: string }, cb: (p: unknown) => void) { handlers.push({ type, filter, cb }); return ch; },
    subscribe(cb?: (s: string) => void) { setTimeout(() => cb?.('SUBSCRIBED'), 10); return ch; },
    send(msg: { event: string; payload: unknown }) { bc.postMessage({ kind: 'broadcast', event: msg.event, payload: msg.payload }); return Promise.resolve('ok'); },
    async track(state: Record<string, unknown>) {
      const first = !mine;
      mine = state;
      bc.postMessage({ kind: first ? 'hello' : 'here', key, state });
      fire('presence', 'sync', {});
      return 'ok';
    },
    presenceState() {
      const s: Record<string, unknown[]> = {};
      others.forEach((v, k) => { s[k] = [v]; });
      if (mine) s[key] = [mine];
      return s;
    },
    _close() { bc.postMessage({ kind: 'bye', key }); bc.close(); },
  };
  return ch;
}

const query = (table: string) => {
  const result = table === 'webmeet_rooms' ? { data: ROOM, error: null } : { data: null, error: null };
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order', 'limit', 'in', 'neq', 'update', 'insert', 'gte', 'lte']) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve(result);
  q.single = () => Promise.resolve(result);
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return q;
};

export const supabase = {
  channel: makeChannel,
  removeChannel: async (ch: { _close?: () => void }) => { ch?._close?.(); return 'ok'; },
  from: query,
  rpc: async () => ({ data: null, error: null }),
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { /* noop */ } } } }),
  },
  functions: { invoke: async () => ({ data: null, error: null }) },
};
