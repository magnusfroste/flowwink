import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Signal Ingest — External operator endpoint
 *
 * Receives signals from Chrome extension, webhooks, or any external operator.
 * Stores in agent_memory + agent_activity and fires automation signals.
 *
 * Auth: Bearer token validated against site_settings.signal_ingest_token
 *
 * Actions (determined by note prefix):
 *   - signal: Raw capture → stored + dispatched for AI processing
 *   - draft:  Creates blog post draft from captured content
 *   - bookmark: Saves to agent memory for future reference
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signal-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    // 1. Validate token — check x-signal-token header first, then Authorization Bearer
    const signalToken = req.headers.get("x-signal-token");
    const authHeader = req.headers.get("Authorization");
    const token = signalToken?.trim()
      || (authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "");

    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const supabase = createClient(supabaseUrl, serviceKey);

    // Accept anon key, publishable key, or custom token from site_settings
    let authorized = (anonKey && token === anonKey) || (publishableKey && token === publishableKey);

    // Also check custom token in site_settings
    if (!authorized) {
      const { data: tokenSetting } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "signal_ingest_token")
        .maybeSingle();

      const storedToken = (tokenSetting?.value as any)?.token;
      authorized = !!storedToken && storedToken === token;
    }

    if (!authorized) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid token" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse and sanitize payload
    const body = await req.json();
    const url = typeof body.url === "string" ? body.url.trim().slice(0, 2048) : "";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 10000) : "";
    const rawNote = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    const sourceType = typeof body.source_type === "string" ? body.source_type.trim().slice(0, 50) : "web";

    if (!url && !content) {
      return new Response(
        JSON.stringify({ ok: false, error: "Either url or content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Determine action from note prefix
    let action = "signal";
    let cleanNote = rawNote;
    if (rawNote.startsWith("[ACTION:draft]")) {
      action = "draft";
      cleanNote = rawNote.replace("[ACTION:draft]", "").trim();
    } else if (rawNote.startsWith("[ACTION:bookmark]")) {
      action = "bookmark";
      cleanNote = rawNote.replace("[ACTION:bookmark]", "").trim();
    }

    const signalData = {
      url,
      title: title || url,
      content,
      note: cleanNote,
      source_type: sourceType,
      action,
      captured_at: new Date().toISOString(),
    };

    const results: Record<string, any> = {};

    // 4. Action-specific processing
    if (action === "bookmark") {
      // Save to agent_memory as a bookmark
      const memoryKey = `bookmark:${url || Date.now()}`;
      await supabase.from("agent_memory").upsert(
        {
          key: memoryKey,
          value: signalData,
          category: "context" as any,
          created_by: "flowpilot" as any,
        },
        { onConflict: "key" }
      );
      results.memory_key = memoryKey;
    }

    if (action === "draft" && title) {
      // Create a blog post draft from captured content
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const { data: post } = await supabase
        .from("blog_posts")
        .insert({
          title,
          slug: `signal-${slug}-${Date.now()}`,
          status: "draft",
          excerpt: cleanNote || `Captured from ${sourceType}: ${url}`,
          meta_json: {
            signal_source: sourceType,
            signal_url: url,
            generated_by: "signal-ingest",
          },
        })
        .select("id")
        .single();
      results.draft_id = post?.id;
    }

    // 5. Always store as agent_activity
    const { data: activity, error: insertError } = await supabase
      .from("agent_activity")
      .insert({
        agent: "flowpilot",
        skill_name: `signal_ingest:${action}`,
        input: signalData,
        output: results,
        status: "success",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[signal-ingest] Insert error:", insertError);
      return new Response(JSON.stringify({ ok: false, error: "Failed to save signal" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Also store summary in agent_memory for signal actions
    if (action === "signal") {
      await supabase.from("agent_memory").insert({
        key: `signal:${activity.id.slice(0, 8)}`,
        value: {
          url,
          title,
          content: content.slice(0, 500),
          note: cleanNote,
          source_type: sourceType,
          ingested_at: new Date().toISOString(),
        },
        category: "context" as any,
        created_by: "flowpilot" as any,
      });
    }

    // 7. Fire automation signal (non-blocking)
    try {
      await fetch(`${supabaseUrl}/functions/v1/signal-dispatcher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          signal: "signal_ingested",
          data: { ...signalData, activity_id: activity.id },
          context: {
            entity_type: "signal",
            entity_id: activity.id,
          },
        }),
      });
    } catch (dispatchErr) {
      // Non-fatal — signal is stored regardless
      console.error("[signal-ingest] Dispatch error:", dispatchErr);
    }

    console.log(`[signal-ingest] ${action} from ${sourceType}: ${url}`);

    return new Response(
      JSON.stringify({ ok: true, id: activity.id, action, ...results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[signal-ingest] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
