import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Integrations account info — one function for every provider's usage/quota
 * card (edge-surface refactor B4, replacing openai-account, firecrawl-account,
 * hunter-account and elevenlabs-account, which were four copies of the same
 * shape: read env key → call the provider's account API → normalize → soft-fail
 * with HTTP 200 so the Integrations card never crashes).
 *
 * Call with { provider: "openai" | "firecrawl" | "hunter" | "elevenlabs" }
 * (body or ?provider= query param). Response shapes are IDENTICAL to what the
 * four standalone functions returned — the UI cards did not change.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const soft = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── openai ───────────────────────────────────────────────────────────────────
// USD per 1M tokens — approximate, kept conservative (gpt-4.1 family).
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4.1": { in: 2.0, out: 8.0 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4 },
  "gpt-4o": { in: 2.5, out: 10.0 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
};

function estimateCostUsd(model: string | null, promptTokens: number, completionTokens: number): number {
  const key = (model || "gpt-4.1-mini").toLowerCase();
  const match = Object.keys(PRICING).find((k) => key.startsWith(k)) || "gpt-4.1-mini";
  const p = PRICING[match];
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
}

async function openaiAccount(): Promise<unknown> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return { success: false, error: "OPENAI_API_KEY not configured" };

  const isAdminKey = apiKey.startsWith("sk-admin-");
  const keyType = isAdminKey ? "admin" : "project";

  // 1. Validate key by listing models (cheap and works for both project & admin keys)
  let valid = false;
  let validationError: string | null = null;
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    valid = res.ok;
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      validationError = j?.error?.message || `HTTP ${res.status}`;
    }
  } catch (e) {
    validationError = e instanceof Error ? e.message : "Network error";
  }

  // 2. Aggregate our own usage logs for the current month
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  let monthTokens = 0;
  let monthPromptTokens = 0;
  let monthCompletionTokens = 0;
  let monthRequests = 0;
  let monthCostUsd = 0;

  try {
    const { data, error } = await supabase
      .from("ai_usage_logs")
      .select("model, prompt_tokens, completion_tokens, total_tokens")
      .eq("provider", "openai")
      .gte("created_at", monthStart)
      .limit(10000);
    if (!error && data) {
      monthRequests = data.length;
      for (const row of data) {
        const pt = row.prompt_tokens || 0;
        const ct = row.completion_tokens || 0;
        monthPromptTokens += pt;
        monthCompletionTokens += ct;
        monthTokens += row.total_tokens || pt + ct;
        monthCostUsd += estimateCostUsd(row.model, pt, ct);
      }
    }
  } catch {
    // ignore — soft fail
  }

  // 3. Org-level real costs (admin keys only)
  let orgCostUsd: number | null = null;
  if (isAdminKey && valid) {
    try {
      const startUnix = Math.floor(new Date(monthStart).getTime() / 1000);
      const res = await fetch(
        `https://api.openai.com/v1/organization/costs?start_time=${startUnix}&limit=31`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (res.ok) {
        const j = await res.json();
        let total = 0;
        for (const bucket of j?.data || []) {
          for (const result of bucket?.results || []) {
            total += result?.amount?.value || 0;
          }
        }
        orgCostUsd = total;
      }
    } catch {
      // ignore
    }
  }

  return {
    success: true,
    valid,
    validation_error: validationError,
    key_type: keyType,
    month_to_date: {
      requests: monthRequests,
      total_tokens: monthTokens,
      prompt_tokens: monthPromptTokens,
      completion_tokens: monthCompletionTokens,
      estimated_cost_usd: Number(monthCostUsd.toFixed(4)),
      org_cost_usd: orgCostUsd,
    },
  };
}

// ── firecrawl ────────────────────────────────────────────────────────────────
async function firecrawlAccount(): Promise<unknown> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return { success: false, error: "FIRECRAWL_API_KEY not configured" };

  // Try v2 first, fall back to v1. Both endpoints return:
  //   { success: true, data: { remaining_credits: number, plan_credits?: number } }
  const endpoints = [
    "https://api.firecrawl.dev/v2/team/credit-usage",
    "https://api.firecrawl.dev/v1/team/credit-usage",
  ];

  let lastError = "Unknown error";
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = json?.error || `HTTP ${res.status}`;
        continue;
      }

      const d = json?.data ?? json ?? {};
      const remaining = Number(d.remaining_credits ?? d.remainingCredits ?? 0);
      const plan = d.plan_credits ?? d.planCredits ?? null;

      return {
        success: true,
        remaining_credits: remaining,
        plan_credits: plan,
        endpoint: url,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { success: false, error: lastError };
}

// ── hunter ───────────────────────────────────────────────────────────────────
async function hunterAccount(): Promise<unknown> {
  const apiKey = Deno.env.get("HUNTER_API_KEY");
  if (!apiKey) return { success: false, error: "HUNTER_API_KEY not configured" };

  try {
    const res = await fetch(`https://api.hunter.io/v2/account?api_key=${apiKey}`);
    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: json?.errors?.[0]?.details || `HTTP ${res.status}` };
    }

    const d = json?.data ?? {};
    const requests = d?.requests?.searches ?? d?.requests ?? {};
    const used = requests?.used ?? 0;
    const available = requests?.available ?? 0;
    const remaining = Math.max(0, available - used);

    return {
      success: true,
      plan_name: d?.plan_name ?? null,
      plan_level: d?.plan_level ?? null,
      reset_date: d?.reset_date ?? null,
      searches: { used, available, remaining },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── elevenlabs ───────────────────────────────────────────────────────────────
async function elevenlabsAccount(): Promise<unknown> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) return { success: false, error: "ELEVENLABS_API_KEY not configured" };

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": apiKey },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: json?.detail?.message || json?.detail || `HTTP ${res.status}` };
    }

    const used = Number(json.character_count ?? 0);
    const limit = Number(json.character_limit ?? 0);
    const remaining = Math.max(0, limit - used);

    return {
      success: true,
      characters_used: used,
      character_limit: limit,
      characters_remaining: remaining,
      tier: json.tier ?? null,
      status: json.status ?? null,
      next_character_count_reset_unix: json.next_character_count_reset_unix ?? null,
      voice_limit: json.voice_limit ?? null,
      voice_slots_used: json.voice_slots_used ?? null,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── dispatch ─────────────────────────────────────────────────────────────────
const PROVIDERS: Record<string, () => Promise<unknown>> = {
  openai: openaiAccount,
  firecrawl: firecrawlAccount,
  hunter: hunterAccount,
  elevenlabs: elevenlabsAccount,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let provider = new URL(req.url).searchParams.get("provider") ?? "";
  if (!provider && req.method === "POST") {
    try {
      const body = await req.json();
      provider = body?.provider ?? "";
    } catch {
      /* no body */
    }
  }

  const handler = PROVIDERS[provider];
  if (!handler) {
    return soft({
      success: false,
      error: `Unknown provider '${provider || "(none)"}'. Use one of: ${Object.keys(PROVIDERS).join(", ")}.`,
    });
  }

  return soft(await handler());
});
