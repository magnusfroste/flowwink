/**
 * A public edge function that holds the service key verifies who is calling.
 *
 * 63 of 77 edge functions run with `verify_jwt = false`. That is right for the
 * ones a visitor must reach — chat, get-page, the MCP gateway — but it moves the
 * whole question of WHO is calling into the function body. A body that opens a
 * service-role client (RLS bypassed) and reads nothing about the caller is a
 * function anyone on the internet can run as the platform.
 *
 * Read from source on 2026-09-28, an outside-in review of a customer instance:
 * dunning-processor runs the whole reminder sweep — emails, sequence steps,
 * Stripe — for whoever POSTs. knowledge-indexer takes `full_reindex` from an
 * anonymous body and queues a full re-embedding on the instance's AI key.
 * migrate-page fetches any URL through the instance's paid scraper. Nine such
 * functions, while `_shared/edge-auth.ts` (requireServiceOrRole and friends)
 * sat beside them, adopted by seven others.
 *
 * So this guard scans rather than enumerates (CLAUDE.md, "discover, don't
 * enumerate"): every `verify_jwt = false` function that builds a service client
 * must show one caller-verifying idiom — or be classified, in this file, as
 * either visitor-facing by design (with the reason) or known-ungated (a ratchet
 * that may only shrink). A tenth cannot be born unclassified.
 *
 * Fixing one: adopt `requireServiceOrRole` — AND move its cron registration to
 * the vault service key in the same PR. Fourteen registrations still call edge
 * functions with `Bearer <anon key>`; a gate added without that breaks the cron.
 * automation-dispatcher already reads the key from the vault; copy it.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');

/** `verify_jwt = false` functions in supabase/config.toml. Tolerant block parse; the tree carries no TOML library. */
export function publicFunctions(toml: string): string[] {
  const out: string[] = [];
  for (const block of toml.split(/^\[/m).slice(1)) {
    const m = block.match(/^functions\.([a-z0-9-]+)\]/);
    if (m && /^\s*verify_jwt\s*=\s*false/m.test(block)) out.push(m[1]);
  }
  return out.sort();
}

