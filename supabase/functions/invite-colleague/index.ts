// invite-colleague — email a colleague an invite that lands them, on first
// sign-in, already holding the functional role they need.
//
// The gap this closes: create-user grants the right role but forces the admin
// to set a password and hand it over; invite-employee sends a real email but
// grants writer+employee, never the functional role (sales/support/…) that
// the module matrix actually gates access on. So inviting a salesperson meant
// either sharing a password or granting the wrong roles and fixing them by
// hand. This does both right: Supabase Auth sends the invite email (the
// colleague sets their own password), and the chosen functional role is
// granted immediately — inviteUserByEmail creates the auth row now, so the
// signup trigger has already fired and we reconcile on top of it, exactly
// like create-user.
//
// Deployed with default JWT verification; the admin check is enforced here.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceClient, getUserClient } from "../_shared/supabase-clients.ts";
import { loadEmailShell } from "../_shared/email-shell.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Mirror of FUNCTIONAL_ROLES in src/types/cms.ts, plus admin. A guardrail test
// compares this list against that source so the two cannot drift.
const INVITABLE_ROLES = [
  "admin",
  "sales", "hr", "accounting", "support",
  "warehouse", "marketing", "purchasing", "projects",
];

/**
 * Where the invitation link should point. The instance's configured site URL
 * first — the origin header is whatever browser the admin happened to use, and
 * an early invitation once shipped a link aimed at the sender's own laptop.
 * The header stays as the local-dev fallback.
 *
 * One resolver, because the invite branch and the reset branch had two and that
 * is how the two drift.
 */
