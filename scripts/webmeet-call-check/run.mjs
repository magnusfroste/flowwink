/**
 * The WebMeet call check: two real Chrome tabs call each other through the real
 * /meet page and the real useWebmeet hook, and the script measures sound on the
 * wire (RTP packet counters), not on the switches.
 *
 *   npm run qa:webmeet          (Chrome installed; VIEW_SWEEP_BROWSER=<path> for another)
 *   WEBMEET_SHOTS=<dir> npm run qa:webmeet   also saves what each person sees
 *
 * Only the server is a stand-in: Realtime becomes a BroadcastChannel between the
 * tabs (mock-client.ts), the room row is served from memory, and the door
 * (`webmeet-ice`) answers with no relays — two tabs on one machine need none.
 * Chrome's fake camera and microphone (a beep and a test pattern) are the devices.
 *
 * Found on optic, 2026-10-26: Magnus heard Peter, Peter did not hear Magnus. The
 * old code failed 12 of these checks: a mic turned on mid-call never reached the
 * other side (and an initiator without a mic did not even hear the other person),
 * a screen shared before someone joined carried no sound, "Stop sharing" started a
 * new share, and nothing ever said which way the sound was not getting through.
 */
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const HERE = import.meta.dirname;
const DIST = path.resolve(HERE, 'dist');
execFileSync('npx', ['vite', 'build', '--config', path.join(HERE, 'vite.config.ts'), '--logLevel', 'error'], { cwd: path.resolve(HERE, '../..'), stdio: 'inherit' });
const PORT = 4555;
const ROOM = { id: 'room-1', slug: 'audio-test', name: 'Audio test', max_participants: 6, is_locked: false, waiting_room: false, is_host: false };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/functions/v1/webmeet-ice')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ iceServers: [], provider: 'stun', room: ROOM }));
  }
  let f = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
  res.writeHead(200, { 'content-type': type });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({
  ...(process.env.VIEW_SWEEP_BROWSER ? { executablePath: process.env.VIEW_SWEEP_BROWSER } : { channel: 'chrome' }),
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});

function init(opts) {
  const OrigPC = window.RTCPeerConnection;
  window.__pcs = [];
  window.RTCPeerConnection = class extends OrigPC { constructor(...a) { super(...a); window.__pcs.push(this); } };
  window.__audio = async (type) => {
    let n = 0;
    for (const pc of window.__pcs) {
      if (pc.connectionState === 'closed') continue;
      (await pc.getStats()).forEach((r) => { if (r.type === type && r.kind === 'audio') n += (type === 'inbound-rtp' ? r.packetsReceived : r.packetsSent) || 0; });
    }
    return n;
  };
  if (opts.uuid) crypto.randomUUID = () => opts.uuid;
  const md = navigator.mediaDevices;
  const origGUM = md.getUserMedia.bind(md);
  window.__gum = [];
  md.getUserMedia = async (c) => {
    window.__gum.push(JSON.stringify(c));
    if (opts.noMicAtStart && c.audio && c.video) return origGUM({ ...c, audio: false });
    const s = await origGUM(c);
    if (opts.silentMic && s.getAudioTracks().length) {
      const ctx = new AudioContext();
      const silent = ctx.createMediaStreamDestination().stream.getAudioTracks()[0];
      s.getAudioTracks().forEach((t) => { s.removeTrack(t); t.stop(); });
      s.addTrack(silent);
    }
    return s;
  };
  if (opts.skipAudioSend) {
    const orig = OrigPC.prototype.addTrack;
    OrigPC.prototype.addTrack = function (track, ...rest) { if (track.kind === 'audio') return undefined; return orig.call(this, track, ...rest); };
  }
  window.__gdm = 0;
  md.getDisplayMedia = async () => {
    window.__gdm++;
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const g = c.getContext('2d'); setInterval(() => { g.fillStyle = `hsl(${Date.now() / 10 % 360},60%,50%)`; g.fillRect(0, 0, 320, 180); }, 50);
    return c.captureStream(15);
  };
  if (opts.blockAutoplay) {
    window.__clicked = false;
    document.addEventListener('click', (e) => { if (e.target.closest?.('button')?.textContent?.includes('Click to hear')) window.__clicked = true; }, true);
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.muted && !window.__clicked) return Promise.reject(new DOMException('autoplay blocked', 'NotAllowedError'));
      return origPlay.call(this);
    };
  }
}

