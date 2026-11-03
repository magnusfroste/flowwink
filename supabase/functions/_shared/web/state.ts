/**
 * Which web providers are in use and in what order — the pure half of the
 * web layer (layer.ts does the fetching). Pure on purpose, with no Deno and
 * no client: the edge reads it with the secrets in hand, and the admin's
 * browser reads the SAME rule with what a staff member may see (site_settings
 * and check-secrets' presence booleans). Before this file the browser asked
 * web_providers_status — a platform skill, admin-only — so the Sales
 * Intelligence readiness card answered a salesperson with a 403 (role sweep,
 * 2026-11-02). One rule, two readers.
 */
import {
  CAPABLE, PROVIDER_LABEL, configuredOrder, providerChain,
  type ProviderState, type ProviderStatus, type WebCapability, type WebProviderId,
} from './order.ts';

// The settings rows are free-form JSON read defensively, field by field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

export const FIRECRAWL_CLOUD = 'https://api.firecrawl.dev';

export interface WebContext {
  integrations: Json;
  webLayer: Json;
  status: Partial<Record<WebProviderId, ProviderStatus>>;
  /** The key itself on the edge; `true` where only its presence is known (the browser). */
  keys: { firecrawl?: string | boolean; jina?: string | boolean };
}

/** Firecrawl's address and key — the cloud by default, a self-hosted instance when a base URL is set. */
export function firecrawlEndpoint(ctx: WebContext): { baseUrl: string; key?: string; selfHosted: boolean; available: boolean } {
  const raw = String(ctx.integrations?.firecrawl?.config?.baseUrl ?? '').trim().replace(/\/+$/, '');
  const selfHosted = !!raw && raw !== FIRECRAWL_CLOUD;
  const baseUrl = raw || FIRECRAWL_CLOUD;
  const enabled = ctx.integrations?.firecrawl?.enabled !== false;
  // Self-hosted Firecrawl may run without auth; the cloud needs a key.
  const key = typeof ctx.keys.firecrawl === 'string' ? ctx.keys.firecrawl : undefined;
  return { baseUrl, key, selfHosted, available: enabled && (selfHosted || !!ctx.keys.firecrawl) };
}

export function searxngUrl(ctx: WebContext): string | null {
  const raw = String(ctx.integrations?.searxng?.config?.url ?? '').trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

export function providerStates(ctx: WebContext): Record<WebProviderId, ProviderState> {
  const fc = firecrawlEndpoint(ctx);
  const sx = searxngUrl(ctx);
  const on = (k: string) => ctx.integrations?.[k]?.enabled !== false;
  return {
    searxng: !on('searxng') ? { available: false, reason: 'Switched off' }
      : sx ? { available: true } : { available: false, reason: 'No SearXNG URL set' },
    firecrawl: !on('firecrawl') ? { available: false, reason: 'Switched off' }
      : fc.available ? { available: true } : { available: false, reason: 'No FIRECRAWL_API_KEY and no self-hosted URL' },
    jina: !on('jina') ? { available: false, reason: 'Switched off' } : { available: true },
    builtin: ctx.webLayer?.builtin_enabled === false ? { available: false, reason: 'Switched off' } : { available: true },
  };
}

function legacyPriority(ctx: WebContext): Partial<Record<WebProviderId, number>> {
  const p = (k: string) => Number(ctx.integrations?.[k]?.config?.priority) || undefined;
  return { searxng: p('searxng'), firecrawl: p('firecrawl'), jina: p('jina') };
}

export function chainFor(ctx: WebContext, capability: WebCapability, preferred?: string | null, exclude?: WebProviderId[]): WebProviderId[] {
  return providerChain({
    capability,
    order: configuredOrder(capability, ctx.webLayer, legacyPriority(ctx)),
    state: providerStates(ctx),
    status: ctx.status,
    preferred,
    exclude,
  });
}

/** The answer web_providers_status gives, from a context — the edge's or the browser's. */
export function describeWebContext(ctx: WebContext) {
  const state = providerStates(ctx);
  const fc = firecrawlEndpoint(ctx);
  const describe = (capability: WebCapability) => ({
    order: configuredOrder(capability, ctx.webLayer, legacyPriority(ctx)).filter((p) => CAPABLE[capability].includes(p)),
    chain: chainFor(ctx, capability),
  });
  return {
    search: describe('search'),
    read: describe('read'),
    providers: (Object.keys(PROVIDER_LABEL) as WebProviderId[]).map((id) => ({
      id,
      label: PROVIDER_LABEL[id],
      capabilities: (Object.keys(CAPABLE) as WebCapability[]).filter((c) => CAPABLE[c].includes(id)),
      ...state[id],
      ...(ctx.status[id] ?? {}),
      ...(id === 'firecrawl' ? { base_url: fc.baseUrl, self_hosted: fc.selfHosted } : {}),
      ...(id === 'searxng' ? { url: searxngUrl(ctx) } : {}),
    })),
  };
}