async function resolveSiteUrl(admin: ReturnType<typeof getServiceClient>, req: Request): Promise<string> {
  const { data: general } = await admin
    .from("site_settings").select("value").eq("key", "general").maybeSingle();
  return ((general?.value as { siteUrl?: string } | null)?.siteUrl ?? "").replace(/\/+$/, "")
    || (req.headers.get("origin") ?? "").replace(/\/+$/, "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    // Caller must be an authenticated admin.
    const admin = getServiceClient();
    const userClient = getUserClient(authHeader)!;
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    const { email, role, full_name, action } = (await req.json()) as {
      email?: string; role?: string; full_name?: string; action?: string;
    };

    const cleanEmail = (email ?? "").trim().toLowerCase();
    if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return json({ error: "A valid email is required." }, 400);
    }
    // ── Password reset ──────────────────────────────────────────────────
    // The recovery path for a colleague who has an account but cannot sign in:
    // invited before the activation screen existed, forgot their password, or
    // was created with one they never received. Re-inviting does not help —
    // an existing user is granted the role and mailed nothing.
    //
    // generateLink again, not resetPasswordForEmail: the mail must go through
    // the operator's own rail (verified domain, branded shell, allowlist, no
    // shared-sender cap) exactly like the invitation does.
    if (action === "reset_password") {
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const target = users?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
      if (!target) {
        return json({ error: `No account for ${cleanEmail}. Invite them first.` }, 404);
      }

      const siteUrl = await resolveSiteUrl(admin, req);
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: cleanEmail,
        options: { redirectTo: `${siteUrl}/account/activate?next=/admin` },
      });
      if (linkErr || !linkData?.properties?.action_link) {
        return json({ error: linkErr?.message ?? "Could not create reset link" }, 500);
      }
      const link = linkData.properties.action_link;

      const { data: sendData, error: sendErr } = await admin.functions.invoke("email-send", {
        body: {
          to: cleanEmail,
          subject: "Set a new password",
          html: `<h2 style="margin:0 0 12px">Set a new password</h2>
            <p>An administrator asked us to send you a link to set a new password.</p>
            <p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Set my password</a></p>
            <p style="color:#666;font-size:13px">If you did not expect this, you can ignore it — the link expires and nothing changes until you use it.</p>`,
          source: "colleague-password-reset",
          tags: { source: "colleague-password-reset" },
        },
      });

      const simulated = Boolean((sendData as { simulated?: boolean } | null)?.simulated);
      const mailed = !sendErr && Boolean((sendData as { success?: boolean } | null)?.success) && !simulated;
      if (mailed) return json({ status: "reset_sent", email: cleanEmail });

      // Same honesty as the invitation: the admin gets the link to pass on
      // rather than a false "sent", and the reason rather than an HTTP status.
      let reason = sendErr?.message ?? "unknown error";
      const ctx = (sendErr as { context?: Response } | null)?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.json() as { blocked_by_allowlist?: boolean; error?: string; how_to_change?: string };
          if (body?.blocked_by_allowlist) {
            reason = `${body.error ?? "Recipient is outside this instance's email allowlist."} ${body.how_to_change ?? ""}`.trim();
          } else if (body?.error) reason = body.error;
        } catch { /* not JSON */ }
      }
      return json({
        status: "reset_no_mail",
        email: cleanEmail,
        action_link: link,
        mail_problem: simulated
          ? "No email provider is configured — send this link yourself."
          : reason,
      });
    }

    if (!role || !INVITABLE_ROLES.includes(role)) {
      return json({ error: `role must be one of: ${INVITABLE_ROLES.join(", ")}` }, 400);
    }

    // If the email already has an account, don't re-invite — just grant the
    // role. Re-inviting an existing user is a confusing no-op at best.
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = existing?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail,
    );

    let userId: string;
    let status: "invited" | "granted_existing" | "invited_no_mail";
    // Carried out of the invite branch so role reconciliation always runs —
    // the account exists whether or not the mail left the building, and an
    // account without its role is worse than an account without its email.
    let actionLink: string | undefined;
    let mailProblem: string | undefined;

    if (found) {
      userId = found.id;
      status = "granted_existing";
    } else {
      // generateLink, NOT inviteUserByEmail: it creates the auth user and the
      // invite token but sends NOTHING, so the mail goes out through the
      // platform's own router (email-send → Composio/SMTP/Resend). That is
      // what gets it the operator's verified domain, the branded shell, and
      // no shared-sender rate limit — Supabase's built-in mailer is a shared
      // address with a couple-per-hour cap, which silently drops the third
      // invite in a row. Same rule as everywhere else: modules never talk to
      // a mail provider directly.
      // The canonical public URL from site_settings — the same source
      // contracts, quotes and terms links use. NOT the Origin header: it is
      // absent or wrong depending on how the call arrives, and Supabase Auth
      // silently REPLACES a redirect it does not recognise with its own
      // SITE_URL. On optic that default was still `http://localhost:3000`
      // from install, so the first real invitation shipped a link pointing at
      // the recipient's own machine. Falling back to the header keeps local
      // dev working.
      const siteUrl = await resolveSiteUrl(admin, req);
      // Land on the activation screen, NOT straight in the admin. Pointing an
      // invite verify-link at /admin gave the colleague a live session and no
      // password: they were in, and could never sign in again without another
      // link. Anyone holding a forwarded copy of that link was equally in.
      // /account/activate is the one place that sets a password on an invited
      // account; `next` sends a colleague to the admin afterwards and a portal
      // customer to the portal, so there is one screen and not two copies.
      const redirectTo = `${siteUrl}/account/activate?next=/admin`;
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email: cleanEmail,
        options: { data: { full_name: full_name || cleanEmail, signup_type: "customer" }, redirectTo },
      });
      if (linkErr || !linkData?.user) {
        return json({ error: linkErr?.message ?? "Could not create invitation" }, 500);
      }
      userId = linkData.user.id;
      status = "invited";

      actionLink = (linkData.properties as { action_link?: string } | undefined)?.action_link;
      // Same settings the shell reads, so the button matches the frame around
      // it. A hardcoded blue button inside a brand-coloured shell is exactly
      // the kind of half-branded mail that looks like a template someone
      // forgot to finish.
      const shell = await loadEmailShell(admin);
      const orgName = shell.organizationName || "FlowWink";
      // A FRAGMENT, not a document — email-send wraps it in the operator's
      // branded shell, so the invitation looks like it came from them.
      const html = `
        <h2 style="margin:0 0 12px;font-size:20px;">You have been invited to ${escapeHtml(orgName)}</h2>
        <p>${escapeHtml(inviterName(userData.user))} has invited you to join
           ${escapeHtml(orgName)} as <strong>${escapeHtml(roleLabel(role))}</strong>.</p>
        <p style="margin:24px 0;">
          <a href="${actionLink}" style="display:inline-block;padding:12px 24px;background-color:${shell.primaryHex};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Accept invitation</a>
        </p>
        <p style="color:#666666;font-size:13px;">You will be asked to choose your own password. If you were not expecting this invitation you can ignore this email.</p>
      `;

      const { data: sendData, error: sendErr } = await admin.functions.invoke("email-send", {
        body: {
          to: cleanEmail,
          subject: `Invitation to join ${orgName}`,
          html,
          source: "invite-colleague",
          tags: { source: "invite-colleague" },
        },
      });

      // Report the mail outcome honestly. email-send answers success with
      // simulated=true when NO provider is configured — treating that as
      // "invitation sent" would leave a colleague waiting for an email that
      // never existed, which is the envelope lie this codebase keeps
      // relearning. The admin gets the link to pass on instead.
      const simulated = Boolean((sendData as { simulated?: boolean } | null)?.simulated);
      const mailed = !sendErr && Boolean((sendData as { success?: boolean } | null)?.success) && !simulated;
      if (!mailed) {
        status = "invited_no_mail";
        // email-send answers a withheld recipient with 422 and a body that says
        // WHY. supabase-js turns any non-2xx into a FunctionsHttpError whose
        // .message is the useless "Edge Function returned a non-2xx status
        // code" — the body sits unread on .context. So the outbound allowlist
        // did its job (nothing sent, account created, link handed back) while
        // the admin was told nothing at all. Blocked-vs-broken is the whole
        // difference between "add the domain" and "the mail server is down".
        let reason = sendErr?.message ?? "unknown error";
        const ctx = (sendErr as { context?: Response } | null)?.context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json() as {
              blocked_by_allowlist?: boolean; error?: string; how_to_change?: string;
            };
            if (body?.blocked_by_allowlist) {
              reason = `${body.error ?? "Recipient is outside this instance's email allowlist."} ${body.how_to_change ?? ""}`.trim();
            } else if (body?.error) {
              reason = body.error;
            }
          } catch { /* body was not JSON — keep the transport message */ }
        }
        mailProblem = simulated
          ? "No email provider is configured — enable Resend or Composio under Integrations, or use Create user instead."
          : reason;
      }
    }

    // Reconcile roles: grant exactly the chosen role, clear anything the
    // trigger seeded (customer) — but NEVER strip admin from an existing user,
    // and never touch roles when granting to someone who already has others;
    // an admin adding a role to a colleague should not silently remove theirs.
    await admin.from("user_roles").upsert(
      { user_id: userId, role },
      { onConflict: "user_id,role" },
    );
    if (status !== "granted_existing") {
      // Fresh invite (mail sent or not): the only pre-existing role is the
      // trigger's customer seed. Remove it so the colleague is born as
      // exactly their function.
      await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "customer");
    }

    await admin.from("audit_logs").insert({
      action: "invite_colleague",
      entity_type: "user",
      entity_id: userId,
      user_id: userData.user.id,
      metadata: { email: cleanEmail, role, status },
    });

    return json({
      success: true,
      user_id: userId,
      role,
      status,
      // Only present when the mail did not go out — the admin can pass the
      // link on manually rather than the colleague waiting for nothing.
      ...(mailProblem ? { reason: mailProblem, action_link: actionLink } : {}),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

// deno-lint-ignore no-explicit-any
function inviterName(user: any): string {
  return (user?.user_metadata?.full_name as string) || (user?.email as string) || "An administrator";
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Administrator", sales: "Sales", hr: "HR", accounting: "Accounting",
    support: "Support", warehouse: "Warehouse", marketing: "Marketing",
    purchasing: "Purchasing", projects: "Projects",
  };
  return labels[role] ?? role;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
