/**
 * The web layer — every server-side web search and page read goes through
 * here, so FlowWink is search-agnostic: SearXNG, Firecrawl (cloud or
 * self-hosted), Jina or the built-in reader, in the order the admin set under
 * Integrations → Web search & reading. web-search and web-scrape are thin
 * shells over webSearch/webRead; the chat, Flowwork, site migration and the
 * enrichment handlers reach the web through them or through this module.
 *
 * Every answer says which provider answered and which were tried
 * (`attempts`), and a provider's last success and failure are kept in
 * site_settings.web_provider_status — the admin card and the
 * web_providers_status skill read it. A provider that just failed is tried
 * last for five minutes instead of first (order.ts).
 */
import { getServiceClient } from '../supabase-clients.ts';
import { assertPublicUrl, fetchPublic } from '../net/outbound-url.ts';
import { type ProviderStatus, type WebCapability, type WebProviderId } from './order.ts';
import {
  FIRECRAWL_CLOUD, chainFor, describeWebContext, firecrawlEndpoint, providerStates, searxngUrl,
  type WebContext,
} from './state.ts';

export { FIRECRAWL_CLOUD, chainFor, describeWebContext, firecrawlEndpoint, providerStates, searxngUrl };
export type { WebContext };
import { htmlToMarkdown } from './html-to-markdown.ts';

type Db = ReturnType<typeof getServiceClient>;
// The settings rows are free-form JSON read defensively, field by field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const UA = 'FlowWink/1.0 (+web-layer)';

export interface Attempt { provider: WebProviderId; ok: boolean; ms: number; error?: string }

export async function loadWebContext(db: Db = getServiceClient()): Promise<WebContext> {
  let rows: Array<{ key: string; value: Json }> = [];
  try {
    const { data } = await db.from('site_settings').select('key, value').in('key', ['integrations', 'web_layer', 'web_provider_status']);
    rows = (data ?? []) as typeof rows;
  } catch { /* defaults below */ }
  const get = (k: string) => (rows.find((r) => r.key === k)?.value ?? {}) as Json;
  return {
    integrations: get('integrations'),
    webLayer: get('web_layer'),
    status: get('web_provider_status') as WebContext['status'],
    keys: { firecrawl: Deno.env.get('FIRECRAWL_API_KEY') || undefined, jina: Deno.env.get('JINA_API_KEY') || undefined },
  };
}

/** Best-effort: keep each provider's last success and failure. Writes only when something changed. */
async function recordAttempts(db: Db, ctx: WebContext, attempts: Attempt[]): Promise<void> {
  if (!attempts.length) return;
  const now = new Date().toISOString();
  const next: Json = { ...ctx.status };
  let changed = false;
  for (const a of attempts) {
    const prev = (next[a.provider] ?? {}) as ProviderStatus;
    if (a.ok) {
      const stale = !prev.last_ok_at || Date.now() - Date.parse(prev.last_ok_at) > 10 * 60 * 1000;
      const recovering = !!prev.last_error_at && (!prev.last_ok_at || prev.last_ok_at < prev.last_error_at);
      if (stale || recovering) { next[a.provider] = { ...prev, last_ok_at: now }; changed = true; }
    } else {
      next[a.provider] = { ...prev, last_error_at: now, last_error: (a.error ?? 'failed').slice(0, 300) };
      changed = true;
    }
  }
  if (!changed) return;
  try {
    await db.from('site_settings').upsert({ key: 'web_provider_status', value: next }, { onConflict: 'key' });
    ctx.status = next;
  } catch (e) {
    console.warn('[web-layer] status not recorded:', e instanceof Error ? e.message : e);
  }
}

/**
 * Jina's tries, in order: the free keyless tier first when the admin prefers it
 * (then the key, if any), else the key alone — or keyless when there is none.
 */
function jinaKeys(ctx: WebContext): Array<string | undefined> {
  const preferFree = ctx.integrations?.jina?.config?.preferFreeTier ?? true;
  const key = typeof ctx.keys.jina === 'string' ? ctx.keys.jina : undefined;
  if (preferFree) return key ? [undefined, key] : [undefined];
  return [key];
}

// ── search ──────────────────────────────────────────────────────────────────
export interface SearchResult { title: string; url: string; description: string; content?: string }

