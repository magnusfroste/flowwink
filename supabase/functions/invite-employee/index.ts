import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAnonClient, getServiceClient, getUserClient } from '../_shared/supabase-clients.ts';
import { loadEmailShell } from '../_shared/email-shell.ts';

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
    let actionLink: string | undefined;
    let mailed = true;
    let mailReason: string | null = null;

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
      // Send invite — through the operator's own mail rail, with OUR link.
      // Not inviteUserByEmail: Supabase's mailer sends a /auth/v1/verify
      // action_link that is consumed on its first GET, and email security
      // scanners fetch every link before the person sees it (synclair
      // 2026-10-23: the scanner "accepted", the colleague saw "expired").
      // The activation screen holds the hashed token and spends it on a click.
      const siteUrl = await resolveSiteUrl(admin, req);
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email: emp.email,
        options: { data: { full_name: emp.name }, redirectTo: `${siteUrl}/account/activate?next=/admin` },
      });
      if (linkErr || !linkData?.user) {
        return new Response(JSON.stringify({ error: linkErr?.message ?? "Invite failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = linkData.user.id;
      const props = linkData.properties as { action_link?: string; hashed_token?: string } | null;
      actionLink = props?.hashed_token
        ? `${siteUrl}/account/activate?token_hash=${encodeURIComponent(props.hashed_token)}&type=invite&next=${encodeURIComponent("/admin")}`
        : props?.action_link;

      const shell = await loadEmailShell(admin);
      const orgName = shell.organizationName || "FlowWink";
      // A fragment: email-send wraps it in the operator's branded shell.
      const html = `
        <h2 style="margin:0 0 12px;font-size:20px;">Welcome to ${escapeHtml(orgName)}</h2>
        <p>${escapeHtml(emp.name || emp.email)}, your employee account at ${escapeHtml(orgName)} is ready.</p>
        <p style="margin:24px 0;">
          <a href="${actionLink}" style="display:inline-block;padding:12px 24px;background-color:${shell.primaryHex};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Activate your account</a>
        </p>
        <p style="color:#666666;font-size:13px;">You will be asked to choose your own password. If you were not expecting this, you can ignore this email.</p>
      `;
      const { data: sendData, error: sendErr } = await admin.functions.invoke("email-send", {
        body: { to: emp.email, subject: `Your account at ${orgName}`, html, source: "invite-employee", tags: { source: "invite-employee" } },
      });
      // Honest outcome: a simulated send (no provider) or a refused recipient
      // is NOT "invite sent" — the caller gets the link to pass on instead.
      const simulated = Boolean((sendData as { simulated?: boolean } | null)?.simulated);
      mailed = !sendErr && Boolean((sendData as { success?: boolean } | null)?.success) && !simulated;
      if (!mailed) {
        mailReason = sendErr?.message ?? "unknown error";
        const ctx = (sendErr as { context?: Response } | null)?.context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json() as { error?: string; how_to_change?: string };
            if (body?.error) mailReason = `${body.error} ${body.how_to_change ?? ""}`.trim();
          } catch { /* keep the generic reason */ }
        }
      }
    }

    // Link + grant roles. An invited colleague is born as employee + writer —
    // what the trigger used to grant for signup_type=employee plus the row
    // this function always added — and NOT as customer, which is the
    // trigger's default for a request it no longer reads. An existing user
    // (linking an employee record to an account that already signs in) only
    // gains employee: never strip or reshape the roles someone already holds.
    await admin.from("employees").update({ user_id: userId }).eq("id", emp.id);
    const grant = found ? ["employee"] : ["employee", "writer"];
    await admin.from("user_roles").upsert(
      grant.map((role) => ({ user_id: userId, role })),
      { onConflict: "user_id,role" }
    );
    if (!found) {
      await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "customer");
    }

    const status = found ? "linked_existing" : (mailed ? "invited" : "invited_no_mail");
    return new Response(JSON.stringify({
      success: true, user_id: userId, status,
      ...(status === "invited_no_mail" ? { reason: mailReason, action_link: actionLink } : {}),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function resolveSiteUrl(admin: ReturnType<typeof getServiceClient>, req: Request): Promise<string> {
  const { data: general } = await admin.from("site_settings").select("value").eq("key", "general").maybeSingle();
  return ((general?.value as { siteUrl?: string } | null)?.siteUrl ?? "").replace(/\/+$/, "")
    || (req.headers.get("origin") ?? "").replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
