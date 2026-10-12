import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The waiting room: the host lets people in one at a time.
 *
 * A clinic sends the next patient a link. They open it on time and must wait
 * until the doctor is done with the one before — not walk into that call. The
 * shape that keeps this honest:
 *
 *   1. The door decides. A guest's knock id is a place in the queue, nothing
 *      more; ICE servers are handed out only once the host has answered yes in
 *      the row (`answer_webmeet_knock`). The lobby channel is the doorbell, not
 *      the lock: the guest asks the door again on the host's broadcast — and
 *      every few seconds regardless.
 *   2. The knock table is nobody's but the door's: no anon or authenticated
 *      grants at all. The host answers through a definer function that checks
 *      who the host is (named host, admin, or any WebMeet staff for a room with
 *      no named host — a booking's room had no host at all before).
 *   3. The guest keeps their camera and knows whether the host has arrived; the
 *      host sees a strip above the stage, not a modal, and finishes first.
 *   4. It is optional per room — at creation, in the call, and for the agent.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const door = read('supabase/functions/webmeet-ice/index.ts');
const migration = read('supabase/migrations/20261012170000_vantrummet-varden-slapper-in-en-i-taget.sql');
const client = read('src/hooks/useWebmeet.ts');
const lobby = read('src/hooks/useMeetLobby.ts');
const page = read('src/pages/MeetRoomPage.tsx');

describe('the door decides', () => {
  it('writes a knock and answers 202 the first time; hands out ICE only for an admitted knock', () => {
    expect(door).toMatch(/if \(room\.waiting_room && !isHost\)/);
    expect(door).toMatch(/\.from\('webmeet_knocks'\)\s*\.insert\(\{ room_id: room\.id, display_name: displayName \}\)/);
    expect(door).toMatch(/return json\(\{ waiting: true, knock_id: knock\.id, room: roomMeta \}, 202\)/);
    expect(door).toMatch(/knock\.admitted === false\) return json\(\{ error: 'knock_denied'/);
    expect(door).toMatch(/const admitted = knock\.admitted === true && knock\.answered_at && Date\.now\(\) - new Date\(knock\.answered_at\)\.getTime\(\) < ADMISSION_TTL_MS/);
    // the ICE servers come after the waiting-room block, never before it
    expect(door.indexOf('if (room.waiting_room && !isHost)')).toBeLessThan(door.indexOf('const cf = await cloudflareIceServers();'));
  });

  it('asks the database who the host is, so the door, the lock policy and the knock function agree', () => {
    // asked as the caller: the service role is host everywhere, so the door never asks with the service key
    expect(door).toMatch(/userClient\.rpc\('is_webmeet_host', \{ p_room_id: room\.id, p_user_id: user\.id \}\)/);
    expect(door).not.toMatch(/sb\.rpc\('is_webmeet_host'/);
    expect(migration).toMatch(/SELECT auth\.role\(\) = 'service_role' OR \(p_user_id IS NOT NULL AND EXISTS \(/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.is_webmeet_host\(p_room_id uuid, p_user_id uuid\)/);
    expect(migration).toMatch(/r\.host_user_id IS NULL AND public\.can_access_module\(p_user_id, 'webmeet'\)/);
    expect(migration).toMatch(/CREATE POLICY "webmeet_rooms_host_update"[\s\S]*USING \(public\.is_webmeet_host\(id, auth\.uid\(\)\)\)/);
  });

  it('the guest asks again with the knock id — on the broadcast and on a timer', () => {
    expect(client).toMatch(/if \(res\.status === 202 && body\?\.waiting && body\?\.knock_id\)/);
    expect(client).toMatch(/\{ ok: 'waiting'; knockId: string; room: MeetRoomInfo \}/);
    expect(lobby).toMatch(/export const LOBBY_POLL_MS = 8 \* 1000/);
    expect(page).toMatch(/window\.setInterval\(\(\) => \{ askAgainRef\.current\(\); \}, LOBBY_POLL_MS\)/);
    expect(page).toMatch(/fetchMeetAccess\(room\.slug, \{ password: needsPassword \? password : undefined, name: name\.trim\(\), knockId \}\)/);
    expect(page).toMatch(/if \(admitted\) askAgainRef\.current\(\);/);
    // the broadcast never joins by itself
    expect(lobby).not.toMatch(/webmeet\.join|getUserMedia|RTCPeerConnection/);
  });
});

describe('the knock table is the door\'s alone', () => {
  it('has no anon or authenticated grants and the host answers through a definer function', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.webmeet_knocks/);
    expect(migration).toMatch(/ALTER TABLE public\.webmeet_knocks ENABLE ROW LEVEL SECURITY;/);
    expect(migration).toMatch(/REVOKE ALL ON public\.webmeet_knocks FROM PUBLIC, anon, authenticated;/);
    expect(migration).not.toMatch(/GRANT [A-Z, ]+ ON public\.webmeet_knocks TO (anon|authenticated)/);
    expect(migration).not.toMatch(/CREATE POLICY "[^"]*" ON public\.webmeet_knocks/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.answer_webmeet_knock\(p_knock_id uuid, p_admit boolean\)/);
    expect(migration).toMatch(/auth\.role\(\) = 'service_role' OR public\.is_webmeet_host\(v_knock\.room_id, auth\.uid\(\)\)/);
    expect(lobby).toMatch(/supabase\.rpc\('answer_webmeet_knock', \{ p_knock_id: knockId, p_admit: admit \}\)/);
    // the browser never touches the table directly
    expect(lobby + page).not.toMatch(/from\('webmeet_knocks'\)/);
  });

  it('replaces create_webmeet_room in one signature (no PostgREST overload)', () => {
    expect(migration).toMatch(/DROP FUNCTION IF EXISTS public\.create_webmeet_room\(text, text, int, int, uuid\);/);
    expect(migration).toMatch(/p_waiting_room boolean DEFAULT false/);
    expect(migration).toMatch(/GRANT SELECT \(waiting_room\) ON public\.webmeet_rooms TO anon;/);
  });
});

describe('what each side sees', () => {
  it('the guest keeps the preview, knows whether the host is here, and can leave the queue', () => {
    expect(page).toMatch(/const \{ hostPresent \} = useLobbyGuest\(room\?\.slug, knockId, displayName/);
    expect(page).toMatch(/meet\.waitingForHost/);
    expect(page).toMatch(/meet\.hostNotHereYet/);
    expect(page).toMatch(/meet\.leaveQueue/);
    expect(page).toMatch(/meet\.askToJoin/);
    expect(lobby).toMatch(/some\(\(e\) => e\.role === 'host'\)/);
  });

  it('the host gets a strip above the stage with Let in / Not now and a chime, never a modal', () => {
    const list = read('src/components/meet/WaitingList.tsx');
    expect(page).toMatch(/<WaitingList waiting=\{lobby\.waiting\} onAdmit=\{lobby\.admit\} onDeny=\{lobby\.deny\}/);
    expect(page).toMatch(/useKnockChime\(lobby\.waiting\.length\)/);
    expect(list).toMatch(/meet\.letIn/);
    expect(list).toMatch(/meet\.notNow/);
    expect(list).not.toMatch(/Dialog/);
  });

  it('is optional per room: at creation, in the call, and for the agent', () => {
    expect(read('src/pages/admin/WebmeetPage.tsx')).toMatch(/p_waiting_room: waitingRoom/);
    expect(page).toMatch(/update\(\{ waiting_room: next \}\)/);
    const mod = read('src/lib/modules/webmeet-module.ts');
    expect(mod).toMatch(/p_waiting_room: \{\s*type: 'boolean'/);
    expect(mod).toMatch(/tables: \['webmeet_rooms', 'webmeet_knocks'\]/);
  });
});