async function searchWith(ctx: WebContext, p: WebProviderId, q: { query: string; limit: number; lang?: string; country?: string }): Promise<{ results: SearchResult[]; variant: string }> {
  if (p === 'searxng') {
    const params = new URLSearchParams({ q: q.query, format: 'json' });
    if (q.lang) params.set('language', q.lang);
    const res = await fetch(`${searxngUrl(ctx)}/search?${params}`, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`SearXNG ${res.status}`);
    const data = await res.json();
    return { variant: 'searxng', results: (data.results ?? []).slice(0, q.limit).map((r: Json) => ({ title: r.title ?? '', url: r.url ?? '', description: r.content ?? r.snippet ?? '' })) };
  }
  if (p === 'firecrawl') {
    const fc = firecrawlEndpoint(ctx);
    const res = await fetch(`${fc.baseUrl}/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(fc.key ? { Authorization: `Bearer ${fc.key}` } : {}) },
      body: JSON.stringify({ query: q.query, limit: q.limit, lang: q.lang || undefined, country: q.country || undefined }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}`);
    const data = await res.json();
    return { variant: 'firecrawl', results: (data.data ?? []).map((r: Json) => ({ title: r.title ?? '', url: r.url ?? '', description: r.description ?? '', content: r.markdown ?? r.content ?? undefined })) };
  }
  if (p === 'jina') {
    let lastErr = 'Jina failed';
    for (const key of jinaKeys(ctx)) {
      const res = await fetch(`https://s.jina.ai/${encodeURIComponent(q.query)}`, {
        headers: { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        return { variant: key ? 'jina-api' : 'jina-free', results: (data.data ?? []).slice(0, q.limit).map((r: Json) => ({ title: r.title ?? '', url: r.url ?? '', description: r.description ?? '' })) };
      }
      lastErr = `Jina ${res.status}`;
    }
    throw new Error(lastErr);
  }
  throw new Error(`${p} cannot search`);
}

export async function webSearch(input: { query: string; limit?: number; lang?: string; country?: string; preferred?: string | null }, db: Db = getServiceClient()) {
  const ctx = await loadWebContext(db);
  const chain = chainFor(ctx, 'search', input.preferred);
  const attempts: Attempt[] = [];
  for (const p of chain) {
    const t0 = Date.now();
    try {
      const { results, variant } = await searchWith(ctx, p, { query: input.query, limit: input.limit ?? 5, lang: input.lang, country: input.country });
      if (!results.length) { attempts.push({ provider: p, ok: true, ms: Date.now() - t0, error: 'no results' }); continue; }
      attempts.push({ provider: p, ok: true, ms: Date.now() - t0 });
      await recordAttempts(db, ctx, attempts);
      return { provider: variant, provider_id: p, results, chain, attempts };
    } catch (e) {
      attempts.push({ provider: p, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await recordAttempts(db, ctx, attempts);
  return { provider: 'none', provider_id: null, results: [] as SearchResult[], chain, attempts };
}

// ── read ────────────────────────────────────────────────────────────────────
export interface ReadResult { content: string; metadata: Json; variant: string }

async function readWith(ctx: WebContext, p: WebProviderId, url: string, maxLength: number, formats: string[]): Promise<ReadResult> {
  if (p === 'firecrawl') {
    const fc = firecrawlEndpoint(ctx);
    const res = await fetch(`${fc.baseUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(fc.key ? { Authorization: `Bearer ${fc.key}` } : {}) },
      body: JSON.stringify({ url, formats, onlyMainContent: true }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}`);
    const data = await res.json();
    return { variant: 'firecrawl', content: String(data.data?.markdown ?? data.markdown ?? '').slice(0, maxLength), metadata: data.data?.metadata ?? data.metadata ?? {} };
  }
  if (p === 'jina') {
    let lastErr = 'Jina failed';
    for (const key of jinaKeys(ctx)) {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, signal: AbortSignal.timeout(45000),
      });
      if (res.ok) {
        const data = await res.json();
        return { variant: key ? 'jina-api' : 'jina-free', content: String(data.data?.content ?? '').slice(0, maxLength), metadata: { title: data.data?.title, url: data.data?.url } };
      }
      lastErr = `Jina ${res.status}`;
    }
    throw new Error(lastErr);
  }
  if (p === 'builtin') {
    const res = await fetchPublic(url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    const text = (await res.text()).slice(0, 2_000_000);
    if (!/html/i.test(type)) return { variant: 'builtin', content: text.slice(0, maxLength), metadata: { url: res.url, contentType: type } };
    const page = htmlToMarkdown(text, res.url);
    return { variant: 'builtin', content: page.markdown.slice(0, maxLength), metadata: { title: page.title, description: page.description, url: res.url } };
  }
  throw new Error(`${p} cannot read`);
}

export async function webRead(
  input: { url: string; maxLength?: number; formats?: string[]; preferred?: string | null; exclude?: WebProviderId[] },
  db: Db = getServiceClient(),
) {
  // Judged before any provider sees it: a private or internal address is never
  // read, by the built-in reader or by a provider on our behalf.
  await assertPublicUrl(input.url);
  const ctx = await loadWebContext(db);
  const chain = chainFor(ctx, 'read', input.preferred, input.exclude);
  const attempts: Attempt[] = [];
  for (const p of chain) {
    const t0 = Date.now();
    try {
      const r = await readWith(ctx, p, input.url, input.maxLength ?? 10000, input.formats ?? ['markdown']);
      if (!r.content.trim()) { attempts.push({ provider: p, ok: false, ms: Date.now() - t0, error: 'empty page' }); continue; }
      attempts.push({ provider: p, ok: true, ms: Date.now() - t0 });
      await recordAttempts(db, ctx, attempts);
      return { provider: r.variant, provider_id: p, content: r.content, metadata: r.metadata, chain, attempts };
    } catch (e) {
      attempts.push({ provider: p, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await recordAttempts(db, ctx, attempts);
  return { provider: 'none', provider_id: null, content: '', metadata: {} as Json, chain, attempts };
}

// ── what is in force (the admin card and web_providers_status) ──────────────
export async function describeWebLayer(db: Db = getServiceClient()) {
  return describeWebContext(await loadWebContext(db));
}
