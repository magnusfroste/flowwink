// webmeet-ice — the door into a WebMeet room, and the ICE servers that get the
// call through the firewall.
//
// A guest with the link calls this once before joining. It answers three
// questions in one round-trip:
//   1. May you come in? The room exists and is live; a locked room admits only
//      its host; a room with a password wants the password (checked against a
//      sha256 hash — the raw password is never at rest).
//   2. How do you reach the others? STUN alone fails behind symmetric NAT and
//      most corporate firewalls — the single most common "WebRTC does not
//      work" in sales calls to a customer's office. With a Cloudflare Calls
//      TURN key configured (CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN,
//      the "Cloudflare Calls" integration) this hands the browser short-lived
//      TURN credentials; without one it falls back to public STUN and says so
//      (`provider: 'stun'`), so an instance without the key still works for the
//      easy cases instead of breaking (Law 4: fail forward, don't gate).
//   3. Who are you here? `is_host` when the caller's JWT is the room's host —
//      the host may lock, unlock and end the room from inside it. A room with
//      no named host (a booking's room) is the staff's: anyone who may use
//      WebMeet is host there (`is_webmeet_host`).
//   4. Is it your turn? A room with a waiting room admits a guest only when
//      the host has said yes: the first call writes a knock (webmeet_knocks)
//      and answers 202 with its id; the guest waits in the lobby channel and
//      asks again with `knock_id` when the host answers (and every few seconds
//      regardless). ICE servers are handed out only for an admitted knock, so
//      a guest cannot let themselves in — the knock id opens nothing on its own.
//
// Public by design (verify_jwt = false): the credential is the room slug plus
// the optional password, exactly as a meeting link works. Nothing here reads
// or writes beyond the one room row.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const STUN_FALLBACK: RTCIceServerLike[] = [
  { urls: ['stun:stun.cloudflare.com:3478'] },
  { urls: ['stun:stun.l.google.com:19302'] },
];

const ADMISSION_TTL_MS = 15 * 60 * 1000;

interface RTCIceServerLike { urls: string | string[]; username?: string; credential?: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Short-lived TURN credentials from Cloudflare Calls, or null when the key is not configured / the call fails. */
async function cloudflareIceServers(): Promise<RTCIceServerLike[] | null> {
  const keyId = Deno.env.get('CLOUDFLARE_TURN_KEY_ID');
  const token = Deno.env.get('CLOUDFLARE_TURN_API_TOKEN');
  if (!keyId || !token) return null;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 2 * 60 * 60 }), // a meeting's worth; the browser fetches fresh ones per join
    });
    if (!res.ok) {
      console.error('[webmeet-ice] Cloudflare TURN credentials failed:', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const body = await res.json() as { iceServers?: RTCIceServerLike | RTCIceServerLike[] };
    const servers = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    return servers.length ? servers : null;
  } catch (e) {
    console.error('[webmeet-ice] Cloudflare TURN credentials threw:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { slug?: string; password?: string; name?: string; knock_id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const slug = String(body.slug ?? '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]{3,64}$/.test(slug)) return json({ error: 'slug is required' }, 400);

  const sb = getServiceClient();
  const { data: room, error } = await sb
    .from('webmeet_rooms')
    .select('id, slug, name, host_user_id, password, max_participants, is_locked, waiting_room, expires_at, ended_at')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error('[webmeet-ice] room lookup failed:', error.message);
    return json({ error: 'Room lookup failed' }, 500);
  }
  if (!room || room.ended_at || (room.expires_at && new Date(room.expires_at) < new Date())) {
    return json({ error: 'room_not_found', message: 'This meeting does not exist or has ended.' }, 404);
  }

  // Who is asking? Only a signed-in person carries a JWT; guests send none.
  // The DB answers "is this the host" so the door, the lock policy and the
  // knock function agree (named host, admin, or any staff for a hostless room).
  let isHost = false;
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      // Asked as the caller, not as the service role: the service role is host everywhere.
      const { data: host, error: hostErr } = await userClient.rpc('is_webmeet_host', { p_room_id: room.id, p_user_id: user.id });
      if (hostErr) console.error('[webmeet-ice] is_webmeet_host failed:', hostErr.message);
      isHost = host === true;
    }
  }

  if (room.is_locked && !isHost) {
    return json({ error: 'room_locked', message: 'The host has locked this meeting.' }, 423);
  }
  if (room.password && !isHost) {
    const given = String(body.password ?? '');
    if (!given) return json({ error: 'password_required', message: 'This meeting needs a password.' }, 401);
    const ok = (await sha256Hex(given)) === room.password;
    if (!ok) return json({ error: 'password_wrong', message: 'That password is not right.' }, 403);
  }

  const roomMeta = { id: room.id, slug: room.slug, name: room.name, max_participants: room.max_participants, is_locked: room.is_locked, waiting_room: room.waiting_room === true, is_host: isHost };

  // The waiting room. The guest's knock id is their place in the queue, nothing
  // more: only the host's answer (answer_webmeet_knock) turns it into a key.
  if (room.waiting_room && !isHost) {
    const knockId = String(body.knock_id ?? '').trim();
    if (knockId) {
      const { data: knock, error: knockReadErr } = await sb
        .from('webmeet_knocks')
        .select('id, admitted, answered_at')
        .eq('id', knockId)
        .eq('room_id', room.id)
        .maybeSingle();
      if (knockReadErr) {
        console.error('[webmeet-ice] knock lookup failed:', knockReadErr.message);
        return json({ error: 'Knock lookup failed' }, 500);
      }
      if (!knock) return json({ error: 'knock_expired', message: 'Your place in the queue was lost. Ask to join again.' }, 410);
      if (knock.admitted === false) return json({ error: 'knock_denied', message: 'The host could not let you in right now.' }, 403);
      // An admission is good for a quarter of an hour — long enough to click, short enough not to be a standing key.
      const admitted = knock.admitted === true && knock.answered_at && Date.now() - new Date(knock.answered_at).getTime() < ADMISSION_TTL_MS;
      if (!admitted) {
        await sb.from('webmeet_knocks').update({ last_seen_at: new Date().toISOString() }).eq('id', knock.id);
        return json({ waiting: true, knock_id: knock.id, room: roomMeta }, 202);
      }
      await sb.from('webmeet_knocks').update({ joined_at: new Date().toISOString() }).eq('id', knock.id);
    } else {
      const displayName = String(body.name ?? '').trim().slice(0, 80) || 'Guest';
      const { data: knock, error: knockErr } = await sb
        .from('webmeet_knocks')
        .insert({ room_id: room.id, display_name: displayName })
        .select('id')
        .single();
      if (knockErr || !knock) {
        console.error('[webmeet-ice] knock insert failed:', knockErr?.message);
        return json({ error: 'Could not join the queue' }, 500);
      }
      // Yesterday's knocks are nobody's business; sweep them while we are here.
      await sb.from('webmeet_knocks').delete().eq('room_id', room.id).lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      return json({ waiting: true, knock_id: knock.id, room: roomMeta }, 202);
    }
  }

  const cf = await cloudflareIceServers();
  const iceServers = cf ? [...STUN_FALLBACK.slice(0, 1), ...cf] : STUN_FALLBACK;
  return json({
    iceServers,
    provider: cf ? 'cloudflare' : 'stun',
    room: roomMeta,
  });
});
