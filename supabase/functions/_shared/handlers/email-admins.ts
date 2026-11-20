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
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { deliverToAdmins } from '../notices/deliver-to-admins.ts';
import { ADMIN_NOTICE_KINDS, type AdminNoticeKind } from '../notices/admin-notice.ts';
import { loadBookingFacts, sendAdminNotice } from '../notices/admin-notice-send.ts';

// A notice (2026-11-20): `notice` names what happened and the skill writes the
// message itself, in the site's language, on the business's clock, with an
// absolute link — the booking automations pass `notice` + `booking_id`. An
// agent with its own words still passes subject + html.
export async function handleEmailAdmins(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const source = typeof args.source === 'string' && args.source ? args.source : 'email_admins';
  const notice = typeof args.notice === 'string' ? args.notice : '';
  if (notice) {
    if (!(ADMIN_NOTICE_KINDS as readonly string[]).includes(notice) || !notice.startsWith('booking.')) {
      return { error: `Unknown notice "${notice}". email_admins writes: booking.created, booking.rescheduled, booking.cancelled_by_customer — or pass subject + html.`, code: 'INVALID_INPUT' };
    }
    const bookingId = typeof args.booking_id === 'string' ? args.booking_id : '';
    if (!bookingId) return { error: 'A booking notice needs booking_id.', code: 'MISSING_REQUIRED_PARAMETER' };
    const booking = await loadBookingFacts(supabase, bookingId, {
      previous_start_time: typeof args.previous_start_time === 'string' ? args.previous_start_time : null,
      reason: typeof args.reason === 'string' ? args.reason : null,
    });
    if (!booking) return { error: `No booking ${bookingId}.`, code: 'NOT_FOUND' };
    return sendAdminNotice(supabase, { kind: notice as Extract<AdminNoticeKind, `booking.${string}`>, booking }, source);
  }
  const subject = typeof args.subject === 'string' ? args.subject.trim() : '';
  const html = typeof args.html === 'string' ? args.html : '';
  if (!subject || !html) {
    return { error: 'subject and html are required (strings), or a notice. email_admins delivers a finished message — compose it before calling.' };
  }
  return deliverToAdmins(supabase, subject, html, source);
}
