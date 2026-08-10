import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FUNCTIONAL_ROLES } from '@/types/cms';

/**
 * Colleagues are invited by email with a functional role from the first
 * sign-in — the gap between create-user (right role, you set the password)
 * and invite-employee (real email, wrong role). The invitable list lives in
 * two places (the edge function's INVITABLE_ROLES and the dialog's INVITABLE)
 * and MUST equal admin + FUNCTIONAL_ROLES, or an admin picks a role the
 * backend then rejects — or worse, grants a role no page gates on.
 */

const fn = readFileSync(
  resolve(__dirname, '../../../supabase/functions/invite-colleague/index.ts'),
  'utf-8',
);
const dialog = readFileSync(
  resolve(__dirname, '../../components/admin/InviteColleagueDialog.tsx'),
  'utf-8',
);

describe('the invitable roles match the source of truth', () => {
  it('the edge function lists exactly admin + FUNCTIONAL_ROLES', () => {
    const block = fn.slice(fn.indexOf('INVITABLE_ROLES ='), fn.indexOf('];', fn.indexOf('INVITABLE_ROLES =')));
    for (const r of ['admin', ...FUNCTIONAL_ROLES]) {
      expect(block).toContain(`"${r}"`);
    }
    // No customer, no legacy writer/approver in the invite path.
    expect(block).not.toContain('"customer"');
    expect(block).not.toContain('"writer"');
    expect(block).not.toContain('"approver"');
  });

  it('the dialog builds its list from FUNCTIONAL_ROLES, not a hardcoded copy', () => {
    // Using the constant means the dialog cannot drift when a role is added.
    expect(dialog).toMatch(/\[\s*'admin'\s*,\s*\.\.\.FUNCTIONAL_ROLES\s*\]/);
  });
});

describe('the backend gates and reconciles correctly', () => {
  it('requires admin', () => {
    expect(fn).toMatch(/_role:\s*"admin"/);
    expect(fn).toContain('Admin role required');
  });

  it('mails through the platform router, not the provider or Supabase', () => {
    // generateLink creates the user + token and sends NOTHING, so the mail
    // goes out via email-send (Composio/SMTP/Resend) with the operator's
    // verified domain and branded shell. inviteUserByEmail would use
    // Supabase's shared sender: wrong domain, unbranded, and a couple-per-hour
    // cap that silently drops the third invite.
    const code = fn.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).toContain('generateLink');
    expect(code).not.toContain('inviteUserByEmail');
    expect(code).toMatch(/invoke\("email-send"/);
    // And never sets a password — that is Create user's job.
    expect(code).not.toMatch(/createUser\(/);
    expect(code).not.toMatch(/password:/);
  });

  it('the invite body is a fragment so the branded shell applies', () => {
    const code = fn.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const html = code.slice(code.indexOf('const html = `'), code.indexOf('invoke("email-send"'));
    expect(html).not.toMatch(/<!doctype|<html[\s>]|<body[\s>]/i);
  });

  it('reports honestly when no mail went out', () => {
    // email-send answers success with simulated=true when NO provider is
    // configured. Treating that as "invitation sent" would leave a colleague
    // waiting for an email that never existed.
    const code = fn.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).toMatch(/simulated/);
    expect(code).toContain('invited_no_mail');
    expect(code).toMatch(/action_link/);
  });

  it('grants the role even when the mail fails', () => {
    // The account exists either way; an account without its role is worse
    // than an account without its email. Reconciliation must not sit behind
    // an early return in the mail branch.
    const code = fn.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const upsertAt = code.indexOf('user_roles").upsert');
    // Anchor inside the INVITE branch: the reset branch also sends mail, and
    // it returns early by design (it grants no role and has none to reconcile).
    const inviteAt = code.indexOf('type: "invite"');
    const mailAt = code.indexOf('invoke("email-send"', inviteAt);
    expect(upsertAt).toBeGreaterThan(mailAt); // reconciliation comes after, unconditionally
    const mailBranch = code.slice(mailAt, upsertAt);
    expect(mailBranch).not.toMatch(/return json/);
  });

  it('removes the trigger-seeded customer role on a fresh invite', () => {
    // Otherwise the colleague holds customer AND their function, and the
    // panel would show "Customer" (oldest row) — the bug we just fixed.
    const block = fn.slice(fn.indexOf('Reconcile roles'), fn.indexOf('audit_logs'));
    expect(block).toMatch(/delete\(\)[\s\S]*eq\("role", "customer"\)/);
  });

  it('does not strip roles when granting to an existing account', () => {
    // An admin adding a role to a colleague must not silently remove theirs —
    // the customer cleanup runs for fresh invites only.
    const code = fn.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const cleanupAt = code.indexOf('eq("role", "customer")');
    expect(cleanupAt).toBeGreaterThan(-1);
    const guard = code.slice(code.lastIndexOf('if (', cleanupAt), cleanupAt);
    expect(guard).toMatch(/status !== "granted_existing"|status === "invited"/);
  });
});

describe('an invitation lands on the password step, not past it', () => {
  /**
   * Two colleagues were invited and walked straight into the dashboard with a
   * live session and no password ever set. The verify-link pointed at /admin,
   * so the activation screen — which exists, and is the only place that calls
   * updateUser({password}) on an invited account — was simply never reached.
   *
   * The consequences are both ways round: they could not sign in a second time,
   * and anyone holding a forwarded copy of that link was equally admitted.
   */
  it('sends the invite to the activation screen, carrying where to go after', () => {
    expect(fn).toMatch(/\/account\/activate\?next=\/admin/);
    expect(fn).not.toMatch(/const redirectTo = `\$\{siteUrl\}\/admin`/);
  });

  it('resolves the site URL ONE way for every link it makes', () => {
    // The reset branch arrived with its own resolver reading a different
    // source. Two ways to answer the same question in one file is how the
    // answers drift.
    expect((fn.match(/async function resolveSiteUrl/g) ?? []).length).toBe(1);
    expect((fn.match(/await resolveSiteUrl\(admin, req\)/g) ?? []).length).toBe(2);
  });
});

describe('an admin can hand a colleague a way back in', () => {
  it('offers a password reset, because re-inviting an existing user mails nothing', () => {
    expect(fn).toMatch(/action === "reset_password"/);
    expect(fn).toMatch(/type: "recovery"/);
    expect(fn).toMatch(/No account for \$\{cleanEmail\}\. Invite them first\./);
  });

  it('sends it through the operator’s own rail, like the invitation', () => {
    expect(fn).toMatch(/source: "colleague-password-reset"/);
    const allowlist = readFileSync(
      resolve(__dirname, '../../../supabase/functions/_shared/email-allowlist.ts'), 'utf-8');
    // A reset for a colleague is internal — holding it would be the same false
    // positive that blocked the invitation.
    expect(allowlist).toMatch(/'colleague-password-reset',/);
  });

  it('never claims a send that did not happen', () => {
    expect(fn).toMatch(/status: "reset_no_mail"/);
    expect(fn).toMatch(/blocked_by_allowlist/);
  });
});
