/**
 * Outbound URL guard — the one rule for a fetch of a URL a caller supplied.
 *
 * An edge function runs INSIDE the project's network: on a self-hosted
 * instance SUPABASE_URL is the internal gateway (http://kong:8000), and the
 * runtime reaches the database, storage, auth and every other service by
 * their service names. A fetch of a caller-supplied URL that is not judged
 * first is a server-side request forgery (CWE-918): the caller makes the
 * platform fetch loopback, link-local (the cloud metadata address), private
 * ranges or the internal mesh, and reads the answer back. Reported by an
 * independent researcher 2026-11-07 against web-scrape, browser-fetch and
 * extract-pdf-text; the same shape sat in every other content-URL sink.
 *
 * The rule: http(s) only, no credentials in the URL, a hostname with a dot
 * (no public name is single-label — `kong`, `db`, `localhost` are not), and
 * every address the name resolves to outside the private, loopback,
 * link-local, multicast and reserved ranges (IPv4 and IPv6, mapped forms
 * included). Redirects are followed by hand, each hop judged again, at most
 * five. A failed resolution is a refusal: an address that cannot be judged is
 * not fetched.
 *
 * What it does NOT guard: an endpoint an ADMIN configured as an integration
 * (a webhook URL, an A2A peer, a local STT server, a self-hosted SearXNG) —
 * those are the operator's own network by design and go through plain
 * `fetch`. `OUTBOUND_FETCH_ALLOW_PRIVATE=true` lifts the address check for an
 * intranet deployment that must read internal pages; the shape checks stay.
 *
 * Known residual: the address is judged, then the hostname is fetched — a
 * DNS answer that changes between the two (rebinding) is not caught. The
 * pinned-IP fetch that would close it needs TLS SNI control the runtime's
 * fetch does not expose.
 */

export class UrlNotAllowedError extends Error {
  readonly code = 'URL_NOT_ALLOWED' as const;
  constructor(readonly url: string, readonly reason: string) {
    super(`URL not allowed (${reason}): ${url}`);
    this.name = 'UrlNotAllowedError';
  }
}

/** Resolves a hostname to its addresses (A and AAAA). Injected in tests. */
export type Resolver = (hostname: string) => Promise<string[]>;

export interface GuardOptions {
  resolve?: Resolver;
  /** Lift the address check (shape checks stay). Default: OUTBOUND_FETCH_ALLOW_PRIVATE=true. */
  allowPrivate?: boolean;
}

// ─── Address ranges ─────────────────────────────────────────────────────────

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseIpv4(s: string): [number, number, number, number] | null {
  const m = IPV4.exec(s);
  if (!m) return null;
  const o = m.slice(1).map(Number) as [number, number, number, number];
  return o.every((n) => n >= 0 && n <= 255) ? o : null;
}

