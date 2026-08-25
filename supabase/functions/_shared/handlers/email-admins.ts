// email_admins — platform primitive: deliver one message to every instance
// admin, resolved AT SEND TIME from user_roles (never a hardcoded list).
//
// Born 2026-08-25 from the booking walk-through: a visitor booked, an admin
// confirmed, and no human was ever notified at any step. The event lane
// (emit_platform_event → event-dispatcher → automations) already existed;
// what was missing was a delivery skill any automation can point at. This is
// deliberately module-agnostic — 'booking.created → email_admins' is one seed
// row, and every future event gets the same option for free.
//
// Routes through email-send (provider-agnostic, allowlist-guarded, logged to
// outbound_communications) — never a provider directly. On pilot instances the
// allowlist withholds non-listed admin addresses and the refusal is LOGGED,
// which is the trace the booking incident lacked.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';

export async function handleEmailAdmins(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const subject = typeof args.subject === 'string' ? args.subject.trim() : '';
  const html = typeof args.html === 'string' ? args.html : '';
  const source = typeof args.source === 'string' && args.source ? args.source : 'email_admins';
  if (!subject || !html) {
    return { error: 'subject and html are required (strings). email_admins delivers a finished message — compose it before calling.' };
  }

  // Admins from the role table — the matrix is the only dial (rollsvepet #102).
  const { data: roleRows, error: roleErr } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');
  if (roleErr) return { error: `Could not read user_roles: ${roleErr.message}` };
  const adminIds = new Set((roleRows ?? []).map((r: any) => r.user_id));
  if (adminIds.size === 0) {
    return { sent: 0, blocked: 0, failed: 0, note: 'No admin users on this instance — nothing to deliver to.' };
  }

  // Emails via the auth admin API (service context) — auth schema is not
  // reachable over PostgREST, and this is the supported read.
  const { data: usersPage, error: usersErr } = await (supabase.auth as any).admin.listUsers({ page: 1, perPage: 200 });
  if (usersErr) return { error: `Could not list users: ${usersErr.message}` };
  const recipients = [...new Set(
    (usersPage?.users ?? [])
      .filter((u: any) => adminIds.has(u.id) && typeof u.email === 'string' && u.email)
      .map((u: any) => u.email as string),
  )];
  if (recipients.length === 0) {
    return { sent: 0, blocked: 0, failed: 0, note: 'Admin role rows exist but no matching auth users with email.' };
  }

  // One call per recipient (send_email's own convention), outcomes kept apart:
  // 'blocked' is the allowlist doing its job and must never be reported as
  // failure — nor as success. Silence between those two is how the booking
  // confirmation vanished.
  let sent = 0, blocked = 0, failed = 0;
  const detail: Array<Record<string, unknown>> = [];
  for (const to of recipients) {
    try {
      const { data, error } = await supabase.functions.invoke('email-send', {
        body: { to, subject, html, tags: { source } },
      });
      if (error) {
        // 422 = allowlist withheld (blocked_by_allowlist in the body).
        const ctx = (error as any)?.context;
        const status = ctx?.status ?? 0;
        if (status === 422) { blocked += 1; detail.push({ to, outcome: 'blocked_by_allowlist' }); }
        else { failed += 1; detail.push({ to, outcome: 'failed', error: String((error as any)?.message ?? error).slice(0, 160) }); }
      } else {
        sent += 1; detail.push({ to, outcome: (data as any)?.simulated ? 'simulated' : 'sent' });
      }
    } catch (e) {
      failed += 1; detail.push({ to, outcome: 'failed', error: String((e as Error)?.message ?? e).slice(0, 160) });
    }
  }
  return { sent, blocked, failed, recipients: recipients.length, detail };
}
