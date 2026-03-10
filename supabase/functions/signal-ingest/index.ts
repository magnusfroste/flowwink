import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Signal Ingest — External signal endpoint
 *
 * Accepts signals from external sources (Chrome extension, webhooks, API)
 * and stores them for FlowPilot's heartbeat to process.
 *
 * Authentication: Bearer token validated against site_settings.
 * Signals are stored in agent_activity with skill_name='signal_ingested'.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Empty token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate token against site_settings
    const { data: tokenSetting } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "signal_ingest_token")
      .maybeSingle();

    const storedToken = (tokenSetting?.value as any)?.token;
    if (!storedToken || storedToken !== token) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json();
    const url = typeof body.url === "string" ? body.url.trim().slice(0, 2048) : "";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 10000) : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    const sourceType = typeof body.source_type === "string" ? body.source_type.trim().slice(0, 50) : "web";

    if (!url && !content) {
      return new Response(
        JSON.stringify({ error: "Either url or content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store signal as agent_activity for heartbeat to pick up
    const { data: activity, error: insertError } = await supabase
      .from("agent_activity")
      .insert({
        agent: "flowpilot",
        skill_name: "signal_ingested",
        input: { url, title, content, note, source_type: sourceType },
        output: {},
        status: "success",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save signal" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also store in agent_memory for the heartbeat to reference
    await supabase.from("agent_memory").insert({
      key: `signal:${activity.id.slice(0, 8)}`,
      value: { url, title, content: content.slice(0, 500), note, source_type: sourceType, ingested_at: new Date().toISOString() },
      category: "context",
      created_by: "flowpilot",
    });

    return new Response(
      JSON.stringify({ ok: true, id: activity.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Signal ingest error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