// One browser context per scenario: BroadcastChannel (the Realtime stand-in) only
// reaches pages of the same context.
let shared = null;
async function open(name, opts = {}) {
  shared ??= await browser.newContext({ permissions: ['camera', 'microphone'] });
  const ctx = shared;
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => console.log(`  [${name} pageerror]`, e.message));
  await page.addInitScript(init, opts);
  await page.goto(`http://127.0.0.1:${PORT}/meet/audio-test`);
  await page.getByPlaceholder('Your name').fill(name);
  return { page, ctx, name };
}
const join = async (p) => { await p.page.getByRole('button', { name: 'Join now' }).click(); await p.page.getByRole('button', { name: 'Leave' }).waitFor({ timeout: 10000 }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const audioIn = (p) => p.page.evaluate(() => window.__audio('inbound-rtp'));
const text = (p) => p.page.evaluate(() => document.body.innerText);
const results = [];
const SHOTS = process.env.WEBMEET_SHOTS;
const shot = async (p, file) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.page.screenshot({ path: path.join(SHOTS, `${file}.png`) }); };
const check = (label, ok, detail = '') => { results.push({ label, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };
async function grows(p, ms = 2500) { const a = await audioIn(p); await sleep(ms); const b = await audioIn(p); return { ok: b > a, a, b }; }
async function scenario(title, fn) {
  console.log(`\n${title}`);
  try { await fn(); } catch (err) { check(`${title}: ran to the end`, false, String(err.message).split('\n')[0]); }
  await close();
}
const close = async () => { await shared?.close(); shared = null; await sleep(300); };

// S1 — an ordinary call: sound both ways, nothing to warn about.
await scenario('S1 ordinary call', async () => {
  const a = await open('Magnus'); const b = await open('Peter');
  await join(a); await join(b); await sleep(9000);
  const ga = await grows(a), gb = await grows(b);
  check('Magnus hears Peter (packets arrive)', ga.ok, `${ga.a}→${ga.b}`);
  check('Peter hears Magnus (packets arrive)', gb.ok, `${gb.a}→${gb.b}`);
  const tracks = await b.page.evaluate(() => [...document.querySelectorAll('video')].map((v) => v.srcObject ? v.srcObject.getTracks().map((t) => t.kind).sort().join('+') : '-'));
  check('the remote tile carries audio+video in one stream', tracks.includes('audio+video'), tracks.join(' | '));
  const ta = await text(a), tb = await text(b);
  check('no sound warnings when sound flows', !/not getting your sound|No sound is arriving|hear nothing/.test(ta + tb));
});

// S2 — no mic at the preview, turned on in the call. Both roles: initiator and answerer.
for (const [role, uuid] of [['initiator', '00000000-0000-4000-8000-000000000001'], ['answerer', 'ffffffff-0000-4000-8000-000000000001']]) {
  await scenario(`S2 mic turned on mid-call (Magnus is ${role})`, async () => {
  const a = await open('Magnus', { noMicAtStart: true, uuid });
  const b = await open('Peter', { uuid: '88888888-0000-4000-8000-000000000001' });
  await join(a); await join(b); await sleep(4000);
  const before = await grows(b, 2000);
  check(`(${role}) before: Peter gets no sound from Magnus`, !before.ok, `${before.a}→${before.b}`);
  await a.page.getByRole('button', { name: 'Toggle microphone' }).click();
  await sleep(3000);
  const after = await grows(b);
  check(`(${role}) after the mic button: Peter hears Magnus — no rejoin`, after.ok, `${after.a}→${after.b}`);
  const ga = await grows(a);
  check(`(${role}) Magnus still hears Peter`, ga.ok);
  });
}

// S3 — sharing a screen BEFORE the other person arrives.
await scenario('S3 screen shared before Peter joins', async () => {
  const a = await open('Magnus'); const b = await open('Peter');
  await join(a);
  await a.page.getByRole('button', { name: 'Share screen' }).click(); await sleep(500);
  await join(b); await sleep(5000);
  const g = await grows(b);
  check('Peter hears Magnus while the screen is shared', g.ok, `${g.a}→${g.b}`);
  const vids = await b.page.evaluate(() => [...document.querySelectorAll('video')].map((v) => v.srcObject?.getVideoTracks().length ?? 0));
  check('Peter sees the shared screen', vids.some((n) => n > 0));
  await a.page.evaluate(() => window.__pcs.length && document.querySelectorAll('video').length);
  // The browser's own "Stop sharing" bar ends the track: that must stop, not restart, the share.
  await a.page.evaluate(() => { const v = [...document.querySelectorAll('video')][1] ?? document.querySelector('video'); return v; });
  await a.page.evaluate(() => window.__pcs.forEach((pc) => pc.getSenders().forEach((s) => { if (s.track?.kind === 'video' && s.track.label === '') s.track.stop(); })));
  await a.page.evaluate(() => { for (const pc of window.__pcs) for (const s of pc.getSenders()) if (s.track && s.track.kind === 'video') s.track.dispatchEvent(new Event('ended')); });
  await sleep(800);
  const gdm = await a.page.evaluate(() => window.__gdm);
  check('"Stop sharing" ends the share instead of asking for a new one', gdm === 1, `getDisplayMedia calls: ${gdm}`);
  const back = await a.page.evaluate(() => window.__pcs.every((pc) => pc.getTransceivers().filter((t) => t.receiver.track.kind === 'video').every((t) => t.sender.track && t.sender.track.label !== '')));
  check('after "Stop sharing" the camera is back on the line', back);
});

// S4 — a microphone that delivers digital silence.
await scenario('S4 silent microphone', async () => {
  const a = await open('Magnus', { silentMic: true });
  await sleep(6000);
  const t = await text(a);
  check('the preview says it hears nothing from the microphone', /We hear nothing from this microphone/.test(t));
  await shot(a, 's4-preview-silent-mic');
  const b = await open('Peter');
  check('a working microphone gets no such warning', !/We hear nothing/.test(await text(b)));
  await join(a); await sleep(6000);
  check('the warning stays in the call', /We hear nothing from this microphone/.test(await text(a)));
});

// S5 — the browser refuses to autoplay someone's voice.
await scenario('S5 autoplay blocked', async () => {
  const a = await open('Magnus'); const b = await open('Peter', { blockAutoplay: true });
  await join(a); await join(b); await sleep(5000);
  const btn = b.page.getByRole('button', { name: /Click to hear Magnus/ });
  check('Peter is offered "Click to hear Magnus"', await btn.isVisible());
  await shot(b, 's5-peter-click-to-hear');
  const vidPlaying = await b.page.evaluate(() => [...document.querySelectorAll('video')].some((v) => v.srcObject && !v.paused));
  check('the picture still plays meanwhile', vidPlaying);
  await btn.click(); await sleep(500);
  check('one click: the button goes away', !(await btn.isVisible().catch(() => false)));
  const unmuted = await b.page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.srcObject?.getAudioTracks().length).some((v) => !v.muted && !v.paused && v.srcObject.getAudioTracks().length && v !== document.querySelector('.scale-x-\\[-1\\]')));
  check('Magnus\'s tile is unmuted and playing', unmuted);
});

// S6 — Magnus's sound stops leaving mid-call (mic switch still on): the line exists,
// nothing travels on it. Peter's own sound still reaches Magnus.
await scenario('S6 sound does not get through one way', async () => {
  const a = await open('Magnus'); const b = await open('Peter');
  await join(a); await join(b); await sleep(4000);
  await a.page.evaluate(() => window.__pcs.forEach((pc) => pc.getTransceivers().forEach((t) => { if (t.receiver.track.kind === 'audio') t.sender.replaceTrack(null); })));
  await sleep(12000);
  await shot(a, 's6-magnus-view'); await shot(b, 's6-peter-view');
  check('Magnus is told: "Peter is not getting your sound"', /Peter is not getting your sound/.test(await text(a)));
  check('Peter is told: "No sound is arriving from Magnus"', /No sound is arriving from Magnus/.test(await text(b)));
  check('Peter is NOT told his own sound fails', !/Magnus is not getting your sound/.test(await text(b)));
  check('Magnus is NOT told Peter\'s sound fails', !/No sound is arriving from Peter/.test(await text(a)));
});

// Test speaker plays.
await scenario('S7 test speaker', async () => {
  const a = await open('Magnus');
  await a.page.getByTestId('test-speaker').click(); await sleep(300);
  check('"Test speaker" plays (button shows Playing…)', /Playing…/.test(await text(a)));
  check('no failure toast', !/Could not play a test sound/.test(await text(a)));
});

await browser.close(); server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
