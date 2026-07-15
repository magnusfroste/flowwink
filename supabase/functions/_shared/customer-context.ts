/**
 * Customer context for identity-aware chat (conversation-and-retrieval.md,
 * Phase 2 — rung 2 of the identity ladder).
 *
 * SECURITY BOUNDARY: the customer whose account data gets injected is resolved
 * from the VERIFIED user JWT only — never from a client-supplied field. A
 * self-declared `customerEmail` in the request body is rung-1 at most (returning-
 * visitor memory); it must NOT unlock another person's orders/invoices. That is
 * the whole point of the ladder being data-driven, not claim-driven.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge module over dynamic Supabase rows */
import { getUserClient } from './supabase-clients.ts';

export interface AuthenticatedCustomer {
  email: string;
  userId: string;
}

/**
 * Resolve the authenticated customer from the request's Authorization header.
 * Returns null when the bearer is the anonymous/publishable key, absent, or an
 * invalid/expired token — i.e. anything that isn't a verified logged-in user.
 */
export async function resolveAuthenticatedCustomer(
  authHeader: string | null,
  anonKey: string,
): Promise<AuthenticatedCustomer | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  // The public chat path sends the anon key here — that is NOT a user.
  if (!token || token === anonKey) return null;

  try {
    const userClient = getUserClient(authHeader);
    if (!userClient) return null;
    const { data, error } = await userClient.auth.getClaims(token);
    const claims: any = data?.claims;
    if (error || !claims) return null;
    const email = (claims.email ?? '').toString().toLowerCase().trim();
    const userId = (claims.sub ?? '').toString();
    if (!email || !userId) return null;
    return { email, userId };
  } catch {
    return null;
  }
}

// ─── Identity ladder rung 3 (B2B) ─────────────────────────────────────────────

export interface CompanyMembership {
  companyId: string;
  companyRole: 'viewer' | 'buyer' | 'approver' | 'admin';
  visibilityScope: 'company' | 'company_plus_subsidiaries';
}

export interface CompanyContext {
  userId: string;
  email: string;
  memberships: CompanyMembership[];
  /** The company this turn acts for: the sole membership, or an explicitly
   *  requested one the user actually belongs to. Null until chosen when >1. */
  activeCompanyId: string | null;
  activeRole: CompanyMembership['companyRole'] | null;
}

/**
 * Resolve the signed-in B2B contact's company memberships (identity ladder
 * rung 3). SAME security boundary as rung 2: the user is resolved from the
 * VERIFIED JWT, then memberships are read from `company_contacts` for that
 * user id only. A requested company is honoured ONLY if the user is actually a
 * member of it — a client can never force a company it doesn't belong to.
 * Returns null for anon/invalid; a context with empty memberships for a
 * verified user who is not a B2B contact.
 */
export async function resolveCompanyMembership(
  admin: any,
  authHeader: string | null,
  anonKey: string,
  requestedCompanyId?: string | null,
): Promise<CompanyContext | null> {
  const customer = await resolveAuthenticatedCustomer(authHeader, anonKey);
  if (!customer) return null;

  const { data } = await admin
    .from('company_contacts')
    .select('company_id, company_role, visibility_scope')
    .eq('auth_user_id', customer.userId)
    .eq('status', 'active');

  const memberships: CompanyMembership[] = (data ?? []).map((r: any) => ({
    companyId: r.company_id,
    companyRole: r.company_role,
    visibilityScope: r.visibility_scope,
  }));

  let activeCompanyId: string | null = null;
  if (requestedCompanyId && memberships.some((m) => m.companyId === requestedCompanyId)) {
    activeCompanyId = requestedCompanyId; // honoured only because they're a member
  } else if (memberships.length === 1) {
    activeCompanyId = memberships[0].companyId; // sole membership → auto-active
  } // >1 and none requested → null (the conversation must pick one; never guess)

  const activeRole = activeCompanyId
    ? memberships.find((m) => m.companyId === activeCompanyId)!.companyRole
    : null;

  return { userId: customer.userId, email: customer.email, memberships, activeCompanyId, activeRole };
}

const money = (cents: number | null | undefined, ccy?: string | null) =>
  `${((cents ?? 0) / 100).toFixed(0)}${ccy ? ' ' + ccy : ''}`;

/**
 * Build a compact, prompt-ready summary of the customer's OWN account —
 * recent orders, unpaid invoices, active subscriptions, open tickets, upcoming
 * bookings. Reads with the service client (`admin`) but ONLY for the given
 * verified email. Returns '' when there's nothing to say.
 */
export async function buildCustomerContext(admin: any, email: string): Promise<string> {
  const e = email.toLowerCase().trim();
  if (!e) return '';

  const [orders, invoices, subs, tickets, bookings] = await Promise.all([
    admin.from('orders')
      .select('id, total_cents, currency, status, fulfillment_status, created_at')
      .eq('customer_email', e).order('created_at', { ascending: false }).limit(5),
    admin.from('invoices')
      .select('invoice_number, total_cents, currency, status, due_date')
      .eq('customer_email', e).neq('status', 'paid').order('due_date', { ascending: true }).limit(5),
    admin.from('subscriptions')
      .select('product_name, status, current_period_end')
      .eq('customer_email', e).eq('status', 'active').limit(5),
    admin.from('tickets')
      .select('subject, status, priority, created_at')
      .eq('contact_email', e).neq('status', 'closed').order('created_at', { ascending: false }).limit(5),
    admin.from('bookings')
      .select('service_id, start_time, status')
      .eq('customer_email', e).gte('start_time', new Date().toISOString()).order('start_time', { ascending: true }).limit(5),
  ]);

  const sections: string[] = [];
  const o = orders.data ?? [];
  if (o.length) {
    sections.push('Recent orders:\n' + o.map((r: any) =>
      `- Order ${String(r.id).slice(0, 8)}: ${money(r.total_cents, r.currency)}, status ${r.status}${r.fulfillment_status ? ` / ${r.fulfillment_status}` : ''}`).join('\n'));
  }
  const inv = invoices.data ?? [];
  if (inv.length) {
    sections.push('Unpaid invoices:\n' + inv.map((r: any) =>
      `- ${r.invoice_number || '(invoice)'}: ${money(r.total_cents, r.currency)}, status ${r.status}${r.due_date ? `, due ${r.due_date}` : ''}`).join('\n'));
  }
  const s = subs.data ?? [];
  if (s.length) {
    sections.push('Active subscriptions:\n' + s.map((r: any) =>
      `- ${r.product_name || '(plan)'}${r.current_period_end ? `, renews ${String(r.current_period_end).slice(0, 10)}` : ''}`).join('\n'));
  }
  const t = tickets.data ?? [];
  if (t.length) {
    sections.push('Open support tickets:\n' + t.map((r: any) =>
      `- ${r.subject || '(ticket)'} [${r.status}${r.priority ? `, ${r.priority}` : ''}]`).join('\n'));
  }
  const b = bookings.data ?? [];
  if (b.length) {
    sections.push('Upcoming bookings:\n' + b.map((r: any) =>
      `- Booking at ${String(r.start_time).slice(0, 16)} [${r.status}]`).join('\n'));
  }

  if (!sections.length) return '';
  return `\n\n=== AUTHENTICATED CUSTOMER ACCOUNT (this is the signed-in customer's OWN data — you may share it with them; never reveal anyone else's) ===\nCustomer: ${e}\n${sections.join('\n\n')}`;
}
