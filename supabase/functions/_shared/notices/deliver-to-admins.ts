// The delivery half of email_admins: one finished message to every admin,
// resolved from user_roles at send time (moved here 2026-11-20 so the notice
// renderer and the skill share it without importing each other).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';

export async function deliverToAdmins(
  supabase: SupabaseClient,
  subject: string,
  html: string,
  source: string,
): Promise<Record<string, unknown>> {

  // Admins from the role table — the matrix is the only dial (rollsvepet #102).
  const { data: roleRows, error: roleErr } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');
  if (roleErr) return { error: `Could not read user_roles: ${roleErr.message}` };
  const adminIds = new Set((roleRows ?? []).map((r: { user_id: string }) => r.user_id));
  if (adminIds.size === 0) {
    return { sent: 0, blocked: 0, failed: 0, note: 'No admin users on this instance — nothing to deliver to.' };
  }

  // Emails via the auth admin API (service context) — auth schema is not
  // reachable over PostgREST, and this is the supported read.
  const { data: usersPage, error: usersErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (usersErr) return { error: `Could not list users: ${usersErr.message}` };
  const recipients = [...new Set(
    (usersPage?.users ?? [])
      .filter((u: { id: string; email?: string }) => adminIds.has(u.id) && typeof u.email === 'string' && u.email)
      .map((u: { email?: string }) => u.email as string),
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
        const ctx = (error as { context?: { status?: number } })?.context;
        const status = ctx?.status ?? 0;
        if (status === 422) { blocked += 1; detail.push({ to, outcome: 'blocked_by_allowlist' }); }
        else { failed += 1; detail.push({ to, outcome: 'failed', error: String((error as { message?: string })?.message ?? error).slice(0, 160) }); }
      } else {
        sent += 1; detail.push({ to, outcome: (data as { simulated?: boolean } | null)?.simulated ? 'simulated' : 'sent' });
      }
    } catch (e) {
      failed += 1; detail.push({ to, outcome: 'failed', error: String((e as Error)?.message ?? e).slice(0, 160) });
    }
  }
  return { sent, blocked, failed, recipients: recipients.length, detail };
}
