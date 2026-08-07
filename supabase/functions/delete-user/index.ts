// delete-user — admin removes a user account, completely and safely.
//
// This did not exist: the client cannot delete auth users (service key only),
// and no edge function did it either — "can admin delete a user?" was
// answered by the schema with "no one can". The first manual deletion wrote
// this function's spec:
//
//   * profiles/user_roles have NO FK to auth.users — deleting the auth row
//     alone leaves orphans; they must be removed explicitly.
//   * Several business tables reference profiles with NO ACTION
//     (leads.assigned_to, project_tasks.created_by,
//     support_escalations.resolved_by) — deletion aborts until they are
//     detached. Business data is KEPT; only the assignment is cleared.
//   * Guards: not yourself, not the last admin.
//
// Deployed with default JWT verification; the admin check is enforced here.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-clients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = getServiceClient();

    // Caller must be an authenticated admin.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: callerData, error: authErr } = await admin.auth.getUser(bearer);
    if (authErr || !callerData?.user) return json({ error: "Unauthorized" }, 401);
    const caller = callerData.user;

    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const { user_id } = (await req.json()) as { user_id?: string };
    if (!user_id) return json({ error: "user_id is required" }, 400);

    // Guard: not yourself. Locking yourself out is one click away otherwise.
    if (user_id === caller.id) {
      return json({ error: "You cannot delete your own account." }, 400);
    }

    const { data: target } = await admin.auth.admin.getUserById(user_id);
    if (!target?.user) return json({ error: "User not found" }, 404);

    // Guard: never delete the last admin. An instance without an admin has no
    // path back in except the database itself.
    const { data: targetIsAdmin } = await admin.rpc("has_role", {
      _user_id: user_id,
      _role: "admin",
    });
    if (targetIsAdmin) {
      const { count: adminCount } = await admin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if ((adminCount ?? 0) <= 1) {
        return json({ error: "Cannot delete the last admin account." }, 400);
      }
    }

    // Detach business references. The rows are business history and are KEPT
    // — the link to the person is what goes. NO ACTION constraints make the
    // deletion fail otherwise.
    //
    // Not a hardcoded list. The first version detached exactly the 3 columns
    // referencing `profiles` — correct for that family, while 27 more NO ACTION
    // columns referencing `auth.users` directly went unhandled (live case:
    // contract_versions.created_by=2, projects.created_by=1 on the reviewing
    // instance's admin — deleting any colleague who had actually worked failed
    // on an FK error). detach_user_references() walks pg_constraint at
    // execution time, so a new created_by column can never silently re-open
    // the gap; NOT NULL columns are reported by name instead of failing
    // generically. Migration: 20260808290000.
    const { data: detachedData, error: detachErr } = await admin.rpc(
      "detach_user_references",
      { p_user_id: user_id },
    );
    if (detachErr) {
      return json({ error: `Detach failed: ${detachErr.message}` }, 500);
    }
    const detached = (detachedData ?? {}) as Record<string, number>;

    // Orphan cleanup — these tables have no FK to auth.users, so nothing
    // cascades. Explicit, in dependency order.
    await admin.from("user_roles").delete().eq("user_id", user_id);
    await admin.from("profiles").delete().eq("id", user_id);

    const { error: delErr } = await admin.auth.admin.deleteUser(user_id);
    if (delErr) {
      // A constraint we did not anticipate: report it honestly rather than
      // leaving the caller to guess from a generic failure.
      return json({ error: `Auth deletion failed: ${delErr.message}`, detached }, 500);
    }

    await admin.from("audit_logs").insert({
      action: "delete_user",
      entity_type: "user",
      entity_id: user_id,
      user_id: caller.id,
      metadata: { deleted_email: target.user.email, detached },
    });

    return json({ success: true, deleted_email: target.user.email, detached });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
