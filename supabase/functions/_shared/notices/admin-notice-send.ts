// Loading and delivering an admin notice (the words are admin-notice.ts).
//
// The site's language, the business's clock, the site's own origin for the
// link, the trading name for the footer — then email_admins' delivery, which
// resolves the admins from user_roles at send time.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { homeFormat } from '../locale/home.ts';
import { loadHome } from '../locale/load-home.ts';
import { resolveUiText } from '../locale/ui-text.ts';
import { loadUiText } from '../locale/load-ui-text.ts';
import { loadOrgName } from '../org-name.ts';
import { deliverToAdmins } from './deliver-to-admins.ts';
import { type AdminNoticeContext, type AdminNoticeInput, type BookingFacts, renderAdminNotice } from './admin-notice.ts';

export async function loadAdminNoticeContext(supabase: SupabaseClient): Promise<AdminNoticeContext & { lang: string }> {
  const [texts, home, business, general] = await Promise.all([
    loadUiText(supabase),
    loadHome(supabase),
    loadOrgName(supabase, ''),
    supabase.from('site_settings').select('value').eq('key', 'general').maybeSingle(),
  ]);
  const lang = texts.siteLang;
  const raw = String((general.data?.value as { siteUrl?: string } | null)?.siteUrl ?? '').trim().replace(/\/+$/, '');
  const siteUrl = /^https?:\/\//i.test(raw) ? raw : '';
  return { lang, t: resolveUiText(texts.map, lang, lang), f: homeFormat(home, lang, { audience: 'admin' }), siteUrl, business };
}

/** The booking as it is now — the event's copy is only the moment it was raised. */
export async function loadBookingFacts(
  supabase: SupabaseClient,
  bookingId: string,
  extra: { previous_start_time?: string | null; reason?: string | null } = {},
): Promise<BookingFacts | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('customer_name, customer_email, start_time, end_time, status, cancelled_reason, service:booking_services(name)')
    .eq('id', bookingId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    customer_name: string | null; customer_email: string | null; start_time: string; end_time: string | null;
    status: string | null; cancelled_reason: string | null; service: { name: string | null } | null;
  };
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() && !v.includes('{{') ? v.trim() : null);
  return {
    customer_name: row.customer_name ?? null,
    customer_email: row.customer_email ?? null,
    start_time: row.start_time,
    end_time: row.end_time ?? null,
    status: row.status ?? null,
    service_name: row.service?.name ?? null,
    previous_start_time: clean(extra.previous_start_time),
    reason: clean(extra.reason) ?? clean(row.cancelled_reason),
  };
}

// `client: unknown` — the signing functions pin an older supabase-js than the
// shared code; the notice needs only from() and functions.invoke().
export async function sendAdminNotice(
  client: unknown,
  input: AdminNoticeInput,
  source: string,
): Promise<Record<string, unknown>> {
  const supabase = client as SupabaseClient;
  const ctx = await loadAdminNoticeContext(supabase);
  const { subject, html } = renderAdminNotice(input, ctx);
  return deliverToAdmins(supabase, subject, html, source);
}
