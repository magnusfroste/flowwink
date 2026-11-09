// Shared in-body auth gate for privileged `--no-verify-jwt` edge functions.
//
// WHY in-body (not verify_jwt): these functions are called by other edge
// functions with the SERVICE ROLE key and by webhooks/telephony that carry no
// end-user JWT, so they must stay --no-verify-jwt. But that also means the anon
// publishable key (public) passes verify_jwt — it is NOT an identity. So a
// function that runs privileged work with the service-role client (RLS off)
// MUST authenticate the CALLER in-body, or it is an open, RLS-exempt endpoint.
//
// Legitimate callers of the privileged surface are exactly:
//   1. Internal edge functions  → Bearer <SERVICE_ROLE_KEY>
//   2. The admin UI             → Bearer <admin session JWT> (functions.invoke,
//      or a raw fetch that sends supabase.auth.getSession().access_token)
// Anon/publishable keys are rejected.
//
// Reference implementations this consolidates: newsletter/send, signal-ingest,
// create-user, and the inline gates in agent-execute + federation-invite-peer.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EdgeAuth {
  authorized: boolean;
  isService: boolean;
  isAdmin: boolean;
  userId: string | null;
}

/**
 * Authorize a request as either the service role or a user holding `role`.
 * Pass a SERVICE-ROLE supabase client (needs auth.getUser + has_role).
 */
export async function requireServiceOrRole(
  req: Request,
  supabase: SupabaseClient,
  role: string = "admin",
): Promise<EdgeAuth> {
  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  if (token && serviceKey && token === serviceKey) {
    return { authorized: true, isService: true, isAdmin: false, userId: null };
  }
  // A JWT that is NOT the anon/publishable key — try to resolve a user + role.
  if (token && token !== anonKey && token !== publishableKey) {
    const { data } = await supabase.auth.getUser(token);
    if (data?.user) {
      const { data: hasRole } = await supabase.rpc("has_role", {
        _user_id: data.user.id,
        _role: role,
      });
      if (hasRole) {
        return { authorized: true, isService: false, isAdmin: true, userId: data.user.id };
      }
    }
  }
  return { authorized: false, isService: false, isAdmin: false, userId: null };
}

/**
 * Authorize a request as the service role, an admin, or a user whose role is
 * granted `moduleId` in role_module_access — the matrix as the only dial
 * (#102). Use for edge functions that back a module surface (send an invoice
 * email, dispatch a survey, relay a support reply): a role granted the module
 * in Role Permissions gets the module's buttons, not a 401.
 */
export async function requireServiceOrModule(
  req: Request,
  supabase: SupabaseClient,
  moduleId: string,
): Promise<EdgeAuth> {
  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  if (token && serviceKey && token === serviceKey) {
    return { authorized: true, isService: true, isAdmin: false, userId: null };
  }
  if (token && token !== anonKey && token !== publishableKey) {
    const { data } = await supabase.auth.getUser(token);
    if (data?.user) {
      // can_access_module() short-circuits to true for admins.
      const { data: canAccess } = await supabase.rpc("can_access_module", {
        _user_id: data.user.id,
        _module_id: moduleId,
      });
      if (canAccess === true) {
        const { data: hasAdmin } = await supabase.rpc("has_role", {
          _user_id: data.user.id,
          _role: "admin",
        });
        return { authorized: true, isService: false, isAdmin: hasAdmin === true, userId: data.user.id };
      }
    }
  }
  return { authorized: false, isService: false, isAdmin: false, userId: null };
}

/**
 * Authorize the service role or ANY staff member (a user holding at least one
 * non-customer role). For module-agnostic utilities with no data access of
 * their own — e.g. ai-task, a pure text transform (#102 ruling: it reads no
 * tables, so the module dial has nothing to protect).
 */
export async function requireServiceOrStaff(
  req: Request,
  supabase: SupabaseClient,
): Promise<EdgeAuth> {
  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  if (token && serviceKey && token === serviceKey) {
    return { authorized: true, isService: true, isAdmin: false, userId: null };
  }
  if (token && token !== anonKey && token !== publishableKey) {
    const { data } = await supabase.auth.getUser(token);
    if (data?.user) {
      const { data: staff } = await supabase.rpc("is_staff", { _user_id: data.user.id });
      if (staff === true) {
        const { data: hasAdmin } = await supabase.rpc("has_role", {
          _user_id: data.user.id,
          _role: "admin",
        });
        return { authorized: true, isService: false, isAdmin: hasAdmin === true, userId: data.user.id };
      }
    }
  }
  return { authorized: false, isService: false, isAdmin: false, userId: null };
}

/** Convenience 401 response with CORS headers. */
export function unauthorized(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * The scheduled surface (2026-11-09): the nine functions pg_cron calls —
 * automation/event/signal dispatchers, knowledge-indexer, dunning-processor,
 * contract- and subscription-billing-cron, quote-expiry-reminders, demo-cycle.
 *
 * Admitted: the service key (other edge functions, the SQL dispatchers), a
 * staff session (an admin for demo-cycle: it rebuilds the instance), or the
 * `x-cron-secret` header the database adds to every scheduled call
 * (`cron_secret_header()`, the vault's CRON_SECRET — born by the migration
 * 20261109160000, never shown to a browser). A WRONG secret is refused at once.
 *
 * A call with none of them was how pg_cron called these until today (the
 * publishable key). For one week it is let through and logged with
 * `[cron-secret]` so the fleet's logs show any caller still without it; then
 * CRON_SECRET_REQUIRED turns true and it is refused. Answers null to go on,
 * or the 401 to return.
 */
export const CRON_SECRET_REQUIRED = false; // turns true after 2026-11-16, once the fleet's logs are clean

export async function requireScheduledCaller(
  req: Request,
  supabase: SupabaseClient,
  fn: string,
  corsHeaders: Record<string, string>,
  opts: { role?: "staff" | "admin" } = {},
): Promise<Response | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (token && serviceKey && token === serviceKey) return null;

  const cronSecret = (req.headers.get("x-cron-secret") ?? "").trim();
  if (cronSecret) {
    const { data, error } = await supabase.rpc("cron_secret_matches", { p_secret: cronSecret });
    if (!error && data === true) return null;
    if (!error) {
      console.warn(`[cron-secret] ${fn}: wrong x-cron-secret — refused`);
      return unauthorized(corsHeaders);
    }
    console.warn(`[cron-secret] ${fn}: the secret could not be checked (${error.message})`);
  }

  const person = opts.role === "admin"
    ? await requireServiceOrRole(req, supabase, "admin")
    : await requireServiceOrStaff(req, supabase);
  if (person.authorized) return null;

  if (CRON_SECRET_REQUIRED) return unauthorized(corsHeaders);
  console.warn(`[cron-secret] ${fn}: called without the cron secret, the service key or ${opts.role === "admin" ? "an admin" : "a staff"} session — let through until the secret is required`);
  return null;
}
