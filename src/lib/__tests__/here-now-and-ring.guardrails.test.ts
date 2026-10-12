import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Here now" is WhatsApp's half of ad hoc video: you see a colleague is here,
 * one tap later it rings at their end. These guards keep it that small:
 *
 *   1. Presence is a by-product of having FlowWink open — one Realtime channel
 *      from the admin shell, away after five minutes of silence, nothing stored,
 *      no status to set.
 *   2. A ring makes a WebMeet room, rings over the same channel, and leaves
 *      the link in River when nobody answers in 30 s.
 *   3. A person can hide themselves in their profile; it is the only knob.
 *   4. Only staff see it: it lives in the admin shell, not on a public page.
 */

const read = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8');
const hook = read('src/hooks/useTeamPresence.ts') + read('src/components/admin/TeamPresenceProvider.tsx');
const ui = read('src/components/admin/TeamPresence.tsx');

describe('presence is a by-product, not a feature', () => {
  it('one channel from the admin shell, away after five minutes, nothing written to a table', () => {
    expect(hook).toMatch(/export const PRESENCE_CHANNEL = 'team-presence'/);
    expect(hook).toMatch(/AWAY_AFTER_MS = 5 \* 60 \* 1000/);
    expect(hook).toMatch(/ch\.track\(\{ userId: user\.id, name: myName, avatarUrl: myAvatar, since: Date\.now\(\), away \}\)/);
    expect(hook).not.toMatch(/from\('(presence|team_presence|user_presence)[a-z_]*'\)/);
    expect(read('src/components/admin/AdminLayout.tsx')).toMatch(/<TeamPresenceProvider>[\s\S]*<RingDialog \/>/);
    expect(read('src/components/admin/AdminSidebar.tsx')).toMatch(/<TeamPresence collapsed=\{isCollapsed\} \/>/);
  });

  it('has no status text and no schedule', () => {
    expect(ui).not.toMatch(/do not disturb|busy|status message|set status/i);
  });
});

describe('ring', () => {
  it('makes a room, rings on the channel, and leaves the link in River after 30 s unanswered', () => {
    expect(hook).toMatch(/supabase\.rpc\('create_webmeet_room'/);
    expect(hook).toMatch(/event: 'ring', payload: msg/);
    expect(hook).toMatch(/RING_TIMEOUT_MS = 30 \* 1000/);
    expect(hook).toMatch(/createPost\.mutateAsync\(\{ body: `Called \$\{to\.name\} on video, no answer/);
  });

  it('the callee gets Answer / Decline and a tone; answering opens the room', () => {
    expect(ui).toMatch(/export function RingDialog/);
    expect(ui).toMatch(/is calling/);
    expect(ui).toMatch(/useRingTone\(open\)/);
    expect(hook).toMatch(/if \(accepted\) window\.open\(`\/meet\/\$\{inc\.slug\}`, '_blank', 'noopener'\)/);
  });
});

describe('the one knob', () => {
  it('a person hides themselves in their profile, and the hook honours it', () => {
    const profile = read('src/pages/admin/ProfilePage.tsx');
    expect(profile).toMatch(/Show me under "Here now"/);
    expect(profile).toMatch(/presence_hidden: !showHereNow/);
    expect(hook).toMatch(/const hidden = prefs\.presence_hidden === true;/);
    expect(hook).toMatch(/if \(!user\?\.id \|\| hidden\) return;/);
  });
});
