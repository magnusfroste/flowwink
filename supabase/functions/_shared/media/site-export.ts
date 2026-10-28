/**
 * Site export / install — the pure half: the edge budget, the storage fetch
 * that respects it, and the media-URL scan and rewrite the two verbs share.
 *
 * export_site_template (agent-execute) carries a site's knowledge and files
 * into a template body; install_template puts them on another instance. Both
 * live in agent-execute; this module holds what has no database in it, so a
 * vitest suite can run it for real (site-export-carries-knowledge).
 *
 * Rules that came out of review (#797):
 *  - URLs are found and rewritten per string VALUE, never over JSON.stringify
 *    output. There an escaped quote is `\"`, and a URL pattern that admitted
 *    the backslash swallowed the escape, so the rewrite produced invalid JSON
 *    and the install threw after the media was already uploaded.
 *  - One definition of "media URL" (collectMediaUrls) feeds the host count, the
 *    copy and the report — two regexes used to disagree.
 *  - A file is STREAMED against the cap: `download()` + `arrayBuffer()` held a
 *    300 MB video in memory before any size check ran, and the worker died.
 *  - "This instance's host" is more than the runtime URL (self-hosted: kong).
 */

/** Stop fetching here — the Free tier kills the call at 150 s, and the save still has to run. */
export const SITE_EXPORT_TIME_BUDGET_MS = 100_000;
export const SITE_EXPORT_DEFAULT_MAX_FILE_MB = 8;
export const SITE_EXPORT_MAX_FILE_MB = 20;
export const SITE_EXPORT_DEFAULT_MAX_PAYLOAD_MB = 16;
export const SITE_EXPORT_MAX_PAYLOAD_MB = 40;
/** The buckets served by public URL — the only ones a media copy reads from or writes to. */
export const SITE_EXPORT_PUBLIC_BUCKETS = new Set(['cms-images', 'river-media']);
/**
 * The file types a media copy follows out of a page, a post, a wiki page or a
 * setting — the ONE definition of "media URL". It runs over raw string values;
 * backslash, quotes, whitespace, parentheses and angle brackets end a URL.
 */
