import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * ElevenLabs account info — exposes character quota (used vs limit), tier,
 * and next reset date. Mirrors firecrawl-account / hunter-account so the
 * Integrations card can surface a live usage badge.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/user/get-subscription
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

  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'ELEVENLABS_API_KEY not configured' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: json?.detail?.message || json?.detail || `HTTP ${res.status}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const used = Number(json.character_count ?? 0);
    const limit = Number(json.character_limit ?? 0);
    const remaining = Math.max(0, limit - used);

    return new Response(
      JSON.stringify({
        success: true,
        characters_used: used,
        character_limit: limit,
        characters_remaining: remaining,
        tier: json.tier ?? null,
        status: json.status ?? null,
        next_character_count_reset_unix: json.next_character_count_reset_unix ?? null,
        voice_limit: json.voice_limit ?? null,
        voice_slots_used: json.voice_slots_used ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
