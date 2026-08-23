// check_integrations — internal skill handler (sensor, read-only).
//
// Probes every ENABLED integration with a cheap live call and reports
// per-integration status. Born from a real incident (2026-07-22): the
// fleet's SearXNG instance was down/misconfigured for days and nobody
// noticed — web-search silently fell back to firecrawl, and the only
// symptom was a provider field deep in agent_activity output. A failing
// integration must be one skill call away from visible.
//
// Probe rules:
//   * only enabled integrations are probed; disabled → skipped
//   * every probe is bounded (6s) and never throws — a hung endpoint is a
//     'fail' with detail, not a handler exception
//   * probes are auth checks / trivial reads, never billable writes
//   * diagnostics name the LIKELY FIX when the failure shape is known
//     (e.g. SearXNG 403 on format=json → "enable json in settings.yml")

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { recordIntegrationHealth } from './integration-health-state.ts';

export interface IntegrationProbeResult {
  name: string;
  /**
   * Three outcomes, not two. 'unused' is the one that was missing: an
   * integration nothing points at is not broken, and reporting it as broken is
   * how a sensor loses its reader.
   */
  status: 'ok' | 'fail' | 'skipped' | 'unused';
  detail: string;
  /** Does anything in THIS instance actually consume it? See CONSUMERS. */
  consumed?: boolean | 'unknown';
  latency_ms?: number;
}

const PROBE_TIMEOUT_MS = 6000;

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

type Probe = (
  config: Record<string, unknown>,
  supabase: SupabaseClient,
) => Promise<{ ok: boolean; detail: string }>;

function keyProbe(envKey: string, url: string, init: (key: string) => RequestInit): Probe {
  return async () => {
    const key = Deno.env.get(envKey);
    if (!key) return { ok: false, detail: `${envKey} is not set in edge function secrets` };
    const res = await timedFetch(url, init(key));
    if (res.ok) return { ok: true, detail: `auth ok (HTTP ${res.status})` };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, detail: `key rejected (HTTP ${res.status}) — rotate or re-enter the API key` };
    }
    return { ok: false, detail: `unexpected HTTP ${res.status}` };
  };
}

