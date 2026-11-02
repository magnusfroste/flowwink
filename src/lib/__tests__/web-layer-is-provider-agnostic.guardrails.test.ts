/**
 * FlowWink is search-agnostic (2026-11-01): every server-side web search and
 * page read goes through ONE layer (supabase/functions/_shared/web), in the
 * order the admin sets under Integrations → Web search & reading. Before it,
 * the chat was labelled "Firecrawl", Flowwork switched web search off without
 * FIRECRAWL_API_KEY (a SearXNG instance had none), Flowwork read a field the
 * search function never returns, site migration and brand analysis called
 * Firecrawl's cloud address directly (a self-hosted Firecrawl was impossible),
 * and page reading had a fixed Firecrawl → Jina order nobody could change.
 *
 * The scanner reads EVERY edge file (discover, don't enumerate): a provider
 * endpoint or the Firecrawl key outside the layer is the shape that bit.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { configuredOrder, coolingDown, providerChain, COOLDOWN_MS } from '../../../supabase/functions/_shared/web/order';
import { htmlToMarkdown } from '../../../supabase/functions/_shared/web/html-to-markdown';

const ROOT = 'supabase/functions';
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : walk(p);
    return /\.ts$/.test(f) ? [p] : [];
  });
}
const files = walk(ROOT).filter((f) => !f.startsWith(join(ROOT, '_shared', 'web')));

/** Where a provider's own address may still appear — and why. */
const ALLOWED_ENDPOINT: Record<string, string> = {
  'supabase/functions/_shared/handlers/check-integrations.ts': 'probes the cloud account (credit usage), not a search or read',
  'supabase/functions/integrations-account/index.ts': 'shows the cloud account and credits in the admin',
};
const ALLOWED_KEY_READ = new Set([
  ...Object.keys(ALLOWED_ENDPOINT),
  'supabase/functions/check-secrets/index.ts', // reports which secrets are set
]);

describe('the web layer is the only door to a search or read provider', () => {
  it('no edge file outside _shared/web calls a provider endpoint', () => {
    const offenders = files.filter((f) => !ALLOWED_ENDPOINT[f] && /api\.firecrawl\.dev|\br\.jina\.ai\b|\bs\.jina\.ai\b/.test(readFileSync(f, 'utf8')));
    expect(offenders, 'call webSearch/webRead, or firecrawlEndpoint() for a Firecrawl-only format').toEqual([]);
  });

  it('no edge file outside _shared/web gates a feature on FIRECRAWL_API_KEY', () => {
    const offenders = files.filter((f) => !ALLOWED_KEY_READ.has(f) && /Deno\.env\.get\(\s*['"]FIRECRAWL_API_KEY['"]\s*\)/.test(readFileSync(f, 'utf8')));
    expect(offenders, 'use firecrawlEndpoint(ctx).available or chainFor(ctx, capability)').toEqual([]);
  });

  it('the chat\'s tool is web_search, gated on any search provider, not on Firecrawl', () => {
    const chat = readFileSync(`${ROOT}/chat-completion/index.ts`, 'utf8');
    expect(chat).toMatch(/name: "web_search"/);
    expect(chat).toMatch(/chainFor\(await loadWebContext\(\), 'search'\)\.length > 0/);
    const work = readFileSync(`${ROOT}/workspace-chat/index.ts`, 'utf8');
    expect(work).toMatch(/settings\.allowWebSearch && chainFor\(await loadWebContext\(\), 'search'\)\.length > 0/);
    expect(work).not.toMatch(/json\.data \|\| \[\]/);
  });

  it('web-search and web-scrape are shells over the layer', () => {
    expect(readFileSync(`${ROOT}/web-search/index.ts`, 'utf8')).toMatch(/await webSearch\(/);
    expect(readFileSync(`${ROOT}/web-scrape/index.ts`, 'utf8')).toMatch(/await webRead\(/);
  });
});

describe('the order a capability is tried in', () => {
  const avail = { available: true };
  const off = { available: false, reason: 'off' };

  it('the defaults put self-hosted and free first and the built-in reader last', () => {
    expect(configuredOrder('search', null, {})).toEqual(['searxng', 'firecrawl', 'jina']);
    expect(configuredOrder('read', null, {})).toEqual(['firecrawl', 'jina', 'builtin']);
  });

  it('the admin\'s list wins; providers it leaves out keep their default place at the end', () => {
    expect(configuredOrder('read', { read_order: ['jina'] }, {})).toEqual(['jina', 'firecrawl', 'builtin']);
    expect(configuredOrder('search', { search_order: ['jina', 'searxng', 'nonsense'] }, {})).toEqual(['jina', 'searxng', 'firecrawl']);
  });

  it('a legacy priority still orders an instance that never saved the card', () => {
    expect(configuredOrder('search', null, { firecrawl: 1, searxng: 2, jina: 3 })).toEqual(['firecrawl', 'searxng', 'jina']);
  });

  it('switched-off and unconfigured providers are skipped; a provider that just failed goes to the back', () => {
    const now = Date.parse('2026-11-01T12:00:00Z');
    const chain = providerChain({
      capability: 'search', order: ['searxng', 'firecrawl', 'jina'],
      state: { searxng: avail, firecrawl: off, jina: avail },
      status: { searxng: { last_error_at: new Date(now - 60_000).toISOString() } },
      now,
    });
    expect(chain).toEqual(['jina', 'searxng']);
    expect(coolingDown({ last_error_at: new Date(now - COOLDOWN_MS - 1).toISOString() }, now)).toBe(false);
    expect(coolingDown({ last_error_at: new Date(now - 60_000).toISOString(), last_ok_at: new Date(now - 1000).toISOString() }, now)).toBe(false);
  });

  it('an explicit provider is tried alone when it is available, ignored when it is not', () => {
    const state = { searxng: avail, firecrawl: off, jina: avail };
    expect(providerChain({ capability: 'search', order: ['searxng', 'firecrawl', 'jina'], state, preferred: 'jina-free' })).toEqual(['jina']);
    expect(providerChain({ capability: 'search', order: ['searxng', 'firecrawl', 'jina'], state, preferred: 'firecrawl' })).toEqual(['searxng', 'jina']);
  });
});

describe('the built-in reader', () => {
  it('reads the main content as markdown, without scripts, navigation or footer', () => {
    const html = `<html><head><title>Fibre &amp; More | Acme</title><meta name="description" content="We splice."></head><body>
      <nav><a href="/x">Menu</a></nav><main><h1>Fibre splicing</h1><p>We splice <b>fibre</b> in <a href="/areas">Skåne</a>.</p>
      <ul><li>OTDR</li><li>Blowing</li></ul>${'<p>More text about splicing work done properly.</p>'.repeat(8)}</main>
      <script>track()</script><footer>© Acme</footer></body></html>`;
    const page = htmlToMarkdown(html, 'https://acme.example/');
    expect(page.title).toBe('Fibre & More | Acme');
    expect(page.description).toBe('We splice.');
    expect(page.markdown).toMatch(/^# Fibre splicing/);
    expect(page.markdown).toContain('[Skåne](https://acme.example/areas)');
    expect(page.markdown).toContain('- OTDR');
    expect(page.markdown).not.toMatch(/track\(\)|Menu|© Acme/);
  });
});