export const SITE_EXPORT_MEDIA_URL_RE = /https?:\/\/[^"'`\s()<>\\]+\.(?:png|jpe?g|webp|gif|svg|avif|mp4|webm|glb)(?:\?[^"'`\s()<>\\]*)?(?![A-Za-z0-9])/gi;
/** `/storage/v1/object/public/<bucket>/<path>` — the shape a Supabase public object URL has on any host. */
export const SITE_EXPORT_PUBLIC_OBJECT_PATH_RE = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;

/**
 * maxFileBytes caps one file's RAW size. maxPayloadBytes and usedBytes count
 * what the body actually carries — base64, about 4/3 of the raw bytes — so a
 * 40 MB payload cap means at most 40 MB of base64 in the stored row and the
 * response, not ~53 MB (review round 2 of #797).
 */
export interface SiteExportBudget {
  deadline: number;
  maxFileBytes: number;
  maxPayloadBytes: number;
  usedBytes: number;
}

/** The base64 length of `n` raw bytes — what an embedded file costs the payload. */
export const base64Size = (n: number) => Math.ceil(n / 3) * 4;

/** Where storage is read from inside the edge runtime: its own gateway and the service key. */
export interface SiteExportStorage {
  url: string;
  key: string;
}

export type SiteExportFetch =
  | { ok: true; bytes: Uint8Array; base64: string; sha256: string; content_type: string }
  | { ok: false; reason: 'too_large' | 'payload_full' | 'out_of_time' | 'unreachable'; detail: string };

export function siteExportBudget(args: Record<string, unknown>, now = Date.now()): SiteExportBudget {
  const clampMb = (v: unknown, dflt: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : dflt;
  };
  return {
    deadline: now + SITE_EXPORT_TIME_BUDGET_MS,
    maxFileBytes: Math.round(clampMb(args.max_file_mb, SITE_EXPORT_DEFAULT_MAX_FILE_MB, SITE_EXPORT_MAX_FILE_MB) * 1024 * 1024),
    maxPayloadBytes: Math.round(clampMb(args.max_payload_mb, SITE_EXPORT_DEFAULT_MAX_PAYLOAD_MB, SITE_EXPORT_MAX_PAYLOAD_MB) * 1024 * 1024),
    usedBytes: 0,
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const buf = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * One storage object, fetched only if it fits what is left of the budget —
 * and never more of it than fits. The row's declared size is checked first,
 * then the response's Content-Length, then the bytes are streamed with a
 * running count and the read is cancelled the moment the cap is crossed, so a
 * file far over the cap costs at most the cap in memory. The deadline aborts a
 * slow transfer the same way.
 */
export async function fetchStorageObjectWithinBudget(
  store: SiteExportStorage, bucket: string, path: string, declaredSize: number | null, budget: SiteExportBudget,
): Promise<SiteExportFetch> {
  const remainingPayload = budget.maxPayloadBytes - budget.usedBytes;
  const tooLarge = (n: number, partial = false): SiteExportFetch => ({ ok: false, reason: 'too_large', detail: `${partial ? 'more than ' : ''}${mb(n)} is over max_file_mb (${mb(budget.maxFileBytes)})` });
  const payloadFull = (n: number, partial = false): SiteExportFetch => ({ ok: false, reason: 'payload_full', detail: `${partial ? 'more than ' : ''}${mb(n)} (${mb(base64Size(n))} as base64) does not fit the remaining payload (${mb(remainingPayload)} of max_payload_mb left)` });
  /** The largest raw size whose base64 still fits what is left of the payload. */
  const rawThatFits = Math.floor(Math.max(0, remainingPayload) / 4) * 3;
  const msLeft = budget.deadline - Date.now();
  if (msLeft <= 0) {
    return { ok: false, reason: 'out_of_time', detail: 'the export reached its time budget before this file' };
  }
  if (declaredSize != null && declaredSize > budget.maxFileBytes) return tooLarge(declaredSize);
  if (declaredSize != null && declaredSize > rawThatFits) return payloadFull(declaredSize);

  const cap = Math.min(budget.maxFileBytes, rawThatFits);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), msLeft);
  const objectPath = path.split('/').map(encodeURIComponent).join('/');
  try {
    const res = await fetch(`${store.url}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`, {
      headers: { Authorization: `Bearer ${store.key}`, apikey: store.key },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, reason: 'unreachable', detail: `storage could not read ${bucket}/${path} (HTTP ${res.status})` };
    }
    const announced = Number(res.headers.get('content-length'));
    if (Number.isFinite(announced) && announced > 0) {
      if (announced > budget.maxFileBytes) { await res.body.cancel().catch(() => {}); return tooLarge(announced); }
      if (announced > rawThatFits) { await res.body.cancel().catch(() => {}); return payloadFull(announced); }
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        return total > budget.maxFileBytes ? tooLarge(total, true) : payloadFull(total, true);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }
    budget.usedBytes += base64Size(total);
    return {
      ok: true, bytes, base64: bytesToBase64(bytes), sha256: await sha256OfBytes(bytes),
      content_type: res.headers.get('content-type') || 'application/octet-stream',
    };
  } catch (e) {
    if (controller.signal.aborted) {
      return { ok: false, reason: 'out_of_time', detail: 'the transfer was still running when the export reached its time budget' };
    }
    return { ok: false, reason: 'unreachable', detail: `storage could not read ${bucket}/${path} (${e instanceof Error ? e.message : String(e)})` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The hosts this instance's own public URLs are written with, from any mix of
 * URLs and bare hosts (the runtime's SUPABASE_URL, the self-hosted public-URL
 * variables, the caller's `media_hosts`). Empty and malformed values are ignored.
 */
export function ownHostsFrom(values: unknown[]): Set<string> {
  const hosts = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v !== 'string' || !v.trim()) return;
    const s = v.trim();
    try { hosts.add(new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).host.toLowerCase()); } catch { /* not a host */ }
  };
  for (const v of values) {
    if (Array.isArray(v)) v.forEach(add); else add(v);
  }
  return hosts;
}

/**
 * The base this instance's public URLs are written with — the SAME notion on
 * both ends of the export (review round 2 of #797). The export recognises its
 * own URLs by these hosts; the installer WRITES new URLs from the first one.
 * `getPublicUrl()` builds from the runtime's SUPABASE_URL, which on a
 * self-hosted stack is `http://kong:8000`: every rewritten picture on such a
 * target pointed at a host no browser can reach. Order: an explicit value from
 * the caller, then SUPABASE_PUBLIC_URL, API_EXTERNAL_URL, SUPABASE_URL.
 */
export function publicStorageBase(candidates: unknown[]): string {
  for (const v of candidates) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const s = v.trim();
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      return `${u.protocol}//${u.host}`;
    } catch { /* not a URL — next candidate */ }
  }
  return '';
}