export const SERVICE_CLIENT = /SUPABASE_SERVICE_ROLE_KEY|getServiceClient\(/;

/** Idioms that verify WHO is calling. Any one is enough. Checking a body field is not one of them. */
export const CALLER_CHECKS: Record<string, RegExp> = {
  'edge-auth helper':  /_shared\/edge-auth/,
  'api_keys lookup':   /from\(['"]api_keys['"]\)|key_hash/,
  'webhook signature': /constructEvent\(|verifySignature|createHmac|\bhmac\b|HMAC|WEBHOOK_SECRET|x-hub-signature|x-telegram-bot-api-secret-token|X-Twilio-Signature|signing_secret/,
  'shared secret':     /CRON_SECRET|INTERNAL_SECRET|x-cron-secret|x-internal-secret|A2A_SECRET|FEDERATION_SECRET/,
  'token possession':  /rpc\(\s*['"][a-z_]*_by_token['"]|\.eq\(\s*['"](accept_token|public_token|sign_token|pay_token|share_token|edit_token|response_token)['"]/,
  'user JWT resolved': /auth\.getUser\(/,
};

/** Block comments and whole-line // comments go first: a TODO that names an idiom is not the idiom. (The trap
 *  the site-url guard met three times in August.) Trailing // after code is kept — stripping it would eat URLs. */
export const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

export type Verdict = 'no service client' | 'verifies caller' | 'ungated';
export function classify(raw: string): { verdict: Verdict; by?: string } {
  const src = strip(raw);
  if (!SERVICE_CLIENT.test(src)) return { verdict: 'no service client' };
  for (const [by, re] of Object.entries(CALLER_CHECKS)) if (re.test(src)) return { verdict: 'verifies caller', by };
  return { verdict: 'ungated' };
}

/**
 * Visitor-facing by nature: there is no caller identity to verify. Their
 * protection is input validation and rate limiting, not auth. The reason is
 * mandatory — an entry without one is how an allowlist grows a hole.
 */
export const PUBLIC_BY_DESIGN: Record<string, string> = {
  'chat-completion':         'the visitor chat: the product\'s public AI endpoint by definition',
  'docs-chat':               'public documentation assistant for anonymous readers',
  'sitemap':                 'crawl surface served to search engines',
  'llms-txt':                'crawl surface served to AI crawlers',
  'track-page-view':         'analytics beacon fired from the public page',
  'track-auth-event':        'auth analytics beacon fired from the public login page',
  'score-visitor-intent':    'visitor-intent scoring beacon fired from the public page',
  'customer-signup':         'public signup form — creates the caller\'s own account',
  'process-job-application': 'public careers form — the applicant has no account yet',
  'create-checkout':         'public storefront checkout — a Stripe session is the outcome, inputs validated server-side',
  'consultant-match':        'public matching form on the consultants block',
};

/**
 * The ratchet. Public, service client, no caller check, and not (yet) shown to
 * be visitor-facing by design. May only shrink: a fix removes the name; a
 * triage that proves "by design" moves it above WITH a reason. Never add.
 */
export const KNOWN_UNGATED: string[] = [
  // The nine read from source on 2026-09-28 — cron-shaped or tool-shaped, service client, no caller check.
  'dunning-processor', 'subscription-billing-cron', 'contract-billing-cron', 'knowledge-indexer',
  'migrate-page', 'flowpilot-heartbeat', 'quote-expiry-reminders', 'event-dispatcher', 'signal-dispatcher',
  // Same class, found by the scan: dispatch and rebuild entry points. demo-cycle gates on demo_mode, which is not a caller check.
  'automation-dispatcher', 'demo-cycle',
  // Agent tools on paid keys (scraper, search, vision, PDF) — a caller should be someone.
  'browser-fetch', 'web-scrape', 'web-search', 'extract-pdf-text', 'process-image',
  // Inbound webhooks with no signature or shared secret in the body.
  'signal-ingest', 'voice-ingest', 'voice-recording',
  // Should verify a state/token it does not appear to.
  'gmail-oauth-callback', 'document-share',
];
// 21 on 2026-09-28. Lower it in the PR that gates or classifies one; never raise it.
export const KNOWN_UNGATED_CEILING = 21;

const toml = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
const pub = publicFunctions(toml);
const source = (fn: string) => {
  const p = join(root, 'supabase/functions', fn, 'index.ts');
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

describe('a public edge function that holds the service key verifies its caller', () => {
  it('finds the public functions in config.toml', () => {
    expect(pub.length).toBeGreaterThanOrEqual(60);
    expect(pub).toContain('chat-completion');
    expect(pub).toContain('dunning-processor');
  });

  it('every ungated public function is classified — by design with a reason, or known and shrinking', () => {
    const unclassified: string[] = [];
    for (const fn of pub) {
      const src = source(fn);
      if (!src) continue;
      if (classify(src).verdict !== 'ungated') continue;
      if (fn in PUBLIC_BY_DESIGN || KNOWN_UNGATED.includes(fn)) continue;
      unclassified.push(fn);
    }
    expect(unclassified, 'public + service client + no caller check. Gate it with requireServiceOrRole (and move its cron to the vault key), or classify it in this file').toEqual([]);
  });

  it('the known-ungated list only shrinks, and names only what is still ungated', () => {
    expect(KNOWN_UNGATED.length).toBeLessThanOrEqual(KNOWN_UNGATED_CEILING);
    const fixed: string[] = [];
    const gone: string[] = [];
    for (const fn of KNOWN_UNGATED) {
      const src = source(fn);
      if (!src || !pub.includes(fn)) { gone.push(fn); continue; }
      const c = classify(src);
      if (c.verdict !== 'ungated') fixed.push(`${fn} (${c.verdict}${c.by ? ': ' + c.by : ''})`);
    }
    expect(fixed, 'now verifies its caller — remove from KNOWN_UNGATED and lower the ceiling').toEqual([]);
    expect(gone, 'no longer a public function — remove from KNOWN_UNGATED').toEqual([]);
  });

  it('every by-design entry is real, public, ungated, and carries a reason', () => {
    const problems: string[] = [];
    for (const [fn, reason] of Object.entries(PUBLIC_BY_DESIGN)) {
      if (!reason || reason.trim().length < 12) problems.push(`${fn}: reason is missing or too thin`);
      const src = source(fn);
      if (!src) { problems.push(`${fn}: no such function`); continue; }
      if (!pub.includes(fn)) problems.push(`${fn}: not verify_jwt=false — entry is stale`);
      if (classify(src).verdict !== 'ungated') problems.push(`${fn}: now verifies its caller — entry is stale, remove it`);
    }
    expect(problems).toEqual([]);
  });

  it('the review findings of 2026-09-28 are on the ratchet until fixed', () => {
    for (const fn of ['dunning-processor', 'subscription-billing-cron', 'contract-billing-cron', 'knowledge-indexer', 'migrate-page', 'flowpilot-heartbeat', 'quote-expiry-reminders', 'event-dispatcher', 'signal-dispatcher']) {
      const src = source(fn);
      if (!src) continue;
      const c = classify(src);
      expect(c.verdict === 'ungated' ? KNOWN_UNGATED.includes(fn) : true, `${fn} is ungated but not on the ratchet`).toBe(true);
    }
  });

  // The classifier is only worth having if each idiom actually flips it.
  it('classifies a service client with no check as ungated', () => {
    expect(classify(`const s = getServiceClient(); await s.from('x').select()`).verdict).toBe('ungated');
  });
  it('recognises each caller-verifying idiom', () => {
    const base = `const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');`;
    expect(classify(base + `import { requireServiceOrRole } from '../_shared/edge-auth.ts'`).by).toBe('edge-auth helper');
    expect(classify(base + `sb.from("api_keys").select("id").eq("key_hash", h)`).by).toBe('api_keys lookup');
    expect(classify(base + `stripe.webhooks.constructEvent(body, sig, secret)`).by).toBe('webhook signature');
    expect(classify(base + `if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET'))`).by).toBe('shared secret');
    expect(classify(base + `.from('quotes').select().eq('accept_token', token)`).by).toBe('token possession');
    expect(classify(base + `const { data } = await sb.auth.getUser(jwt)`).by).toBe('user JWT resolved');
  });
  it('does not mistake building a token link for verifying one', () => {
    // quote-expiry-reminders puts accept_token into an outgoing URL. That is not a check.
    expect(classify(`getServiceClient(); const url = \`\${site}/quote/\${q.accept_token}\``).verdict).toBe('ungated');
  });
  it('a comment that names an idiom is not the idiom', () => {
    expect(classify(`getServiceClient();\n// TODO: adopt _shared/edge-auth and check x-cron-secret\n/* constructEvent later */`).verdict).toBe('ungated');
  });
  it('leaves an anon-client function alone — RLS is its wall', () => {
    expect(classify(`createClient(url, Deno.env.get('SUPABASE_ANON_KEY'))`).verdict).toBe('no service client');
  });
  it('parses verify_jwt=false blocks and ignores the rest', () => {
    const t = `[functions.a]\nverify_jwt = false\n\n[functions.b]\nverify_jwt = true\n\n[functions.c]\nimport_map = "x"\nverify_jwt = false\n\n[db]\nport = 1`;
    expect(publicFunctions(t)).toEqual(['a', 'c']);
  });
});
