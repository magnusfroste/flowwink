// invite_customer_to_portal — a customer who holds something gets a way in
// (2026-11-24).
//
// A signed contract invited its customer to the portal (contract-sign). A
// service made by hand — the way a service provider without a signing step
// works — invited nobody: on optic three services were born with the
// customer's address, the portal showed them correctly, and no customer had an
// account to see them with. This is that invitation for any record: a
// subscription (the automation on subscription.created), a contact, or an
// address a person names.
//
// One account per address: provisionPortalAccount finds an existing account
// and only makes sure it carries the customer role — it never sends a second
// invitation. A cancelled service invites nobody.
// The executor's own client type (core.ts imports @2): a pinned version here
// is another type, and the executor's call would not typecheck.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { provisionPortalAccount } from '../provision-portal-account.ts';

type Args = {
  subscription_id?: string;
  lead_id?: string;
  email?: string;
  name?: string;
};

export async function handleInviteCustomerToPortal(
  supabase: SupabaseClient,
  args: Args,
  opts: { attended: boolean },
): Promise<Record<string, unknown>> {
  let email = typeof args.email === 'string' ? args.email.trim() : '';
  let name = typeof args.name === 'string' ? args.name.trim() : '';
  let subjectNoun: string | undefined;

  if (args.subscription_id) {
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('id, status, customer_email, customer_name')
      .eq('id', args.subscription_id)
      .maybeSingle();
    if (error) return { success: false, error: `Could not read the subscription: ${error.message}` };
    if (!sub) return { success: false, found: false, error: `No subscription with id ${args.subscription_id}.` };
    if (sub.status === 'canceled') {
      return { status: 'skipped', reason: 'subscription_canceled', hint: 'A cancelled service gives the customer nothing to see.' };
    }
    email = email || String(sub.customer_email ?? '');
    name = name || String(sub.customer_name ?? '');
    subjectNoun = 'service';
  } else if (args.lead_id) {
    const { data: lead, error } = await supabase
      .from('leads').select('id, email, name').eq('id', args.lead_id).maybeSingle();
    if (error) return { success: false, error: `Could not read the contact: ${error.message}` };
    if (!lead) return { success: false, found: false, error: `No contact with id ${args.lead_id}.` };
    email = email || String(lead.email ?? '');
    name = name || String(lead.name ?? '');
  }

  if (!email) {
    return {
      status: 'refused', code: 'INVALID_INPUT', retryable: false,
      hint: 'The record has no e-mail address. Add the customer\'s address to it first, or pass email.',
    };
  }

  const { data: general, error: gErr } = await supabase
    .from('site_settings').select('value').eq('key', 'general').maybeSingle();
  if (gErr) console.error('[portal-invite] could not read the site address:', gErr.message);
  const siteUrl = (general?.value as { siteUrl?: string } | null)?.siteUrl ?? '';

  const result = await provisionPortalAccount(supabase, { email, name, siteUrl, subjectNoun });
  switch (result.status) {
    case 'invited':
      return { success: true, status: 'invited', user_id: result.user_id };
    case 'existing':
      return { success: true, status: 'existing', user_id: result.user_id, hint: 'The address already has an account; it carries the customer role. No mail was sent.' };
    case 'portal_disabled':
      return { status: 'refused', code: 'PORTAL_DISABLED', retryable: false, hint: 'The customer portal is switched off (site setting customer_portal.enabled).' };
    case 'invited_no_mail':
      // The link opens the account: a person at the keyboard may hand it on;
      // it is never written into an unattended run's journal.
      return {
        success: true, status: 'invited_no_mail', user_id: result.user_id, reason: result.reason,
        ...(opts.attended && result.action_link ? { action_link: result.action_link } : {}),
      };
    default:
      return { success: false, error: result.reason ?? 'Could not invite the customer.' };
  }
}
