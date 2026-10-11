import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WebMeet's edge over Teams is that it is stupidly simple. These guards keep
 * the five things that make a call feel like a call — not like a test page:
 *
 *   1. Alone, the link is the screen. One other person, they fill the stage
 *      and you sit in the corner. Three or more, a grid.
 *   2. You can see your microphone work before you join, and who is speaking
 *      once you are in.
 *   3. A tile that has no video says why ("Connecting…", "Reconnecting…",
 *      "Could not reach …") — a black box is the worst answer.
 *   4. Leaving lands on "You left" with Rejoin, not on a blank page.
 *   5. Messages exist only for the call: same Realtime channel, nothing stored.
 *      Persistent chat lives where the team already talks (FlowWork, River).
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const page = read('src/pages/MeetRoomPage.tsx');
const hook = read('src/hooks/useWebmeet.ts');

describe('the stage fits the number of people', () => {
  it('alone → waiting card with the link; one other → fill + pip; more → grid', () => {
    expect(page).toMatch(/if \(others\.length === 0\)[\s\S]*meet\.waitingTitle/);
    expect(page).toMatch(/else if \(others\.length === 1\)[\s\S]*variant="fill"[\s\S]*self\('pip'\)/);
    expect(page).toMatch(/grid \$\{gridCols\}/);
  });
});

describe('sound you can see', () => {
  it('a mic meter before joining and a speaking ring in the call', () => {
    expect(read('src/hooks/useAudioLevel.ts')).toMatch(/createAnalyser\(\)/);
    expect(page).toMatch(/<MicMeter level=\{micLevel\}/);
    expect(page).toMatch(/level > SPEAKING_LEVEL/);
  });
});

describe('a tile never just stays black', () => {
  it('the hook keeps the connection state per peer instead of dropping the tile on failure', () => {
    expect(hook).toMatch(/upsertParticipant\(remotePeerId, \{ connection: pc\.connectionState \}\)/);
    expect(hook).not.toMatch(/connectionState === 'failed' \|\| pc\.connectionState === 'closed'\) \{\s*removeParticipant/);
    for (const key of ['meet.connectingTo', 'meet.reconnecting', 'meet.couldNotReach']) expect(page).toContain(`t('${key}'`);
  });
});

describe('leaving and coming back', () => {
  it('leave lands on "You left" with Rejoin', () => {
    expect(page).toMatch(/if \(left\) \{[\s\S]*meet\.youLeft[\s\S]*meet\.rejoin/);
    expect(page).toMatch(/onClick=\{leaveCall\}/);
  });
});

describe('messages are for the call only', () => {
  it('ride the call channel, are capped, and are never written anywhere', () => {
    expect(hook).toMatch(/channel\.on\('broadcast', \{ event: 'message' \}/);
    expect(hook).toMatch(/send\(\{ type: 'broadcast', event: 'message'/);
    expect(hook).not.toMatch(/from\('[a-z_]*message[a-z_]*'\)/);
    expect(page).toMatch(/meet\.messagesEphemeral/);
  });
});

describe('start in one click', () => {
  it('the admin page starts a room with defaults, copies the link and goes in', () => {
    const admin = read('src/pages/admin/WebmeetPage.tsx');
    expect(admin).toMatch(/const startNow = async/);
    expect(admin).toMatch(/navigate\(`\/meet\/\$\{slug\}`\)/);
    expect(admin).toMatch(/More options/);
  });

  it('phones can switch between front and back camera', () => {
    expect(hook).toMatch(/const flipCamera = useCallback/);
    expect(page).toMatch(/onClick=\{webmeet\.flipCamera\}/);
  });
});
