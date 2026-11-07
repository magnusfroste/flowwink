/**
 * Supabase client factory — single source of truth for edge functions.
 *
 * Why this exists:
 *   ~48 edge functions duplicated `createClient(SUPABASE_URL, SERVICE_ROLE_KEY, ...)`.
 *   Each variant slightly different (some pass `auth: { persistSession: false }`,
 *   some don't, some hard-code the package version). This module standardises
 *   the three patterns we actually use:
 *
 *     getServiceClient()            — admin/server-side writes (service_role)
 *     getUserClient(authHeader)     — runs as the calling user (anon + JWT forward)
 *     getAnonClient()               — public read with RLS, no auth header
 *
 * Migration strategy: opt-in. New functions should use these helpers; existing
 * functions can be migrated incrementally. Behaviour is identical to the
 * inline pattern, so swapping one in is safe.
 *
 * Hard rules:
 *   • Never log or return the service_role key.
 *   • Never construct a service-role client in a code path that handles
 *     untrusted input without explicit role/permission checks afterwards.
 *   • Public-facing endpoints should prefer getUserClient() so RLS applies.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * Service-role client — bypasses RLS. Use for trusted server-side ops only.
 *
 * Memoised per isolate: the client is stateless (no session, no token
 * refresh, no auth mutation anywhere in the edge code — re-check with
 * `grep -rn "\.auth\.setSession\|\.auth\.signIn\|setAuth(" supabase/functions`
 * before adding any), so one instance serves every call. 118 call sites,
 * some in per-row loops, used to build a fresh client each (PR #926 counted
 * 648 constructions in one gateway owner filter). `getUserClient` stays
 * per-request: it carries the caller's JWT.
 */
let serviceClient: SupabaseClient | null = null;
export function getServiceClient(): SupabaseClient {
  return (serviceClient ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/**
 * User-scoped client — forwards the caller's JWT so RLS applies as that user.
 * Pass `req.headers.get('Authorization')` (or the raw header value).
 * Returns null if no auth header is present (caller should 401).
 */
export function getUserClient(authHeader: string | null): SupabaseClient | null {
  if (!authHeader) return null;
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anonymous client — public reads under RLS, no user context. */
export function getAnonClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Convenience: resolve the calling user from an Authorization header,
 * returning both the user-scoped client and the user record. Returns
 * `{ error: 'Unauthorized' }` shape when missing/invalid so callers can
 * just `if (auth.error) return 401`.
 */
export async function resolveCaller(authHeader: string | null): Promise<
  | { user: { id: string; email?: string }; client: SupabaseClient; error?: undefined }
  | { error: "missing_auth" | "invalid_token"; user?: undefined; client?: undefined }
> {
  const client = getUserClient(authHeader);
  if (!client) return { error: "missing_auth" };
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return { error: "invalid_token" };
  return { user: data.user as any, client };
}