/** Private, loopback, link-local, CGNAT, multicast, reserved, documentation — not a public host. */
export function isPrivateIpv4(ip: string): boolean {
  const o = parseIpv4(ip);
  if (!o) return false;
  const [a, b] = o;
  if (a === 0) return true;                       // 0.0.0.0/8  "this network"
  if (a === 10) return true;                      // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 0 && o[2] === 0) return true;   // 192.0.0/24 IETF
  if (a === 192 && b === 0 && o[2] === 2) return true;   // 192.0.2/24 TEST-NET-1
  if (a === 192 && b === 88 && o[2] === 99) return true; // 6to4 relay anycast
  if (a === 192 && b === 168) return true;        // 192.168/16
  if (a === 198 && (b === 18 || b === 19)) return true;  // 198.18/15 benchmarking
  if (a === 198 && b === 51 && o[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && o[2] === 113) return true;  // TEST-NET-3
  if (a >= 224) return true;                      // multicast 224/4, reserved 240/4, broadcast
  return false;
}

/** Expand an IPv6 textual address to eight 16-bit groups; null if malformed. */
export function expandIpv6(raw: string): number[] | null {
  let s = raw.trim().toLowerCase();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  // Embedded IPv4 tail (::ffff:1.2.3.4) → two groups.
  const v4tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (v4tail) {
    const o = parseIpv4(v4tail[1]);
    if (!o) return null;
    s = s.slice(0, -v4tail[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

export function isPrivateIpv6(ip: string): boolean {
  const g = expandIpv6(ip);
  if (!g) return false;
  const allZero = g.every((x) => x === 0);
  if (allZero) return true;                                  // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the IPv4.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    if (g[5] === 0xffff || g[6] !== 0 || g[7] > 1) return isPrivateIpv4(v4);
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true;               // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true;               // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true;               // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true;               // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;       // 2001:db8::/32 documentation
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true;       // 64:ff9b::/96 NAT64 — not judged, refused
  if (g[0] === 0x2002) return isPrivateIpv4(`${g[1] >> 8}.${g[1] & 0xff}.${g[2] >> 8}.${g[2] & 0xff}`); // 6to4 carries an IPv4
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const s = ip.trim().replace(/^\[|\]$/g, '');
  if (parseIpv4(s)) return isPrivateIpv4(s);
  if (s.includes(':')) return isPrivateIpv6(s);
  return false;
}

// ─── The URL's shape ────────────────────────────────────────────────────────

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.arpa', '.home.arpa', '.lan', '.intranet', '.corp'];

/** A reason the URL is refused before any resolution, or null. */
export function urlShapeProblem(url: URL): string | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return `scheme ${url.protocol.replace(':', '')} is not http(s)`;
  if (url.username || url.password) return 'credentials in the URL';
  const host = url.hostname.toLowerCase();
  if (!host) return 'no hostname';
  if (host.startsWith('[') || host.includes(':')) {
    return isPrivateIpv6(host) ? 'IPv6 address is not public' : null;
  }
  if (parseIpv4(host)) return isPrivateIpv4(host) ? 'IPv4 address is not public' : null;
  if (host === 'localhost') return 'localhost';
  if (LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return `${host} is a local name`;
  if (!host.includes('.')) return `${host} is a single-label hostname (an internal service name, not a public host)`;
  if (host.endsWith('.')) return 'trailing dot';
  return null;
}

// ─── Resolution ─────────────────────────────────────────────────────────────

/** The runtime's Deno global, when there is one (the tests run under Node). */
type DenoLike = {
  resolveDns?: (hostname: string, type: 'A' | 'AAAA') => Promise<string[]>;
  env?: { get(key: string): string | undefined };
};
const denoGlobal = (): DenoLike | undefined => (globalThis as { Deno?: DenoLike }).Deno;

/** Deno's resolver: A and AAAA, a missing record type is not an error. */
export const denoResolver: Resolver = async (hostname) => {
  const d = denoGlobal();
  if (!d?.resolveDns) throw new Error('no resolver available');
  const one = async (type: 'A' | 'AAAA'): Promise<string[]> => {
    try { return await d.resolveDns!(hostname, type); }
    catch (e) { if (e instanceof Error && e.name === 'NotFound') return []; throw e; }
  };
  const [a, aaaa] = await Promise.all([one('A'), one('AAAA')]);
  return [...a, ...aaaa];
};

function allowPrivateByEnv(): boolean {
  return denoGlobal()?.env?.get('OUTBOUND_FETCH_ALLOW_PRIVATE') === 'true';
}

/**
 * Judge a caller-supplied URL: shape, then every address it resolves to.
 * Returns the parsed URL; throws UrlNotAllowedError.
 */
export async function assertPublicUrl(raw: string, opts: GuardOptions = {}): Promise<URL> {
  let url: URL;
  try { url = new URL(String(raw).trim()); } catch { throw new UrlNotAllowedError(String(raw), 'not a valid URL'); }
  const shape = urlShapeProblem(url);
  const allowPrivate = opts.allowPrivate ?? allowPrivateByEnv();
  if (shape) {
    const addressOnly = /is not public$/.test(shape) || shape === 'localhost' || /local name$|single-label/.test(shape);
    if (!(allowPrivate && addressOnly)) throw new UrlNotAllowedError(url.href, shape);
  }
  const host = url.hostname.toLowerCase();
  if (parseIpv4(host) || host.includes(':') || allowPrivate) return url;
  const resolve = opts.resolve ?? denoResolver;
  let addrs: string[];
  try { addrs = await resolve(host); }
  catch (e) { throw new UrlNotAllowedError(url.href, `could not resolve ${host}: ${e instanceof Error ? e.message : String(e)}`); }
  if (!addrs.length) throw new UrlNotAllowedError(url.href, `${host} does not resolve`);
  const bad = addrs.find(isPrivateIp);
  if (bad) throw new UrlNotAllowedError(url.href, `${host} resolves to ${bad}, which is not public`);
  return url;
}

export interface FetchPublicOptions extends GuardOptions {
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * fetch() for a caller-supplied URL: judged first, redirects followed by hand
 * with every hop judged again (at most five), the final response returned.
 */
export async function fetchPublic(input: string, init: RequestInit = {}, opts: FetchPublicOptions = {}): Promise<Response> {
  const max = opts.maxRedirects ?? 5;
  const doFetch = opts.fetchImpl ?? fetch;
  let url = await assertPublicUrl(input, opts);
  let method = (init.method ?? 'GET').toUpperCase();
  let body = init.body;
  for (let hop = 0; ; hop++) {
    const res = await doFetch(url.href, { ...init, method, body, redirect: 'manual' });
    if (!REDIRECTS.has(res.status)) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    if (hop >= max) throw new UrlNotAllowedError(url.href, `more than ${max} redirects`);
    await res.body?.cancel().catch(() => {});
    let next: URL;
    try { next = new URL(location, url); } catch { throw new UrlNotAllowedError(location, 'redirect to an invalid URL'); }
    url = await assertPublicUrl(next.href, opts);
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) { method = 'GET'; body = undefined; }
  }
}
