/**
 * Outbound URL guard (2026-11-07). An independent researcher reported an
 * unauthenticated SSRF in extract-pdf-text, web-scrape and browser-fetch: the
 * functions fetched a caller-supplied URL unjudged and returned the body, and
 * an edge function runs inside the project's network (SUPABASE_URL is
 * http://kong:8000 on a self-hosted instance — the local edge runtime fetched
 * it with a 200 when probed). The rule now lives in
 * _shared/net/outbound-url.ts and every content-URL sink goes through it.
 *
 * Three things hold:
 *   1. the rule itself: shape, addresses, redirects (run here with an injected
 *      resolver and fetch);
 *   2. every fetch of a caller-URL-shaped identifier in the edge functions is
 *      `fetchPublic(` — a scan over every file, with the configured-endpoint
 *      sinks (an admin's own integration URL) named with a reason, a count
 *      that may only shrink;
 *   3. the five tool functions on paid keys verify their caller (the
 *      public-functions guard enforces it; they left KNOWN_UNGATED).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  assertPublicUrl, fetchPublic, isPrivateIp, urlShapeProblem, UrlNotAllowedError,
} from '../../../supabase/functions/_shared/net/outbound-url';

const root = process.cwd();
const FUNCTIONS = join(root, 'supabase/functions');

const resolver = (table: Record<string, string[]>) => async (h: string) => {
  if (!(h in table)) throw new Error('NXDOMAIN');
  return table[h];
};
const dns = resolver({
  'example.com': ['93.184.216.34'],
  'v6.example.com': ['2606:2800:220:1:248:1893:25c8:1946'],
  'evil.example.com': ['93.184.216.34', '10.0.0.5'],
  'meta.example.com': ['169.254.169.254'],
  'mapped.example.com': ['::ffff:127.0.0.1'],
  'empty.example.com': [],
});

describe('the address rule', () => {
  it.each([
    ['127.0.0.1', true], ['127.255.255.254', true], ['10.1.2.3', true], ['172.16.0.1', true], ['172.31.255.255', true],
    ['172.32.0.1', false], ['192.168.1.1', true], ['169.254.169.254', true], ['100.64.0.1', true], ['100.127.255.255', true],
    ['100.128.0.1', false], ['0.0.0.0', true], ['224.0.0.1', true], ['255.255.255.255', true], ['198.18.0.1', true],
    ['192.0.2.1', true], ['203.0.113.9', true], ['8.8.8.8', false], ['93.184.216.34', false], ['1.1.1.1', false],
    ['::1', true], ['::', true], ['fd12::1', true], ['fc00::1', true], ['fe80::1', true], ['fec0::1', true], ['ff02::1', true],
    ['::ffff:127.0.0.1', true], ['::ffff:10.0.0.1', true], ['::ffff:8.8.8.8', false], ['2001:db8::1', true],
    ['64:ff9b::808:808', true], ['2002:7f00:1::', true], ['2002:808:808::', false],
    ['2606:2800:220:1:248:1893:25c8:1946', false], ['[::1]', true],
  ])('%s private=%s', (ip, priv) => {
    expect(isPrivateIp(ip)).toBe(priv);
  });
});

describe('the shape rule', () => {
  it.each([
    ['ftp://example.com/x', /scheme ftp/],
    ['file:///etc/passwd', /scheme file/],
    ['http://user:pw@example.com/', /credentials/],
    ['http://localhost/', /localhost/],
    ['http://kong:8000/rest/v1/', /single-label/],
    ['http://db/', /single-label/],
    ['http://foo.localhost/', /local name/],
    ['http://printer.local/', /local name/],
    ['http://api.internal/', /local name/],
    ['http://127.0.0.1:54321/', /IPv4 address is not public/],
    ['http://2130706433/', /IPv4 address is not public/],       // the URL parser normalises the decimal form
    ['http://0x7f.0.0.1/', /IPv4 address is not public/],
    ['http://[::1]/', /IPv6 address is not public/],
    ['http://[::ffff:169.254.169.254]/', /IPv6 address is not public/],
    ['http://169.254.169.254/latest/meta-data/', /IPv4 address is not public/],
  ])('%s is refused (%s)', (u, why) => {
    expect(urlShapeProblem(new URL(u))).toMatch(why);
  });

  it.each(['https://example.com/', 'http://example.com:8080/path?q=1', 'https://8.8.8.8/', 'https://[2606:2800:220:1:248:1893:25c8:1946]/'])(
    '%s passes the shape rule', (u) => { expect(urlShapeProblem(new URL(u))).toBeNull(); },
  );
});

describe('assertPublicUrl judges every address a name resolves to', () => {
  it('a public name passes and returns the parsed URL', async () => {
    const u = await assertPublicUrl('https://example.com/a', { resolve: dns, allowPrivate: false });
    expect(u.hostname).toBe('example.com');
  });
  it('a name with ONE private address among public ones is refused', async () => {
    await expect(assertPublicUrl('https://evil.example.com/', { resolve: dns, allowPrivate: false })).rejects.toThrow(/10\.0\.0\.5/);
  });
  it('the metadata address behind a name is refused', async () => {
    await expect(assertPublicUrl('http://meta.example.com/', { resolve: dns, allowPrivate: false })).rejects.toThrow(/169\.254\.169\.254/);
  });
  it('an IPv4-mapped IPv6 answer is refused', async () => {
    await expect(assertPublicUrl('http://mapped.example.com/', { resolve: dns, allowPrivate: false })).rejects.toThrow(/::ffff:127\.0\.0\.1/);
  });
  it('a name that does not resolve is refused — what cannot be judged is not fetched', async () => {
    await expect(assertPublicUrl('http://empty.example.com/', { resolve: dns, allowPrivate: false })).rejects.toThrow(/does not resolve/);
    await expect(assertPublicUrl('http://nx.example.com/', { resolve: dns, allowPrivate: false })).rejects.toThrow(/could not resolve/);
  });
  it('garbage is refused with the code an agent can branch on', async () => {
    const err = await assertPublicUrl('not a url', { resolve: dns, allowPrivate: false }).catch((e) => e);
    expect(err).toBeInstanceOf(UrlNotAllowedError);
    expect(err.code).toBe('URL_NOT_ALLOWED');
  });
  it('allowPrivate lifts the address check but never the scheme or credential check', async () => {
    await expect(assertPublicUrl('http://kong:8000/', { resolve: dns, allowPrivate: true })).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl('http://10.0.0.5/', { resolve: dns, allowPrivate: true })).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl('file:///etc/passwd', { resolve: dns, allowPrivate: true })).rejects.toThrow(/scheme/);
    await expect(assertPublicUrl('http://a:b@example.com/', { resolve: dns, allowPrivate: true })).rejects.toThrow(/credentials/);
  });
});

describe('fetchPublic follows redirects by hand and judges every hop', () => {
  const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });
  const ok = (body: string) => new Response(body, { status: 200 });

  it('a redirect to a private address is refused, the first hop\'s body is not returned', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (u: string | URL | Request) => { seen.push(String(u)); return redirect('http://127.0.0.1:54321/rest/v1/'); }) as typeof fetch;
    await expect(fetchPublic('https://example.com/go', {}, { resolve: dns, allowPrivate: false, fetchImpl })).rejects.toThrow(/not public/);
    expect(seen).toEqual(['https://example.com/go']);
  });
  it('a redirect to a name that resolves privately is refused', async () => {
    const fetchImpl = (async () => redirect('https://evil.example.com/')) as typeof fetch;
    await expect(fetchPublic('https://example.com/go', {}, { resolve: dns, allowPrivate: false, fetchImpl })).rejects.toThrow(/10\.0\.0\.5/);
  });
  it('a public redirect chain is followed, relative Location resolved, 303 turns POST into GET', async () => {
    const calls: Array<{ url: string; method?: string; hasBody: boolean }> = [];
    let n = 0;
    const fetchImpl = (async (u: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(u), method: init?.method, hasBody: init?.body != null });
      n++;
      if (n === 1) return redirect('/second', 303);
      if (n === 2) return redirect('https://v6.example.com/third', 301);
      return ok('done');
    }) as typeof fetch;
    const res = await fetchPublic('https://example.com/first', { method: 'POST', body: 'x' }, { resolve: dns, allowPrivate: false, fetchImpl });
    expect(await res.text()).toBe('done');
    expect(calls.map((c) => c.url)).toEqual(['https://example.com/first', 'https://example.com/second', 'https://v6.example.com/third']);
    expect(calls[0]).toMatchObject({ method: 'POST', hasBody: true });
    expect(calls[1]).toMatchObject({ method: 'GET', hasBody: false });
  });
  it('more than five hops is refused', async () => {
    const fetchImpl = (async () => redirect('https://example.com/again')) as typeof fetch;
    await expect(fetchPublic('https://example.com/loop', {}, { resolve: dns, allowPrivate: false, fetchImpl })).rejects.toThrow(/more than 5 redirects/);
  });
  it('never lets the runtime follow on its own', async () => {
    let init: RequestInit | undefined;
    const fetchImpl = (async (_u: unknown, i?: RequestInit) => { init = i; return ok('x'); }) as typeof fetch;
    await fetchPublic('https://example.com/', { redirect: 'follow' }, { resolve: dns, allowPrivate: false, fetchImpl });
    expect(init?.redirect).toBe('manual');
  });
});

// ─── Every sink ─────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'tests' && e !== 'node_modules') walk(p, out); }
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

/** The identifiers a caller-supplied URL travels under. Shape, not file list. */
const CALLER_URL = /\bfetch\(\s*(url|targetUrl|target\.url|imageUrl|image_url|fileUrl|file_url|sitemapUrl|childUrl|origin|baseUrl|pageUrl|siteUrl|href|src)\b/g;

/**
 * Sinks that fetch an endpoint an ADMIN configured (their own network by
 * design) or a provider's API with a path built here — not a caller's URL.
 * Each with its reason. May only shrink; a new entry needs the same reason.
 */
const CONFIGURED_ENDPOINTS: Record<string, { count: number; why: string }> = {
  'mcp-server/index.ts': { count: 1, why: 'an A2A peer URL an admin registered under Agents' },
  'composio-proxy/index.ts': { count: 1, why: "Composio's API — the url is built from the toolkit, not the caller" },
  'voice-ingest/index.ts': { count: 1, why: "Twilio's recording URL on a signature-verified webhook" },
  'chat-stt/index.ts': { count: 1, why: 'the local STT endpoint an admin configured under Integrations' },
  'integrations-account/index.ts': { count: 1, why: "a provider's account API with the admin's own key" },
  '_shared/handlers/docs-sync.ts': { count: 1, why: 'api.github.com with a path built here' },
  '_shared/handlers/check-integrations.ts': { count: 1, why: "an integration's configured endpoint, probed by the admin" },
  '_shared/execute/core.ts': { count: 2, why: 'the feedback endpoint (an admin dial) and the Unsplash API (literal host)' },
  'agent-execute/index.ts': { count: 2, why: 'the same two sinks, before the pipeline moved (#931)' },
};

describe('every fetch of a caller-supplied URL is judged', () => {
  const files = walk(FUNCTIONS);
  const hits = new Map<string, number>();
  for (const f of files) {
    const src = strip(readFileSync(f, 'utf8'));
    const n = [...src.matchAll(CALLER_URL)].length;
    if (n) hits.set(relative(FUNCTIONS, f), n);
  }

  it('the guard module exists and is what the sinks import', () => {
    const importers = files.filter((f) => /net\/outbound-url\.ts'/.test(readFileSync(f, 'utf8'))).map((f) => relative(FUNCTIONS, f));
    for (const must of ['_shared/web/layer.ts', 'web-scrape/index.ts', 'browser-fetch/index.ts', 'extract-pdf-text/index.ts',
      'process-image/index.ts', '_shared/handlers/fetch-image.ts', '_shared/handlers/parse-resume.ts',
      '_shared/site-scrape.ts', 'migrate-page/index.ts']) {
      expect(importers, `${must} fetches a caller URL and must import the guard`).toContain(must);
    }
    // The executor: agent-execute/index.ts until the pipeline moved to _shared/execute/core.ts (#931).
    expect(importers.some((f) => f === '_shared/execute/core.ts' || f === 'agent-execute/index.ts'), 'the executor imports the guard').toBe(true);
  });

  it('a raw fetch of a caller-URL identifier exists only where an admin configured the endpoint', () => {
    const unexplained = [...hits].filter(([f]) => !(f in CONFIGURED_ENDPOINTS)).map(([f, n]) => `${f} (${n})`);
    expect(unexplained, 'use fetchPublic() from _shared/net/outbound-url.ts, or name the sink in CONFIGURED_ENDPOINTS with its reason').toEqual([]);
    const grew = [...hits].filter(([f, n]) => n > (CONFIGURED_ENDPOINTS[f]?.count ?? 0)).map(([f, n]) => `${f}: ${n} > ${CONFIGURED_ENDPOINTS[f].count}`);
    expect(grew, 'the count may only shrink').toEqual([]);
  });

  it('the tool functions on paid keys verify their caller', () => {
    for (const fn of ['web-scrape', 'browser-fetch', 'extract-pdf-text', 'process-image', 'web-search']) {
      const src = strip(readFileSync(join(FUNCTIONS, fn, 'index.ts'), 'utf8'));
      expect(src, `${fn} must gate on requireServiceOrStaff`).toMatch(/requireServiceOrStaff\(/);
      expect(src).toMatch(/if \(!auth\.authorized\) return unauthorized\(corsHeaders\);/);
    }
  });
});
