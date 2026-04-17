// Edge function backing get_company_profile + update_company_profile MCP skills.
// Reads/writes site_settings.company_profile (Business Identity).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  action?: "get" | "update";
  data?: Record<string, unknown>;
  merge?: boolean; // when update: shallow-merge instead of replace (default true)
  _skill?: string;
  [key: string]: unknown;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const inferredAction =
      body.action ??
      (body._skill === "update_company_profile" ? "update" : undefined) ??
      (body._skill === "get_company_profile" ? "get" : undefined) ??
      "get";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (inferredAction === "get") {
      const { data, error } = await sb
        .from("site_settings")
        .select("value, updated_at")
        .eq("key", "company_profile")
        .maybeSingle();
      if (error) throw error;
      return json({
        success: true,
        company_profile: data?.value ?? null,
        updated_at: data?.updated_at ?? null,
      });
    }

    if (inferredAction === "update") {
      const fallbackData = Object.fromEntries(
        Object.entries(body).filter(([key, value]) => {
          if (key === "action" || key === "merge" || key === "_skill") return false;
          if (key.startsWith("_")) return false;
          return value !== undefined;
        }),
      );

      const incomingData = body.data && typeof body.data === "object"
        ? body.data
        : fallbackData;

      if (!incomingData || typeof incomingData !== "object" || Object.keys(incomingData).length === 0) {
        return json({ success: false, error: "data object is required for update" }, 400);
      }

      let next: Record<string, unknown> = incomingData as Record<string, unknown>;
      if (body.merge !== false) {
        const { data: existing } = await sb
          .from("site_settings")
          .select("value")
          .eq("key", "company_profile")
          .maybeSingle();
        const current = (existing?.value ?? {}) as Record<string, unknown>;
        next = { ...current, ...incomingData };
      }

      const { data, error } = await sb
        .from("site_settings")
        .upsert(
          { key: "company_profile", value: next, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        )
        .select("value, updated_at")
        .single();
      if (error) throw error;

      return json({
        success: true,
        company_profile: data.value,
        updated_at: data.updated_at,
        message: "Company profile updated",
      });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[company-profile] error:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
