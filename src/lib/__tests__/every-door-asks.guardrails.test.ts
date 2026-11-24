import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Every edge function is deployed without the gateway's JWT check
// (--no-verify-jwt), so each one decides for itself who may call it. On
// 2026-11-24 five asked nobody: system-integrity-check disabled skills and
// automations for whoever found the URL, media-optimize read and wrote any
// storage bucket as the service role, score-visitor-intent scored every lead,
// chat-stt sent 25 MB of audio to the speech provider per call with no
// ceiling, and track-auth-event wrote "signed in" for any account into the
// security log. setup-database asked for the service key and never compared
// it, so the first caller on a new instance could make the first admin.
//
// public-functions-verify-their-caller asked the same question, but only of the
// functions config.toml marks verify_jwt = false — and the fleet deploys every
// function with --no-verify-jwt, so four of the six were outside its view.
//
// The guard discovers, it does not enumerate: a function that shows none of
// the shapes of a caller check must be named below with why it is open. A new
// function either asks, or says why it does not.
const root = join(__dirname, '../../..');
const fnDir = join(root, 'supabase/functions');

const ASKS = /requireScheduledCaller|requireServiceOrModule|service_role_key !== ownKey|requireServiceOrStaff|requireServiceOrRole|requireStaff|requireAdmin|auth\.getUser|isServiceRoleCall|publicAiLimit|constructEvent|verifySvix|verifySignature|timingSafe|token_is_plausible|cron_secret_matches|api_key|apiKey|_by_token|by_token|accept_token|share_token|signature/;

/** Open on purpose: what a visitor reads, or a key in the link that a database function judges. */
const OPEN_BY_DESIGN: Record<string, string> = {
  'blog-rss': 'the public feed',
  'sitemap': 'the public sitemap',
  'llms-txt': 'the public llms.txt',
  'get-page': 'serves published pages',
  'track-page-view': 'anonymous page views (insert only)',
  'consultant-match': 'public matcher, rate-limited (publicAiLimit is in a helper call)',
  'contract-sign': 'the signing link carries the contract token',
  'quote-sign': 'the quote link carries the accept token',
  'quote-pay': 'the quote link carries the accept token',
  'document-share': 'the share link carries its token',
  'document-sign-request': 'the signing link carries its token',
  'create-checkout': 'a visitor buys; prices are read server-side',
  'create-invoice-payment': 'the invoice link carries its token',
  'customer-signup': 'self sign-up, gated on customer_portal.allowSelfSignup',
  'process-job-application': 'a public job application form',
};

function sourceOf(name: string): string {
  const dir = join(fnDir, name);
  return readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
}

describe('every edge function asks who is calling', () => {
  const fns = readdirSync(fnDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && existsSync(join(fnDir, e.name, 'index.ts')))
    .map((e) => e.name);

  it('a function that asks nobody is open on purpose, and says why', () => {
    const silent = fns.filter((n) => !ASKS.test(sourceOf(n)) && !OPEN_BY_DESIGN[n]);
    expect(silent, 'ask who is calling (requireScheduledCaller, a token, a signature, publicAiLimit) or add it to OPEN_BY_DESIGN with why').toEqual([]);
  });

  it('the five that asked nobody now ask', () => {
    expect(sourceOf('system-integrity-check')).toMatch(/requireScheduledCaller\(req, sb, "system-integrity-check", corsHeaders, \{ role: "admin" \}\)/);
    expect(sourceOf('media-optimize')).toMatch(/requireScheduledCaller\(req, supabase, "media-optimize"/);
    expect(sourceOf('media-optimize')).toMatch(/bucket !== "cms-images"/);
    expect(sourceOf('score-visitor-intent')).toMatch(/requireScheduledCaller\(req, supabase, 'score-visitor-intent'/);
    expect(sourceOf('chat-stt')).toMatch(/publicAiLimit\(req, getServiceClient\(\), 'chat-stt'/);
    expect(sourceOf('setup-database')).toMatch(/service_role_key !== ownKey/);
    const track = sourceOf('track-auth-event');
    expect(track).toMatch(/user_id: user\?\.id \?\? null/);
    expect(track).not.toMatch(/user_id: body\.user_id/);
  });

  it('the list of open doors names only functions that exist', () => {
    for (const n of Object.keys(OPEN_BY_DESIGN)) expect(fns, n).toContain(n);
  });
});
