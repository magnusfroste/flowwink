// What the business is told when a customer acts — in the site's language.
//
// Until 2026-11-20 every notice to the admins was English whatever the site
// spoke: "New booking: Anna — 2026-12-10T17:00:00+00:00", a raw UTC timestamp
// and a relative "/admin/bookings" link that a mail client cannot open. The
// booking notices were automation arguments with the text written in them; the
// quote and agreement notices were HTML in quote-sign and contract-sign.
//
// One renderer now: the words are visitor texts (`admin.mail.*`, Swedish in
// the platform pack), the times are on the business's clock in the site's
// language, and a link is absolute or absent. Pure — the loading and the
// delivery are admin-notice-send.ts.

import type { HomeFormat } from '../locale/home.ts';
import type { UiText } from '../locale/ui-text.ts';

export type AdminNoticeKind =
  | 'booking.created'
  | 'booking.rescheduled'
  | 'booking.cancelled_by_customer'
  | 'quote.answered'
  | 'contract.answered';

export const ADMIN_NOTICE_KINDS: readonly AdminNoticeKind[] = [
  'booking.created',
  'booking.rescheduled',
  'booking.cancelled_by_customer',
  'quote.answered',
  'contract.answered',
];

export interface BookingFacts {
  customer_name: string | null;
  customer_email: string | null;
  start_time: string;
  end_time: string | null;
  service_name: string | null;
  status: string | null;
  /** booking.rescheduled: the time it was moved from. */
  previous_start_time?: string | null;
  /** booking.cancelled_by_customer: what the customer wrote. */
  reason?: string | null;
}

export interface QuoteFacts {
  quote_number: string;
  accepted: boolean;
  signer_name: string;
  signer_email: string;
  /** Already formatted in the site's language. */
  total: string;
  comment?: string | null;
  invoice_number?: string | null;
}

export interface ContractFacts {
  title: string;
  signed: boolean;
  counterparty_name: string | null;
  signer_name: string;
  signer_email: string;
  comment?: string | null;
}

export type AdminNoticeInput =
  | { kind: 'booking.created' | 'booking.rescheduled' | 'booking.cancelled_by_customer'; booking: BookingFacts }
  | { kind: 'quote.answered'; quote: QuoteFacts }
  | { kind: 'contract.answered'; contract: ContractFacts };

