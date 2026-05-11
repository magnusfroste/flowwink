import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAnonClient, getServiceClient, getUserClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { employee_id } = await req.json();
    if (!employee_id) {
      return new Response(JSON.stringify({ error: "employee_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        // Verify caller is admin
    const userClient = getUserClient(authHeader)!;
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getServiceClient();
    const { data: hasAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });
    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load employee
    const { data: emp, error: empErr } = await admin
      .from("employees")
      .select("id, name, email, user_id")
      .eq("id", employee_id)
      .maybeSingle();
    if (empErr || !emp) {
      return new Response(JSON.stringify({ error: "Employee not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!emp.email) {
      return new Response(JSON.stringify({ error: "Employee has no email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId = emp.user_id as string | null;

    // Already linked
    if (userId) {
      await admin.from("user_roles").upsert(
        { user_id: userId, role: "employee" },
        { onConflict: "user_id,role" }
      );
      return new Response(JSON.stringify({ success: true, user_id: userId, status: "already_linked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up existing auth user by email
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = existing?.users?.find((u) => u.email?.toLowerCase() === emp.email!.toLowerCase());

    if (found) {
      userId = found.id;
    } else {
      // Send invite
      const redirectTo = `${req.headers.get("origin") ?? ""}/account`;
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(emp.email, {
        data: { full_name: emp.name, signup_type: "employee" },
        redirectTo,
      });
      if (inviteErr || !invited?.user) {
        return new Response(JSON.stringify({ error: inviteErr?.message ?? "Invite failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = invited.user.id;
    }

    // Link + grant role
    await admin.from("employees").update({ user_id: userId }).eq("id", emp.id);
    await admin.from("user_roles").upsert(
      { user_id: userId, role: "employee" },
      { onConflict: "user_id,role" }
    );

    return new Response(JSON.stringify({ success: true, user_id: userId, status: found ? "linked_existing" : "invited" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
