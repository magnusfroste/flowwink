import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WebMeet: the sound gets through, and when it does not, the screen says which way.
 *
 * Found on optic, 2026-10-26: Magnus heard Peter, Peter did not hear Magnus —
 * the picture worked both ways, so it was not the network (sound and picture ride
 * the same connection). Two tabs calling each other (`npm run qa:webmeet`, real
 * page, real WebRTC, sound measured in RTP packets) failed 12 checks on the old code:
 *
 *   1. A kind with no device got no line in the call. Joining without a mic
 *      (blocked at the preview) made the mic button a no-op — and when the one
 *      without a mic was the answerer, the other person never heard them while
 *      they heard the other person: exactly the optic symptom.
 *   2. A connection made while a screen was shared carried the screen and NO mic.
 *   3. The browser's "Stop sharing" bar started a new share (stale closure).
 *   4. Nothing said which way sound was not getting through, nothing noticed a
 *      microphone that delivers silence, a browser that refuses to play a voice,
 *      or a speaker nobody hears — the far end had to say "I can't hear you".
 *
 * These guards pin the shapes; the call check proves the behaviour.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const hook = read('src/hooks/useWebmeet.ts');
const page = read('src/pages/MeetRoomPage.tsx');
const level = read('src/hooks/useAudioLevel.ts');

describe('every connection has a line for sound and for picture', () => {
  it('the microphone is sent even while a screen is shared; a missing device still gets a sender', () => {
    // The old shape: the screen stream INSTEAD of the local stream.
    expect(hook).not.toMatch(/const stream = screenStreamRef\.current \?\? localStreamRef\.current;\s*stream\?\.getTracks\(\)\.forEach/);
    expect(hook).toMatch(/audio: local\.getAudioTracks\(\)\[0\]/);
    expect(hook).toMatch(/video: screenStreamRef\.current\?\.getVideoTracks\(\)\[0\] \?\? local\.getVideoTracks\(\)\[0\]/);
    expect(hook).toMatch(/pc\.addTransceiver\(kind, \{ direction: 'sendrecv', streams: \[local\] \}\)/);
  });

  it('the answerer opens a recvonly line to sendrecv before it answers', () => {
    const offer = hook.slice(hook.indexOf("if (payload.type === 'offer')"));
    const opens = offer.indexOf("tr.direction = 'sendrecv'");
    expect(opens).toBeGreaterThan(-1);
    expect(opens).toBeLessThan(offer.indexOf('pc.createAnswer()'));
  });

  it('senders are found through the transceiver — a sender with no device has track === null', () => {
    expect(hook).toMatch(/function senderFor\(pc: RTCPeerConnection, kind: 'audio' \| 'video'\)/);
    expect(hook).not.toMatch(/getSenders\(\)\.find\(\(s\) => s\.track\?\.kind/);
  });

  it('the mic/camera button fetches a device when there is none, and puts it on every line', () => {
    const toggle = hook.slice(hook.indexOf('const toggleKind = useCallback'), hook.indexOf('const toggleAudio = useCallback'));
    expect(toggle).toMatch(/navigator\.mediaDevices\.getUserMedia/);
    expect(toggle).toMatch(/senderFor\(pc, kind\)\?\.replaceTrack\(track\)/);
    expect(page).toMatch(/onClick=\{\(\) => toggleCallDevice\('audio'\)\}/);
  });

  it('one stream per person, whatever stream ids the other browser used', () => {
    expect(hook).not.toMatch(/const \[remoteStream\] = e\.streams;/);
    expect(hook).toMatch(/tracks\.set\(e\.track\.kind, e\.track\)/);
  });

  it('"Stop sharing" ends the share: decided on the ref, not on a stale state', () => {
    expect(hook).toMatch(/if \(screenStreamRef\.current\) \{ stopScreenShare\(\); return; \}/);
    expect(hook).toMatch(/if \(screenStreamRef\.current === stream\) stopScreenShare\(\);/);
  });
});

describe('when sound does not get through, the screen says which way', () => {
  it('the wire is measured (RTP packets in and out), not the switches', () => {
    expect(hook).toMatch(/r\.type === 'inbound-rtp'\) inPackets \+= r\.packetsReceived/);
    expect(hook).toMatch(/r\.type === 'outbound-rtp'\) outPackets \+= r\.packetsSent/);
    expect(page).toContain("t('meet.theyGetNoSound'");
    expect(page).toContain("t('meet.noSoundFromThem'");
  });

  it('a refused autoplay plays the picture muted and asks for one click', () => {
    expect(page).toMatch(/err\.name !== 'NotAllowedError'/);
    expect(page).toContain("t('meet.turnSoundOn'");
  });

  it('a microphone that delivers digital silence is named — before the call and during it', () => {
    expect(level).toMatch(/export function useMicCheck/);
    // float, not bytes: an 8-bit read rounds a quiet room down to zero
    expect(level).toMatch(/getFloatTimeDomainData/);
    expect(page).toMatch(/useMicCheck\(preview,/);
    expect(page).toMatch(/useMicCheck\(webmeet\.localStream,/);
  });

  it('the speaker can be heard before joining, and chosen', () => {
    expect(read('src/lib/meet-audio.ts')).toMatch(/setSinkId/);
    expect(page).toMatch(/data-testid="test-speaker"/);
    expect(page).toMatch(/applySpeaker\(videoRef\.current, speakerId\)/);
  });
});

describe('the call check stays runnable', () => {
  it('npm run qa:webmeet runs the two-tab call against the real page', () => {
    expect(JSON.parse(read('package.json')).scripts['qa:webmeet']).toBe('node scripts/webmeet-call-check/run.mjs');
    for (const f of ['run.mjs', 'mock-client.ts', 'vite.config.ts', 'main.tsx', 'index.html']) {
      expect(existsSync(join(root, 'scripts/webmeet-call-check', f)), f).toBe(true);
    }
    // the stand-in replaces the Supabase client only — the page and the hook are real
    expect(read('scripts/webmeet-call-check/vite.config.ts')).toMatch(/find: \/\^@\\\/integrations\\\/supabase\\\/client\$\//);
  });
});
