import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Security sweep 2026-10-22, the edge-function half.
 *
 * Three provider webhooks (46elks, Twilio, GatewayAPI) accepted any POST: a
 * forged inbound SMS made the instance reply by SMS at its own cost, and a
 * forged 46elks callback made it fetch an attacker URL carrying the 46elks
 * credentials — which voice-recording then re-sent on every playback.
 * send-webhook fanned out any caller's event to every customer webhook with a
 * valid platform signature. These pin the gates.
 */
const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

describe('the SMS/voice ingests check the shared secret', () => {
  for (const [fn, provider, env] of [['elks46-ingest', 'elks46', 'ELKS46_WEBHOOK_SECRET'], ['twilio-ingest', 'twilio', 'TWILIO_WEBHOOK_SECRET'], ['gatewayapi-ingest', 'gatewayapi', 'GATEWAYAPI_WEBHOOK_SECRET']] as const) {
    it(`${fn} refuses a mismatching secret before reading the payload`, () => {
      const src = read(`supabase/functions/${fn}/index.ts`);
      const ingest = src.slice(src.indexOf('async function handleIngest('));
      const check = ingest.indexOf(`loadWebhookSecret(supabase, "${provider}", Deno.env.get("${env}"))`);
      expect(check, 'secret loaded').toBeGreaterThan(-1);
      expect(ingest).toMatch(/if \(secretCheck === "mismatch"\) return json\(\{ error: "unauthorized" \}, 401\)/);
      // The gate comes before the body is parsed.
      const body = Math.min(...['req.text()', 'req.json()', 'req.formData()'].map((s) => { const i = ingest.indexOf(s); return i < 0 ? Infinity : i; }));
      expect(check).toBeLessThan(body);
    });
  }
  it('the env names are documented so a fresh install knows them', () => {
    const env = read('.env.example');
    for (const n of ['ELKS46_WEBHOOK_SECRET', 'TWILIO_WEBHOOK_SECRET', 'GATEWAYAPI_WEBHOOK_SECRET']) expect(env).toContain(n);
  });
});

describe('the 46elks credentials travel only to api.46elks.com', () => {
  it('the ingest ignores a recording URL on another host and the transcriber refuses it', () => {
    const src = read('supabase/functions/elks46-ingest/index.ts');
    expect(src).toMatch(/const wavParam = rawWav && isElks46ApiUrl\(rawWav\) \? rawWav : null/);
    expect(src).toMatch(/if \(!isElks46ApiUrl\(wavUrl\)\) \{\s*console\.warn/);
  });
  it('voice-recording attaches Basic auth only for api.46elks.com over https', () => {
    const src = read('supabase/functions/voice-recording/index.ts');
    expect(src).toMatch(/recordingHost === 'api\.46elks\.com'/);
    expect(src).toMatch(/u\.protocol !== 'https:'/);
  });
  it('saving the number URLs registers the secret-bearing ingest URL', () => {
    expect(read('supabase/functions/elks46-ingest/index.ts')).toMatch(/elks46-ingest\?secret=\$\{encodeURIComponent\(webhookSecret\)\}/);
  });
});

describe('send-webhook is the platform\'s to call', () => {
  it('requires the service role (or an admin) before reading the event', () => {
    const src = read('supabase/functions/send-webhook/index.ts');
    const gate = src.indexOf("requireServiceOrRole(req, supabase, 'admin')");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(src.indexOf('const { event, data } = await req.json()'));
  });
});