/** `<base>/storage/v1/object/public/<bucket>/<path>`, each path segment encoded. */
export function publicObjectUrl(base: string, bucket: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Several URLs can name ONE storage object (`a.png`, `a.png?t=123`). Group
 * them by bucket + path so the object is fetched, hashed and charged to the
 * payload once, and every variant is still rewritten on install.
 */
export function groupUrlsByStorageObject(urls: string[], ownHosts: Set<string>): {
  objects: Array<{ bucket: string; path: string; urls: string[] }>;
  other: Array<{ url: string; host: string | null }>;
} {
  const byKey = new Map<string, { bucket: string; path: string; urls: string[] }>();
  const other: Array<{ url: string; host: string | null }> = [];
  for (const url of urls) {
    const obj = parsePublicStorageUrl(url, ownHosts);
    if (!obj || !obj.own) { other.push({ url, host: obj ? obj.host : null }); continue; }
    const key = `${obj.bucket}/${obj.path}`;
    const hit = byKey.get(key);
    if (hit) hit.urls.push(url); else byKey.set(key, { bucket: obj.bucket, path: obj.path, urls: [url] });
  }
  return { objects: [...byKey.values()], other };
}

/**
 * A public object URL → its bucket and path, plus whether its host is one of
 * this instance's. A URL that is not a storage object at all answers null.
 */
export function parsePublicStorageUrl(url: string, ownHosts: Set<string>): { bucket: string; path: string; host: string; own: boolean } | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(SITE_EXPORT_PUBLIC_OBJECT_PATH_RE);
    if (!m) return null;
    const host = u.host.toLowerCase();
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]), host, own: ownHosts.has(host) };
  } catch {
    return null;
  }
}

/**
 * Apply `fn` to every string VALUE in a JSON-shaped body, returning a new body.
 * The rewrite and the scan both go through here, so a URL is only ever seen
 * unescaped and a replacement can never produce invalid JSON.
 */
export function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = mapStrings(v, fn);
    return out;
  }
  return value;
}

/** Every distinct media URL a body references, in first-seen order. */
export function collectMediaUrls(body: unknown): string[] {
  const seen = new Set<string>();
  mapStrings(body, (s) => {
    // Sentence punctuation after a query string ("…hero.mp4?v=2, then") is prose, not URL.
    for (const m of s.matchAll(SITE_EXPORT_MEDIA_URL_RE)) seen.add(m[0].replace(/[.,;:!]+$/, ''));
    return s;
  });
  return [...seen];
}

/**
 * Rewrite every carried URL to where the installer put the file, string value
 * by string value. Longest URL first, so a URL that is a prefix of another
 * never clobbers it.
 */
export function rewriteUrlsInTemplate<T>(value: T, urlMap: Map<string, string>): T {
  if (!urlMap.size) return value;
  const pairs = [...urlMap.entries()].filter(([from, to]) => from !== to).sort(([x], [y]) => y.length - x.length);
  return mapStrings(value, (s) => {
    let out = s;
    for (const [from, to] of pairs) if (out.includes(from)) out = out.split(from).join(to);
    return out;
  }) as T;
}