// One probe per integration key in site_settings.integrations. Keep these
// CHEAP — an operator (or the daily automation) may run all of them at once.
const PROBES: Record<string, Probe> = {
  searxng: async (config) => {
    const raw = (config?.url as string | undefined)?.trim();
    if (!raw) return { ok: false, detail: 'no url configured' };
    const base = raw.replace(/\/+$/, '');
    const res = await timedFetch(`${base}/search?q=ping&format=json`, {
      headers: { Accept: 'application/json', 'User-Agent': 'FlowWink-IntegrationCheck/1.0' },
    });
    if (res.status === 403) {
      // The exact 2026-07-22 failure shape: instance up, JSON format off.
      return {
        ok: false,
        detail: 'instance reachable but 403 on format=json — enable "json" under search.formats in the SearXNG settings.yml',
      };
    }
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} from ${base}` };
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.results)) {
      return { ok: false, detail: 'responded 200 but no results array — not a SearXNG JSON response' };
    }
    if (data.results.length === 0) {
      // JSON works but zero results = the second 2026-07-22 failure shape
      // (default engines blocked from this IP).
      const dead = (data.unresponsive_engines ?? []).map((e: unknown[]) => e?.[0]).filter(Boolean);
      return {
        ok: false,
        detail: `JSON ok but 0 results — search engines likely blocking this server's IP (unresponsive: ${dead.join(', ') || 'none reported'}); enable a DC-friendly engine such as qwant/mojeek`,
      };
    }
    return { ok: true, detail: `ok — ${data.results.length} results for probe query` };
  },

  firecrawl: keyProbe('FIRECRAWL_API_KEY', 'https://api.firecrawl.dev/v1/team/credit-usage', (k) => ({
    headers: { Authorization: `Bearer ${k}` },
  })),

  // Evidence before probe. A Resend key scoped to "Sending access" — the
  // correct, least-privilege choice, and what optic uses — can POST /emails but
  // gets 401 on GET /domains. The old probe hit /domains and reported "key
  // rejected — rotate the key" about a key that had sent an invitation
  // fourteen minutes earlier. A warning that fires on a working system teaches
  // people to ignore warnings.
  //
  // So: ask the platform's own outbound log first. A recent successful send IS
  // the health check, performed on the real path, in production, for free.
  // Only with no such evidence does it fall back to the management endpoint —
  // and a 401 there says what it can honestly say, which is that this endpoint
  // cannot tell.
  resend: async (_config, supabase) => {
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) return { ok: false, detail: 'RESEND_API_KEY is not set in edge function secrets' };

    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: recent } = await supabase
      .from('outbound_communications')
      .select('created_at')
      .eq('provider', 'resend')
      .eq('status', 'sent')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);
    if (recent?.length) {
      const when = String(recent[0].created_at).slice(0, 16).replace('T', ' ');
      return { ok: true, detail: `sending works — last delivered ${when} UTC` };
    }

    const res = await timedFetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) return { ok: true, detail: `auth ok (HTTP ${res.status})` };
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        detail: `cannot verify from here (HTTP ${res.status}): a sending-only key is refused by /domains, and nothing has been sent in 7 days to prove otherwise. Send one mail, or check the key.`,
      };
    }
    return { ok: false, detail: `unexpected HTTP ${res.status}` };
  },

  openai: keyProbe('OPENAI_API_KEY', 'https://api.openai.com/v1/models', (k) => ({
    headers: { Authorization: `Bearer ${k}` },
  })),

  gemini: async () => {
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return { ok: false, detail: 'GEMINI_API_KEY is not set in edge function secrets' };
    const res = await timedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`,
    );
    return res.ok
      ? { ok: true, detail: `auth ok (HTTP ${res.status})` }
      : { ok: false, detail: `key rejected or API error (HTTP ${res.status})` };
  },

  unsplash: keyProbe(
    'UNSPLASH_ACCESS_KEY',
    'https://api.unsplash.com/photos?page=1&per_page=1',
    (k) => ({ headers: { Authorization: `Client-ID ${k}` } }),
  ),

  // v3 — the platform's composio-proxy runs v2/v3/v3.1; v1 is retired (410).
  // The first live run of this very probe was fooled by that: it reported
  // composio failing while the integration itself was fine.
  composio: keyProbe('COMPOSIO_API_KEY', 'https://backend.composio.dev/api/v3/toolkits?limit=1', (k) => ({
    headers: { 'x-api-key': k },
  })),

  local_llm: async (config) => {
    const raw = ((config?.url ?? config?.base_url) as string | undefined)?.trim();
    if (!raw) return { ok: false, detail: 'no url configured' };
    const base = raw.replace(/\/+$/, '');
    const key = Deno.env.get('LOCAL_LLM_API_KEY');
    const res = await timedFetch(`${base}/v1/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    return res.ok
      ? { ok: true, detail: `reachable (HTTP ${res.status})` }
      : { ok: false, detail: `HTTP ${res.status} from ${base}` };
  },
};

// ---------------------------------------------------------------------------
// Consumption — the question that has to be asked BEFORE "does it work"
// ---------------------------------------------------------------------------
//
// "Broken" is a property of something USED, not of something that EXISTS.
// Unconfigured is not broken. An integration nothing points at is unused.
//
// The finding that forced this layer (optic, 2026-08-23): local_llm carried a
// model and an api key but an empty endpoint, so the probe reported
// "no url configured" as a FAILURE and FlowChat raised it as an alarm. But
// `system_ai.provider` on that instance is "openai", and resolveAiConfig reads
// integrations.local_llm.config ONLY when the provider is "local". Nothing
// consumed it. The check was reporting a fault in a part the platform does not
// use — on an instance that had simply not bought that part. Every instance
// that has not bought everything would raise the same alarm, every day, until
// people stop reading the report.
//
// This does NOT weaken Law 4. "Keys exist → the feature works" stands exactly
// as before; a missing `enabled` still counts as enabled. What is added is one
// step in FRONT of it: ask whether anything consumes the integration, and only
// then ask whether it works. When the answer is yes and the probe fails, the
// alarm gets LOUDER — the detail now names what depends on it.
//
// Each rule is DERIVED from the map the platform already uses at runtime, never
// invented here. Where a rule is a mirror of a gate elsewhere, the source is
// named in the comment so the two can be compared when either moves.

type Consumption = { used: boolean | 'unknown'; why: string };

interface InstanceMap {
  /** The whole site_settings.integrations row. */
  integrations: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
  /** site_settings.system_ai.provider — 'openai' | 'gemini' | 'anthropic' | 'local' | null. */
  aiProvider: string | null;
}

const hasSecret = (name: string): boolean => !!Deno.env.get(name);