export interface AdminNoticeContext {
  t: UiText;
  f: HomeFormat;
  /** The site's own origin, no trailing slash; '' when the site does not say. */
  siteUrl: string;
  business: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

/** "torsdag 10 december 2026 18:00–18:30" on the business's clock. */
function when(f: HomeFormat, start: string, end?: string | null): string {
  const day = f.dateTime(start, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const from = f.time(start);
  const to = end ? f.time(end) : '';
  return to ? `${day} ${from}–${to}` : `${day} ${from}`;
}

function shell(heading: string, rows: string[], link: { href: string; label: string } | null, footer: string): string {
  const body = rows.filter(Boolean).map((r) => `<p style="margin:0 0 10px">${r}</p>`).join('\n');
  const button = link
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link.href)}" style="color:#2563eb">${escapeHtml(link.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#111">
<h2 style="margin:0 0 16px;font-size:18px">${escapeHtml(heading)}</h2>
${body}
${button}
<p style="margin:24px 0 0;font-size:12px;color:#9ca3af">${escapeHtml(footer)}</p>
</body></html>`;
}

function strong(s: string): string {
  return `<strong>${escapeHtml(s)}</strong>`;
}

export function renderAdminNotice(input: AdminNoticeInput, ctx: AdminNoticeContext): { subject: string; html: string } {
  const { t, f, siteUrl } = ctx;
  const footer = fill(t('admin.mail.footer', 'Sent by {business} to its administrators.'), { business: ctx.business });
  const linkTo = (path: string, label: string) => (siteUrl ? { href: `${siteUrl}${path}`, label } : null);

  if (input.kind === 'quote.answered') {
    const q = input.quote;
    const v = { number: q.quote_number, name: q.signer_name, email: q.signer_email, total: q.total, invoice: q.invoice_number ?? '' };
    const subject = q.accepted
      ? fill(t('admin.mail.quoteAcceptedSubject', 'Quote {number} accepted by {name}'), v)
      : fill(t('admin.mail.quoteRejectedSubject', 'Quote {number} declined by {name}'), v);
    const rows = [
      `${escapeHtml(t('admin.mail.signer', 'Answered by'))}: ${strong(q.signer_name)} (${escapeHtml(q.signer_email)})`,
      `${escapeHtml(t('admin.mail.total', 'Total'))}: ${strong(q.total)}`,
      q.comment ? `${escapeHtml(t('admin.mail.comment', 'Their message'))}: ${escapeHtml(q.comment)}` : '',
      q.invoice_number ? escapeHtml(fill(t('admin.mail.quoteInvoiceDraft', 'Invoice {invoice} was created as a draft — check it and send it.'), v)) : '',
    ];
    return { subject, html: shell(subject, rows, linkTo('/admin/quotes', t('admin.mail.openQuotes', 'Open quotes')), footer) };
  }

  if (input.kind === 'contract.answered') {
    const c = input.contract;
    const v = { title: c.title, name: c.signer_name };
    const subject = c.signed
      ? fill(t('admin.mail.contractSignedSubject', 'Agreement signed: {title}'), v)
      : fill(t('admin.mail.contractDeclinedSubject', 'Agreement declined: {title}'), v);
    const rows = [
      c.counterparty_name ? `${escapeHtml(t('admin.mail.counterparty', 'Counterparty'))}: ${strong(c.counterparty_name)}` : '',
      `${escapeHtml(t('admin.mail.signer', 'Answered by'))}: ${strong(c.signer_name)} (${escapeHtml(c.signer_email)})`,
      c.comment ? `${escapeHtml(t('admin.mail.comment', 'Their message'))}: ${escapeHtml(c.comment)}` : '',
    ];
    return { subject, html: shell(subject, rows, linkTo('/admin/contracts', t('admin.mail.openContracts', 'Open agreements')), footer) };
  }

  const b = input.booking;
  const name = b.customer_name || b.customer_email || t('admin.mail.someone', 'A customer');
  const slot = when(f, b.start_time, b.end_time);
  const v = {
    name,
    when: slot,
    day: f.dateTime(b.start_time, { day: 'numeric', month: 'short' }),
    time: f.time(b.start_time),
    service: b.service_name ?? '',
    previous: b.previous_start_time ? when(f, b.previous_start_time) : '',
  };
  const who = `${strong(name)}${b.customer_email && b.customer_email !== name ? ` (${escapeHtml(b.customer_email)})` : ''}`;
  const service = b.service_name ? `${escapeHtml(t('admin.mail.service', 'Service'))}: ${escapeHtml(b.service_name)}` : '';
  const link = linkTo('/admin/bookings', t('admin.mail.openBookings', 'Open bookings'));

  if (input.kind === 'booking.rescheduled') {
    const subject = fill(t('admin.mail.bookingMovedSubject', 'Booking moved: {name} — {day} {time}'), v);
    const rows = [
      `${who} ${escapeHtml(t('admin.mail.bookingMovedLead', 'moved their booking.'))}`,
      v.previous ? `${escapeHtml(t('admin.mail.from', 'From'))}: ${escapeHtml(v.previous)}` : '',
      `${escapeHtml(t('admin.mail.to', 'To'))}: ${strong(slot)}`,
      service,
    ];
    return { subject, html: shell(subject, rows, link, footer) };
  }

  if (input.kind === 'booking.cancelled_by_customer') {
    const subject = fill(t('admin.mail.bookingCancelledSubject', 'Booking cancelled by the customer: {name} — {day} {time}'), v);
    const rows = [
      `${who} ${escapeHtml(t('admin.mail.bookingCancelledLead', 'cancelled their booking. The time is free again.'))}`,
      `${escapeHtml(t('admin.mail.when', 'When'))}: ${strong(slot)}`,
      service,
      b.reason ? `${escapeHtml(t('admin.mail.comment', 'Their message'))}: ${escapeHtml(b.reason)}` : '',
    ];
    return { subject, html: shell(subject, rows, link, footer) };
  }

  const subject = fill(t('admin.mail.bookingNewSubject', 'New booking: {name} — {day} {time}'), v);
  const rows = [
    `${who} ${escapeHtml(t('admin.mail.bookingNewLead', 'booked a time.'))}`,
    `${escapeHtml(t('admin.mail.when', 'When'))}: ${strong(slot)}`,
    service,
    b.status === 'pending' ? escapeHtml(t('admin.mail.bookingPending', 'The booking waits for your confirmation.')) : '',
  ];
  return { subject, html: shell(subject, rows, link, footer) };
}
