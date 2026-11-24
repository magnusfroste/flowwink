// provision-portal-account — give a customer a way into their portal.
//
// A signed contract mints a service, but the customer signs ANONYMOUSLY via a
// token and has no login — so the service they now own is unreachable. This
// bridges that: create (or find) the customer's portal account and email them
// a branded invite to set a password. Reusable — a paid order or a new
// subscription can call it the same way.
//
// Distinct from customer-signup (self-service, needs allowSelfSignup) and from
// invite-colleague (staff, functional roles): this is operator-initiated for a
// CUSTOMER, gated only on the portal being enabled at all.
//
// Never throws. The caller's real work (signing, ordering) already succeeded;
// a portal invite that failed is a follow-up, not a rollback.
import { loadEmailShell } from "./email-shell.ts";
import { resolveUiText } from "./locale/ui-text.ts";
import { loadUiText } from "./locale/load-ui-text.ts";

export interface ProvisionResult {
  status: "invited" | "existing" | "portal_disabled" | "invited_no_mail" | "error";
  user_id?: string;
  action_link?: string;
  reason?: string;
}

const escapeHtml = (s: string): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

type AccountLister = {
  auth: { admin: { listUsers(o: { page: number; perPage: number }): Promise<{ data: { users?: Array<{ id: string; email?: string | null }> } | null; error: unknown }> } };
};

/** The account id for an address; null when there is none, undefined when the look-up failed. */
async function findAccount(admin: AccountLister, email: string): Promise<string | null | undefined> {
  // Every page, not the first 200: past that an existing customer was not
  // found and the invite failed with "already registered".
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return undefined;
    const users = data?.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

export async function provisionPortalAccount(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: {
    email: string;
    name?: string | null;
    /** siteUrl origin for the redirect + link; falls back inside. */
    siteUrl?: string | null;
    /** What they now have — shapes the invite copy ("your service", "your order"). */
    subjectNoun?: string;
  },
): Promise<ProvisionResult> {
  const email = (opts.email ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", reason: "No valid customer email on the record." };
  }

  // The portal must be enabled for an invite to it to make sense. This does
  // NOT require allowSelfSignup — the operator initiated it, not the visitor.
  const { data: portalRow } = await admin
    .from("site_settings").select("value").eq("key", "customer_portal").maybeSingle();
  const portalEnabled = (portalRow?.value as { enabled?: boolean } | null)?.enabled ?? true;
  if (!portalEnabled) return { status: "portal_disabled" };

  // Already has an account — ensure the customer role, do not re-invite.
  const existingAccount = async (): Promise<ProvisionResult | null> => {
    const found = await findAccount(admin, email);
    if (found === undefined) return { status: "error", reason: "Could not look up accounts." };
    if (!found) return null;
    await admin.from("user_roles")
      .upsert({ user_id: found, role: "customer" }, { onConflict: "user_id,role" });
    return { status: "existing", user_id: found };
  };
  const already = await existingAccount();
  if (already) return already;

  const siteUrl = (opts.siteUrl ?? "").replace(/\/+$/, "");
  // Land the invite on the activation page, not /account. /account bounces an
  // unauthenticated visitor to the login form — where they could sign up with
  // the WRONG email and orphan this invited account. /account/activate reads
  // the bound email from the invite session and only asks for a password.
  const redirectTo = siteUrl ? `${siteUrl}/account/activate` : undefined;
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: opts.name || email, signup_type: "customer" }, redirectTo },
  });
  if (linkErr || !linkData?.user) {
    // Two callers for one address at once (a contract signed while a service
    // is created): the other one made the account between our look-up and
    // this call. That is an account, not a failure.
    const raced = await existingAccount();
    if (raced && raced.status === "existing") return raced;
    return { status: "error", reason: linkErr?.message ?? "Could not create the portal account." };
  }
  const userId = linkData.user.id as string;
  await admin.from("user_roles")
    .upsert({ user_id: userId, role: "customer" }, { onConflict: "user_id,role" });

  const actionLink = (linkData.properties as { action_link?: string } | undefined)?.action_link;
  const shell = await loadEmailShell(admin);
  const org = shell.organizationName || "us";
  // Whole sentences per kind, in the site's language: "Your ${noun} with" cannot be translated.
  const uiTexts = await loadUiText(admin);
  const t = resolveUiText(uiTexts.map, uiTexts.siteLang, uiTexts.siteLang);
  const aService = opts.subjectNoun === "service";
  const heading = (aService
    ? t('portal.invite.serviceReady', 'Your service with {business} is ready')
    : t('portal.invite.accountReady', 'Your account with {business} is ready')).replace('{business}', org);
  const subject = (aService
    ? t('portal.invite.serviceSubject', 'Access your service with {business}')
    : t('portal.invite.accountSubject', 'Access your account with {business}')).replace('{business}', org);
  // Fragment — email-send wraps it in the operator's branded shell.
  const html = `
    <h2 style="margin:0 0 12px;font-size:20px;">${escapeHtml(heading)}</h2>
    <p>${escapeHtml(t('portal.invite.body', 'Set a password to sign in and manage it in your account portal.'))}</p>
    <p style="margin:24px 0;">
      <a href="${actionLink}" style="display:inline-block;padding:12px 24px;background-color:${shell.primaryHex};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">${escapeHtml(t('portal.invite.button', 'Set your password'))}</a>
    </p>
    <p style="color:#666666;font-size:13px;">${escapeHtml(t('portal.invite.ignore', 'If you did not expect this, you can ignore this email.'))}</p>
  `;

  const { data: sendData, error: sendErr } = await admin.functions.invoke("email-send", {
    body: {
      to: email,
      subject,
      html,
      source: "portal-invite",
      tags: { source: "portal-invite" },
    },
  });
  const simulated = Boolean((sendData as { simulated?: boolean } | null)?.simulated);
  const mailed = !sendErr && Boolean((sendData as { success?: boolean } | null)?.success) && !simulated;
  if (!mailed) {
    return {
      status: "invited_no_mail",
      user_id: userId,
      action_link: actionLink,
      reason: simulated
        ? "No email provider is configured — the portal account exists; send the link manually."
        : `Email failed: ${sendErr?.message ?? "unknown error"}`,
    };
  }
  return { status: "invited", user_id: userId };
}
