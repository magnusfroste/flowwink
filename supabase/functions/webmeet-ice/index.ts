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
//      the host may lock, unlock and end the room from inside it.
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

  let body: { slug?: string; password?: string } = {};
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const slug = String(body.slug ?? '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]{3,64}$/.test(slug)) return json({ error: 'slug is required' }, 400);

  const sb = getServiceClient();
  const { data: room, error } = await sb
    .from('webmeet_rooms')
    .select('id, slug, name, host_user_id, password, max_participants, is_locked, expires_at, ended_at')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error('[webmeet-ice] room lookup failed:', error.message);
    return json({ error: 'Room lookup failed' }, 500);
  }
  if (!room || room.ended_at || (room.expires_at && new Date(room.expires_at) < new Date())) {
    return json({ error: 'room_not_found', message: 'This meeting does not exist or has ended.' }, 404);
  }

  // Who is asking? Only a signed-in host carries a JWT; guests send none.
  let isHost = false;
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && room.host_user_id) {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    isHost = !!user && user.id === room.host_user_id;
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

  const cf = await cloudflareIceServers();
  const iceServers = cf ? [...STUN_FALLBACK.slice(0, 1), ...cf] : STUN_FALLBACK;
  return json({
    iceServers,
    provider: cf ? 'cloudflare' : 'stun',
    room: { id: room.id, slug: room.slug, name: room.name, max_participants: room.max_participants, is_locked: room.is_locked, is_host: isHost },
  });
});
