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

export interface IntegrationProbeResult {
  name: string;
  status: 'ok' | 'fail' | 'skipped';
  detail: string;
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

type Probe = (config: Record<string, unknown>) => Promise<{ ok: boolean; detail: string }>;

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

  resend: keyProbe('RESEND_API_KEY', 'https://api.resend.com/domains', (k) => ({
    headers: { Authorization: `Bearer ${k}` },
  })),

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

// Integrations that have no meaningful server-side probe (client-side snippets,
// umbrella configs). Reported as skipped-with-reason rather than omitted, so
// the report always covers the full configured surface.
const UNPROBEABLE: Record<string, string> = {
  google_analytics: 'client-side measurement snippet — nothing to probe server-side',
  email: 'umbrella config — delivery is probed via the resend integration',
};

/**
 * When the scheduled sweep finds failures, surface them where the operator
 * already looks: a system message in admin FlowChat (same channel as the
 * daily briefing). On-demand runs skip this — the caller sees the result.
 */
async function notifyFailures(
  supabase: SupabaseClient,
  failing: IntegrationProbeResult[],
): Promise<void> {
  try {
    const { data: admin } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();
    if (!admin?.user_id) return;

    const today = new Date().toISOString().slice(0, 10);
    const title = `Integration health — ${today}`;
    const { data: existing } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('scope', 'internal')
      .eq('user_id', admin.user_id)
      .eq('title', title)
      .limit(1)
      .maybeSingle();
    let conversationId = existing?.id ?? null;
    if (!conversationId) {
      const { data: conv } = await supabase
        .from('chat_conversations')
        .insert({ scope: 'internal', user_id: admin.user_id, title })
        .select('id')
        .single();
      conversationId = conv?.id ?? null;
    }
    if (!conversationId) return;

    const lines = failing.map((f) => `• **${f.name}**: ${f.detail}`);
    await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: `⚠️ ${failing.length} integration${failing.length > 1 ? 's' : ''} failing:\n${lines.join('\n')}\n\nRun check_integrations again after fixing to verify.`,
      source: 'system',
    });
  } catch {
    // Notification is best-effort — the probe result itself is the product.
  }
}

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
      const probe = PROBES[name];
      if (!probe) {
        results.push({ name, status: 'skipped', detail: 'no probe implemented for this integration' });
        return;
      }
      const started = Date.now();
      try {
        const r = await probe(entry.config ?? {});
        results.push({
          name,
          status: r.ok ? 'ok' : 'fail',
          detail: r.detail,
          latency_ms: Date.now() - started,
        });
      } catch (e) {
        results.push({
          name,
          status: 'fail',
          detail: e instanceof Error && e.name === 'AbortError'
            ? `no response within ${PROBE_TIMEOUT_MS / 1000}s`
            : `probe error: ${e instanceof Error ? e.message : String(e)}`,
          latency_ms: Date.now() - started,
        });
      }
    }),
  );

  results.sort((a, b) => a.name.localeCompare(b.name));
  const failing = results.filter((r) => r.status === 'fail');
  if (failing.length > 0 && args?.source === 'automation') {
    await notifyFailures(supabase, failing);
  }
  return {
    healthy: failing.length === 0,
    summary: `${results.filter((r) => r.status === 'ok').length} ok, ${failing.length} failing, ${results.filter((r) => r.status === 'skipped').length} skipped`,
    failing: failing.map((r) => r.name),
    integrations: results,
  };
}
