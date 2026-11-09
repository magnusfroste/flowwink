/**
 * A ceiling on the public AI endpoints (2026-11-09).
 *
 * chat-completion, docs-chat and consultant-match answer anyone holding the
 * site's publishable key, and each answer is a paid model call. Ask
 * `publicAiLimit(req, supabase, '<fn>')` before the model: null → go on; a
 * Response → return it (429 with Retry-After). Counted per visitor (the IP,
 * hashed — the address is never stored) and per instance per hour, in
 * public_ai_rate_check. The platform's own calls (the service key) are never
 * counted. The limits are a dial: site_settings.security.publicAiRateLimit =
 * { perVisitor, windowSeconds, perHour } (0 switches one off). A counter that
 * cannot be read lets the call through and says so (Law 4) — the ceiling is
 * cost protection, not the visitor's access.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PUBLIC_AI_DEFAULTS = { perVisitor: 30, windowSeconds: 300, perHour: 600 };

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return (fwd.split(",")[0] || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown").trim();
}

async function hashVisitor(ip: string): Promise<string> {
  const salt = Deno.env.get("SUPABASE_URL") ?? "flowwink";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function publicAiLimit(
  req: Request,
  supabase: SupabaseClient,
  fn: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && token === serviceKey) return null; // the platform's own call

  const { data: sec, error: secErr } = await supabase.from("site_settings").select("value").eq("key", "security").maybeSingle();
  if (secErr) console.warn(`[rate-limit] security settings unreadable — defaults apply: ${secErr.message}`);
  const dial = { ...PUBLIC_AI_DEFAULTS, ...((sec?.value as { publicAiRateLimit?: Partial<typeof PUBLIC_AI_DEFAULTS> } | null)?.publicAiRateLimit ?? {}) };

  const { data, error } = await supabase.rpc("public_ai_rate_check", {
    p_fn: fn,
    p_visitor: await hashVisitor(clientIp(req)),
    p_per_visitor: Number(dial.perVisitor) || 0,
    p_window_seconds: Number(dial.windowSeconds) || 300,
    p_per_hour: Number(dial.perHour) || 0,
  });
  if (error) {
    console.warn(`[rate-limit] ${fn}: counter unavailable, the call goes through: ${error.message}`);
    return null;
  }
  const verdict = (data ?? {}) as { allowed?: boolean; scope?: string; retry_after?: number };
  if (verdict.allowed !== false) return null;
  const retry = Math.max(1, Number(verdict.retry_after) || 60);
  return new Response(
    JSON.stringify({
      error: verdict.scope === "instance"
        ? "This site has answered all the AI questions it takes this hour. Please try again later."
        : "Too many questions in a short time. Please wait a moment and try again.",
      code: "RATE_LIMITED",
      retry_after: retry,
    }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retry) } },
  );
}