const CONSUMERS: Record<string, (m: InstanceMap) => Consumption> = {
  // _shared/ai-config.ts → resolveAiConfig: the local branch is entered only
  // when the configured provider is literally 'local'. There is no auto-detect
  // path that reaches a local endpoint, so nothing else can pull it in.
  local_llm: (m) => m.aiProvider === 'local'
    ? { used: true, why: 'System AI runs on the local provider (system_ai.provider = "local")' }
    : {
        used: false,
        why: `System AI runs on "${m.aiProvider ?? 'auto-detect'}"; resolveAiConfig reads local_llm.config only when the provider is "local"`,
      },

  // openai/gemini are reachable two ways: named as the primary provider, or
  // picked up by resolveAiConfig's env auto-detect and its vision fallback —
  // which is why a present key alone counts as consumption for these two.
  openai: (m) => m.aiProvider === 'openai'
    ? { used: true, why: 'System AI provider' }
    : hasSecret('OPENAI_API_KEY')
      ? { used: true, why: "reachable as resolveAiConfig's auto-detect / multimodal fallback" }
      : { used: false, why: 'not the System AI provider and no OPENAI_API_KEY to fall back to' },

  gemini: (m) => m.aiProvider === 'gemini'
    ? { used: true, why: 'System AI provider' }
    : hasSecret('GEMINI_API_KEY')
      ? { used: true, why: "reachable as resolveAiConfig's auto-detect / multimodal fallback" }
      : { used: false, why: 'not the System AI provider and no GEMINI_API_KEY to fall back to' },

  // email-send/index.ts → `resendCfg.enabled !== false && !!RESEND_API_KEY`.
  // Same predicate, so the sensor and the sender cannot disagree about whether
  // this transport is in the chain.
  resend: (m) => (m.integrations.resend?.enabled !== false && hasSecret('RESEND_API_KEY'))
    ? { used: true, why: "email-send's transport chain (all outbound mail)" }
    : { used: false, why: 'not in email-send\'s transport chain — no RESEND_API_KEY set' },

  // email-send/index.ts → `composioCfg.enabled === true && !!COMPOSIO_API_KEY`
  // (opt-in), plus composio-proxy for the Gmail/tool rails.
  composio: (m) => (m.integrations.composio?.enabled === true && hasSecret('COMPOSIO_API_KEY'))
    ? { used: true, why: 'composio-proxy and email-send\'s reply-friendly transport' }
    : { used: false, why: 'opt-in integration, not switched on with a COMPOSIO_API_KEY' },

  // web-search/index.ts → `searxng?.enabled !== false && !!rawUrl`.
  searxng: (m) => (m.integrations.searxng?.enabled !== false
    && !!String((m.integrations.searxng?.config as Record<string, unknown> | undefined)?.url ?? '').trim())
    ? { used: true, why: "web-search's provider chain" }
    : { used: false, why: 'no SearXNG url configured, so web-search never reaches for it' },

  // web-search/index.ts → `firecrawl?.enabled !== false`; without the key the
  // provider cannot be called at all, so the key is the honest half.
  firecrawl: (m) => (m.integrations.firecrawl?.enabled !== false && hasSecret('FIRECRAWL_API_KEY'))
    ? { used: true, why: "web-search / web-scrape provider chain" }
    : { used: false, why: 'no FIRECRAWL_API_KEY set, so web-search never reaches for it' },

  // _shared/handlers/unsplash-search.ts is the only consumer and it reads the
  // secret directly — no settings gate exists to mirror.
  unsplash: () => hasSecret('UNSPLASH_ACCESS_KEY')
    ? { used: true, why: 'unsplash_search skill (media picker)' }
    : { used: false, why: 'no UNSPLASH_ACCESS_KEY set' },
};

/**
 * Deliberately returns 'unknown' rather than a guess for an integration nobody
 * has mapped. A health check that guesses is worse than one that abstains: it
 * teaches its reader to ignore it. The guardrail keeps this branch unreachable
 * for integrations that HAVE a probe — add the probe, add the consumer.
 */
function consumptionOf(name: string, map: InstanceMap): Consumption {
  const rule = CONSUMERS[name];
  if (!rule) return { used: 'unknown', why: 'no consumption rule declared for this integration' };
  return rule(map);
}

// Integrations that have no meaningful server-side probe (client-side snippets,
// umbrella configs). Reported as skipped-with-reason rather than omitted, so
// the report always covers the full configured surface.
const UNPROBEABLE: Record<string, string> = {
  google_analytics: 'client-side measurement snippet — nothing to probe server-side',
  email: 'umbrella config — delivery is probed via the resend integration',
};

