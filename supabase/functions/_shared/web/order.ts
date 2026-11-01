/**
 * The web layer's ordering rule — pure, no Deno, no network (unit-tested from
 * src/lib/__tests__). Which providers may answer a capability, in which order.
 *
 * Two capabilities, one order each:
 *   search  a query → results        searxng · firecrawl · jina
 *   read    a URL → the page as text  firecrawl · jina · builtin
 * (`map` — a site's URLs — is firecrawl, then the sitemap walk; it is not
 * ordered by the admin.)
 *
 * Source of truth, newest first:
 *   1. site_settings.web_layer = { search_order: [...], read_order: [...] }
 *      — what the Integrations → Web search & reading card writes;
 *   2. the legacy per-integration `config.priority` (1 = first) — instances
 *      that set priorities before the layer existed keep their order;
 *   3. the defaults below: self-hosted and free first, the keyless built-in
 *      reader last.
 * A provider that is switched off or not configured is skipped. A provider
 * that failed within the cooldown (and has not succeeded since) moves to the
 * back instead of being dropped — the last resort is still tried.
 */

export type WebCapability = 'search' | 'read';
export type WebProviderId = 'searxng' | 'firecrawl' | 'jina' | 'builtin';

export const CAPABLE: Record<WebCapability, WebProviderId[]> = {
  search: ['searxng', 'firecrawl', 'jina'],
  read: ['firecrawl', 'jina', 'builtin'],
};

export const DEFAULT_ORDER: Record<WebCapability, WebProviderId[]> = {
  search: ['searxng', 'firecrawl', 'jina'],
  read: ['firecrawl', 'jina', 'builtin'],
};

export const PROVIDER_LABEL: Record<WebProviderId, string> = {
  searxng: 'SearXNG',
  firecrawl: 'Firecrawl',
  jina: 'Jina',
  builtin: 'Built-in reader',
};

export const COOLDOWN_MS = 5 * 60 * 1000;

export interface ProviderState {
  /** Switched on (absent = on) and has what it needs (a URL, a key, or a keyless path). */
  available: boolean;
  /** Why not, in a sentence — shown in the admin and to an agent. */
  reason?: string;
}

export interface ProviderStatus {
  last_ok_at?: string | null;
  last_error_at?: string | null;
  last_error?: string | null;
}

/** The admin's order for a capability — explicit list, else legacy priorities, else the default. */
export function configuredOrder(
  capability: WebCapability,
  webLayer: { search_order?: unknown; read_order?: unknown } | null | undefined,
  legacyPriority: Partial<Record<WebProviderId, number>>,
): WebProviderId[] {
  const capable = CAPABLE[capability];
  const explicit = (capability === 'search' ? webLayer?.search_order : webLayer?.read_order);
  if (Array.isArray(explicit)) {
    const listed = explicit.filter((p): p is WebProviderId => typeof p === 'string' && capable.includes(p as WebProviderId));
    // Providers the list does not name keep their default relative place at the end.
    return [...new Set([...listed, ...DEFAULT_ORDER[capability].filter((p) => !listed.includes(p))])];
  }
  const hasLegacy = capable.some((p) => Number(legacyPriority[p]) > 0);
  if (!hasLegacy) return [...DEFAULT_ORDER[capability]];
  const rank = (p: WebProviderId) => Number(legacyPriority[p]) || (p === 'builtin' ? 99 : 50 + DEFAULT_ORDER[capability].indexOf(p));
  return [...capable].sort((a, b) => rank(a) - rank(b));
}

/** True when the provider failed recently and has not succeeded since. */
export function coolingDown(status: ProviderStatus | undefined, now: number): boolean {
  if (!status?.last_error_at) return false;
  const err = Date.parse(status.last_error_at);
  if (Number.isNaN(err) || now - err > COOLDOWN_MS) return false;
  const ok = status.last_ok_at ? Date.parse(status.last_ok_at) : NaN;
  return Number.isNaN(ok) || ok < err;
}

/**
 * The chain to try: the configured order, unavailable providers removed, a
 * provider cooling down moved behind the others. `preferred` (an explicit
 * caller choice) is tried alone when it is available.
 */
export function providerChain(input: {
  capability: WebCapability;
  order: WebProviderId[];
  state: Partial<Record<WebProviderId, ProviderState>>;
  status?: Partial<Record<WebProviderId, ProviderStatus>>;
  preferred?: string | null;
  exclude?: WebProviderId[];
  now?: number;
}): WebProviderId[] {
  const now = input.now ?? Date.now();
  const capable = CAPABLE[input.capability];
  const usable = input.order.filter((p) => capable.includes(p) && input.state[p]?.available && !(input.exclude ?? []).includes(p));
  if (input.preferred && input.preferred !== 'auto') {
    const p = (input.preferred.startsWith('jina') ? 'jina' : input.preferred) as WebProviderId;
    if (usable.includes(p)) return [p];
  }
  const fresh = usable.filter((p) => !coolingDown(input.status?.[p], now));
  const cooling = usable.filter((p) => coolingDown(input.status?.[p], now));
  return [...fresh, ...cooling];
}
