import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A WebMeet link is for a salesperson to send and a customer to click — no
 * account, no install, and it has to connect from inside the customer's
 * office. That takes four things this guard keeps in place:
 *
 *   1. TURN. STUN alone fails behind symmetric NAT and most corporate
 *      firewalls. `webmeet-ice` hands the browser short-lived Cloudflare Calls
 *      credentials when the key is configured and falls back to STUN, saying
 *      so, when it is not (optional integration, Law 4).
 *   2. The password is never at rest in clear text and never compared in the
 *      browser: sha256 in the row, checked by the door.
 *   3. A guest reads only what a guest needs from webmeet_rooms.
 *   4. The cap and the host's lock are enforced at join, not printed in a hint.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const door = read('supabase/functions/webmeet-ice/index.ts');
const hook = read('src/hooks/useWebmeet.ts');
const page = read('src/pages/MeetRoomPage.tsx');
const migration = read('supabase/migrations/20261008160000_motet-nar-genom-brandvaggen.sql');

describe('the door: webmeet-ice', () => {
  it('is a registered public function owned by the webmeet module', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.webmeet-ice\]\s*\nverify_jwt = false/);
    const registry = read('src/lib/edge-function-registry.ts');
    expect(registry).toMatch(/'webmeet-ice'/);
    expect(registry).toMatch(/webmeet: \['webmeet-ice'\]/);
  });

  it('hands out Cloudflare TURN credentials when configured and falls back to STUN, saying which', () => {
    expect(door).toMatch(/Deno\.env\.get\('CLOUDFLARE_TURN_KEY_ID'\)/);
    expect(door).toMatch(/Deno\.env\.get\('CLOUDFLARE_TURN_API_TOKEN'\)/);
    expect(door).toMatch(/rtc\.live\.cloudflare\.com\/v1\/turn\/keys\/\$\{keyId\}\/credentials\/generate-ice-servers/);
    expect(door).toMatch(/provider: cf \? 'cloudflare' : 'stun'/);
    expect(door).toMatch(/const STUN_FALLBACK/);
  });

  it('refuses a locked room to anyone but the host, and checks the password against a hash', () => {
    expect(door).toMatch(/if \(room\.is_locked && !isHost\)[\s\S]*room_locked[\s\S]*423/);
    expect(door).toMatch(/password_required/);
    expect(door).toMatch(/\(await sha256Hex\(given\)\) === room\.password/);
    expect(door).not.toMatch(/given === room\.password/);
  });
});

describe('the row', () => {
  it('stores the password as sha256 and never lets a guest read it', () => {
    expect(migration).toMatch(/encode\(digest\(trim\(p_password\), 'sha256'\), 'hex'\)/);
    expect(migration).toMatch(/UPDATE public\.webmeet_rooms\s+SET password = encode\(digest\(password, 'sha256'\), 'hex'\)/);
    expect(migration).toMatch(/REVOKE SELECT ON public\.webmeet_rooms FROM anon;/);
    expect(migration).toMatch(/GRANT SELECT \(id, slug, name, max_participants, is_locked, expires_at, ended_at, created_at\)\s+ON public\.webmeet_rooms TO anon;/);
    expect(page).not.toMatch(/select\([^)]*password/);
  });
});

describe('the join', () => {
  it('asks the door first and uses the ICE servers it got', () => {
    expect(hook).toMatch(/export async function fetchMeetAccess\(/);
    expect(hook).toMatch(/functions\/v1\/webmeet-ice/);
    expect(hook).toMatch(/new RTCPeerConnection\(\{ iceServers: iceServersRef\.current \}\)/);
    expect(page).toMatch(/const knock = await fetchMeetAccess\(room\.slug/);
    expect(page).toMatch(/iceServers: knock\.access\.iceServers/);
  });

  it('enforces the cap before announcing itself', () => {
    expect(hook).toMatch(/if \(present >= opts\.maxParticipants\)[\s\S]*throw new Error\('room_full'\)/);
    expect(page).toMatch(/maxParticipants: knock\.access\.room\.max_participants/);
    expect(page).toMatch(/meet\.full/);
  });

  it('lets the guest see and pick camera and microphone before joining', () => {
    expect(page).toMatch(/enumerateDevices\(\)/);
    expect(page).toMatch(/previewStream: stream/);
    expect(page).toMatch(/swapPreviewDevice\('video'/);
    expect(hook).toMatch(/const switchDevice = useCallback/);
  });

  it('gives the host lock, unlock and end-for-everyone from inside the call', () => {
    expect(page).toMatch(/update\(\{ is_locked: next \}\)/);
    expect(page).toMatch(/rpc\('end_webmeet_room'/);
    expect(page).toMatch(/access\?\.room\.is_host/);
  });

  it('speaks through ui_text, not hardcoded English', () => {
    expect(page).toMatch(/const t = useUiText\(\);/);
    for (const key of ['meet.join', 'meet.yourName', 'meet.locked', 'meet.full', 'meet.passwordRequired']) {
      expect(page, key).toContain(`t('${key}'`);
    }
  });
});

describe('the integration card', () => {
  it('Cloudflare Calls is optional and visible: a card under Integrations and a banner where rooms are made', () => {
    expect(read('supabase/functions/check-secrets/index.ts')).toMatch(/cloudflare_calls: !!\(Deno\.env\.get\('CLOUDFLARE_TURN_KEY_ID'\) && Deno\.env\.get\('CLOUDFLARE_TURN_API_TOKEN'\)\)/);
    const integrations = read('src/hooks/useIntegrations.tsx');
    expect(integrations).toMatch(/cloudflare_calls: \{[\s\S]*name: 'Cloudflare Calls \(TURN\)'[\s\S]*secretName: 'CLOUDFLARE_TURN_API_TOKEN'/);
    const admin = read('src/pages/admin/WebmeetPage.tsx');
    expect(admin).toMatch(/useIsIntegrationActive\('cloudflare_calls'\)/);
    expect(admin).toMatch(/Calls may fail behind strict firewalls/);
  });
});
