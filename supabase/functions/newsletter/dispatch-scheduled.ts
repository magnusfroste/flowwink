// newsletter/dispatch-scheduled — cron-triggered dispatcher for scheduled newsletters.
//
// Selects newsletters where status='scheduled' AND scheduled_at <= now(),
// and sends each via the shared sendNewsletterCore routine. Deterministic,
// no AI involvement (executor='platform' philosophy).
//
// Auth: NOT an admin JWT — the pg_cron job invokes via pg_net with the project
// anon key as Bearer. We accept either SUPABASE_SERVICE_ROLE_KEY or
// SUPABASE_ANON_KEY (both are project-scoped, and the anon key is required to
// even reach this function through the gateway). This prevents public triggering.
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { sendNewsletterCore } from './send.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!bearer || (bearer !== serviceKey && bearer !== anonKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = getServiceClient();
    const nowIso = new Date().toISOString();

    const { data: due, error: dueError } = await supabase
      .from("newsletters")
      .select("id, subject, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .limit(50);

    if (dueError) {
      console.error("[newsletter/dispatch-scheduled] query failed:", dueError);
      return new Response(JSON.stringify({ error: dueError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ id: string; ok: boolean; sent_count?: number; error?: string }> = [];
    for (const row of (due ?? []) as any[]) {
      // Flip to 'sending' immediately to prevent the next cron tick picking it up
      // (sendNewsletterCore also does this, but the eq('status','scheduled') filter
      // on that update means the second cron pass is a no-op even if it slips in).
      const { error: flipErr } = await supabase
        .from("newsletters").update({ status: "sending" })
        .eq("id", row.id).eq("status", "scheduled");
      if (flipErr) {
        results.push({ id: row.id, ok: false, error: `flip failed: ${flipErr.message}` });
        continue;
      }
      const r = await sendNewsletterCore(supabase as any, row.id);
      if (r.ok) results.push({ id: row.id, ok: true, sent_count: r.sent_count });
      else results.push({ id: row.id, ok: false, error: r.error });
    }

    return new Response(
      JSON.stringify({ success: true, considered: (due ?? []).length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[newsletter/dispatch-scheduled] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