export async function executeCheckIntegrations(
  supabase: SupabaseClient,
  args?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'integrations')
    .maybeSingle();
  const integrations = (data?.value ?? {}) as Record<
    string,
    { enabled?: boolean; config?: Record<string, unknown> }
  >;

  // The instance map the consumption rules are read against. system_ai is the
  // platform's existing answer to "which AI provider does this site run on" —
  // the same row resolveAiConfig reads. No second map is invented here.
  const { data: aiRow } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'system_ai')
    .maybeSingle();
  const map: InstanceMap = {
    integrations,
    aiProvider: (((aiRow?.value ?? {}) as Record<string, unknown>).provider as string | undefined) ?? null,
  };

  const results: IntegrationProbeResult[] = [];
  const names = Object.keys(integrations).sort();

  await Promise.all(
    names.map(async (name) => {
      const entry = integrations[name] ?? {};
      // Missing flag counts as enabled — same reading as web-search's
      // `enabled !== false` (Law 4: keys exist → the feature works).
      if (entry.enabled === false) {
        results.push({ name, status: 'skipped', detail: 'disabled in settings' });
        return;
      }
      if (UNPROBEABLE[name]) {
        results.push({ name, status: 'skipped', detail: UNPROBEABLE[name] });
        return;
      }

      // Consumption first, health second. An integration nothing consumes is
      // reported neutrally and NEVER probed: a probe that cannot produce a
      // useful verdict can still produce a scary one.
      const consumption = consumptionOf(name, map);
      if (consumption.used === false) {
        results.push({
          name,
          status: 'unused',
          consumed: false,
          detail: `not in use — ${consumption.why}`,
        });
        return;
      }

      const probe = PROBES[name];
      if (!probe) {
        results.push({ name, status: 'skipped', detail: 'no probe implemented for this integration' });
        return;
      }
      const started = Date.now();
      // A failure on something the platform depends on has to say what depends
      // on it — that is the difference between an alarm and a notification.
      const loud = (detail: string) => consumption.used === 'unknown'
        ? `${detail} (could not determine whether anything uses this integration)`
        : `${detail} — IN USE BY: ${consumption.why}`;
      try {
        const r = await probe(entry.config ?? {}, supabase);
        results.push({
          name,
          status: r.ok ? 'ok' : 'fail',
          consumed: consumption.used,
          detail: r.ok ? r.detail : loud(r.detail),
          latency_ms: Date.now() - started,
        });
      } catch (e) {
        results.push({
          name,
          status: 'fail',
          consumed: consumption.used,
          detail: loud(e instanceof Error && e.name === 'AbortError'
            ? `no response within ${PROBE_TIMEOUT_MS / 1000}s`
            : `probe error: ${e instanceof Error ? e.message : String(e)}`),
          latency_ms: Date.now() - started,
        });
      }
    }),
  );

  results.sort((a, b) => a.name.localeCompare(b.name));
  const failing = results.filter((r) => r.status === 'fail');
  const unused = results.filter((r) => r.status === 'unused');

  const report = {
    healthy: failing.length === 0,
    summary: `${results.filter((r) => r.status === 'ok').length} ok, ${failing.length} failing, ` +
      `${unused.length} unused, ${results.filter((r) => r.status === 'skipped').length} skipped`,
    failing: failing.map((r) => r.name),
    // Named separately so a reader can tell "this instance has not bought that
    // part" apart from "this instance is broken".
    unused: unused.map((r) => r.name),
    integrations: results,
  };

  // The measurement updates the STATE and — only on a transition — files an
  // acknowledgeable notice. It used to write a `role: 'assistant'` row into
  // admin FlowChat instead, which put something moving inside something
  // permanent: nine such messages piled up on optic, four of them word for
  // word identical, none of them resolvable, and the alarm became wallpaper.
  // See integration-health-state.ts for the full account.
  //
  // Deliberately unconditional (the old chat write only fired for
  // `source: 'automation'`): the state is "true as of the last probe", and who
  // ordered the probe does not change what is true. Best-effort — the report
  // below is returned either way, and the skill's RETURN SHAPE is untouched.
  // It is agent surface: an agent that asks gets the whole answer.
  await recordIntegrationHealth(
    supabase,
    report,
    typeof args?.source === 'string' ? args.source : 'manual',
  );

  return report;
}
