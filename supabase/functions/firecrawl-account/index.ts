import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Firecrawl account info — exposes remaining credits + plan credits.
 * Mirrors hunter-account / openai-account so the Integrations card can
 * surface a live credits badge.
 *
 * Docs: https://docs.firecrawl.dev/api-reference/endpoint/credit-usage
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY not configured' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Try v2 first, fall back to v1. Both endpoints return:
  //   { success: true, data: { remaining_credits: number, plan_credits?: number } }
  const endpoints = [
    'https://api.firecrawl.dev/v2/team/credit-usage',
    'https://api.firecrawl.dev/v1/team/credit-usage',
  ];

  let lastError = 'Unknown error';
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = json?.error || `HTTP ${res.status}`;
        continue;
      }

      const d = json?.data ?? json ?? {};
      const remaining = Number(d.remaining_credits ?? d.remainingCredits ?? 0);
      const plan = d.plan_credits ?? d.planCredits ?? null;

      return new Response(
        JSON.stringify({
          success: true,
          remaining_credits: remaining,
          plan_credits: plan,
          endpoint: url,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return new Response(
    JSON.stringify({ success: false, error: lastError }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
