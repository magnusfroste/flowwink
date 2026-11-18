import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The mail is the process step's, not the browser's (2026-11-17).
 *
 * Read from a battery run: a booking made by an agent left nothing in the mail
 * rail — the confirmation was sent by the page that booked — and
 * send_contract_for_signature issued a link and e-mailed nobody. Both steps
 * were SKIPPED in the battery as "no e-mail provider locally", though a send
 * without a provider is logged as simulated and can be read.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('a booking is confirmed whoever made it', () => {
  const mod = read('src/lib/modules/booking-module.ts');
  const handler = read('supabase/functions/comms-send/booking_confirmation.ts');

  it('an automation answers every booking.created with the confirmation skill', () => {
    const seed = mod.slice(mod.indexOf("name: 'Booking confirmation to the customer'"));
    expect(seed.slice(0, 900)).toMatch(/trigger_config: \{ event: 'booking\.created' \}/);
    expect(seed.slice(0, 900)).toMatch(/skill_name: 'send_booking_confirmation'/);
    expect(seed.slice(0, 900)).toMatch(/booking_id: '\{\{event\.payload\.id\}\}'/);
    expect(read('supabase/functions/comms-send/index.ts')).toMatch(/send_booking_confirmation: 'booking_confirmation'/);
  });

  it('one mail per booking: the stamp is claimed in one statement, before the send', () => {
    const claim = handler.indexOf('.is("confirmation_sent_at", null)');
    expect(claim).toBeGreaterThan(0);
    expect(claim).toBeLessThan(handler.indexOf("functions.invoke('email-send'"));
    expect(handler).toMatch(/reason: "already_confirmed"/);
  });

  it('a claim that sent nothing is released — a disabled setting and a failed send', () => {
    expect((handler.match(/await release\(\);/g) ?? []).length).toBe(2);
    const disabled = handler.slice(handler.indexOf('confirmationEmailEnabled === false'));
    expect(disabled.indexOf('await release();')).toBeLessThan(disabled.indexOf('confirmation_email_disabled'));
  });

  it('a cancelled or past booking is not confirmed by itself — and that is asked before the claim', () => {
    expect(handler).toMatch(/status === 'cancelled' \|\| status === 'no_show' \|\| over/);
    expect(handler.indexOf('"booking_cancelled"')).toBeLessThan(handler.indexOf('.is("confirmation_sent_at", null)'));
  });
});

describe('sending a contract for signature e-mails the counterparty', () => {
  const core = read('supabase/functions/_shared/execute/core.ts');
  const skill = core.slice(core.indexOf("if (skillName === 'send_contract_for_signature')"), core.indexOf("if (skillName === 'get_contract_content')"));

  it('the skill mails the link itself and says whether it did', () => {
    expect(skill).toMatch(/kind: 'contract_email', contract_id: contract\.id, public_url: signingUrl/);
    expect(skill).toMatch(/email_sent: emailSent/);
    expect(skill).toMatch(/email_error: emailError/);
    // A re-send of a pending agreement is a reminder.
    expect(skill).toMatch(/reminder: contract\.status === 'pending_signature'/);
  });

  it('…after the agreement is marked pending, never before', () => {
    expect(skill.indexOf("status: 'pending_signature'")).toBeLessThan(skill.indexOf("kind: 'contract_email'"));
  });
});

describe('the battery reads what the customer got', () => {
  it('no scenario skips a mail step for want of a provider where the rail can be read', () => {
    for (const f of ['book-to-meet', 'sign-to-serve']) {
      const src = read(`scripts/process-battery/scenarios/${f}.ts`);
      expect(src, f).toMatch(/await s\.mail\(/);
      expect(src, f).not.toMatch(/s\.skip\('the (confirmation e-mail reaches the customer|signing link is e-mailed)/);
    }
    expect(read('scripts/process-battery/scenarios/book-to-meet.ts')).toMatch(/s\.pulse\('event-dispatcher'/);
  });
});

describe('the customer sees what the quote is, whose it is and on what terms', () => {
  // Found by opening the mail's link in a browser as the customer (2026-11-17).
  const sql = read('supabase/migrations/20261117120000_kunden-ser-vad-offerten-ar.sql');
  const page = read('src/pages/PublicQuotePage.tsx');

  it('every field the quote page draws is in the view it is handed', () => {
    const drawn = [...page.matchAll(/quote as \{ (\w+)[?]?:/g)].map((m) => m[1]).filter((f) => !f.startsWith('_'));
    expect(drawn).toEqual(expect.arrayContaining(['title', 'intro_text', 'terms_text']));
    const view = sql.slice(sql.indexOf("'quote', jsonb_build_object("), sql.indexOf("'items', v_items"));
    const missing = [...new Set(drawn)].filter((f) => !new RegExp(`'${f}',`).test(view));
    expect(missing, `the page reads these from the quote, and get_public_quote does not return them: ${missing.join(', ')}`).toEqual([]);
  });

  it('the view names both sides and still carries nothing internal', () => {
    const view = sql.slice(sql.indexOf("'quote', jsonb_build_object("), sql.indexOf("'items', v_items"));
    expect(view).toMatch(/'seller_name', public\.business_name\(\)/);
    expect(view).toMatch(/'customer_name', v_quote\.customer_name/);
    for (const internal of ['owner_id', 'lead_id', 'deal_id', 'accept_token', 'approval_request_id', 'customer_email', 'created_by']) {
      expect(view, internal).not.toMatch(new RegExp(`'${internal}'`));
    }
  });

  it('the signing page names the seller and the counterparty — never "you and" the reader', () => {
    const contract = read('src/pages/PublicContractPage.tsx');
    expect(contract).not.toMatch(/Between you and \{/);
    expect(contract).toMatch(/useBusinessName\(\)/);
  });

  it('the customer path runs in the night, in a browser', () => {
    expect(read('.github/workflows/fresh-install-nightly.yml')).toMatch(/run: npm run qa:customer-path/);
    expect(read('package.json')).toMatch(/"qa:customer-path": "bun run scripts\/customer-path\/index\.ts"/);
  });
});

describe('the invoice says who is asking and how to pay — and reaches the customer', () => {
  // Found by opening the invoice mail's link in a browser as the customer (2026-11-17).
  const core = read('supabase/functions/_shared/execute/core.ts');
  const page = read('src/pages/PublicInvoicePage.tsx');
  const pdf = read('supabase/functions/generate-invoice-pdf/index.ts');
  const sql = read('supabase/migrations/20261117150000_fakturan-sager-vem-och-hur.sql');

  it('manage_invoice send mails the customer and says whether it did', () => {
    const send = core.slice(core.indexOf("throw new Error(`Send invoice failed:"));
    const body = send.slice(0, send.indexOf("if (action === 'mark_paid')"));
    expect(body).toMatch(/kind: 'invoice_email'/);
    expect(body).toMatch(/email_sent: emailSent/);
    expect(body).toMatch(/email_error: emailError/);
    expect(read('src/lib/modules/invoicing-module.ts')).toMatch(/SEND: issues the invoice[^\n]*e-mails the customer/);
  });

  it('no skill description points at a send skill that does not exist', () => {
    expect(read('src/lib/modules/invoicing-module.ts')).not.toMatch(/send_invoice_email/);
  });

  it('the seller and the bank details have one home, read by the page and the PDF alike', () => {
    expect(sql).toMatch(/key = 'company_profile'/);
    expect(sql).toMatch(/key = 'einvoice'/);
    expect(page).toMatch(/get_invoice_payment_info/);
    expect(pdf).toMatch(/rpc\("invoice_seller_facts"\)/);
    // What an invoice prints is for whoever holds its link — never for any visitor.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.invoice_seller_facts\(\) FROM anon, authenticated/);
    const lookup = sql.slice(sql.indexOf('FUNCTION public.get_invoice_payment_info'));
    expect(lookup.slice(0, lookup.indexOf('REVOKE'))).toMatch(/token_is_plausible\(p_token\)/);
  });

  it('a card button is drawn only where the payment function says a card can be taken', () => {
    expect(page).toMatch(/cardAvailable \? \(\s*<Button onClick=\{handlePay\}/);
    const fn = read('supabase/functions/create-invoice-payment/index.ts');
    expect(fn).toMatch(/if \(probe === true\)/);
    expect(fn).toMatch(/stripe\?\.enabled !== false/);
    expect(fn).not.toMatch(/throw new Error\('Stripe not configured'\)/);
  });

  it('the PDF draws every text through the font\'s own character set', () => {
    expect(pdf).toMatch(/page\.drawText = \(text: string[^\n]*winAnsi\(text\)/);
    expect(pdf).not.toMatch(/\|\| "Company"/);
    expect(pdf).toMatch(/item\.qty \?\? item\.quantity/);
  });

  it('the invoice is a step on the customer path', () => {
    expect(read('scripts/customer-path/index.ts')).toMatch(/\[quoteAccepted, contractSigned, invoicePaid, bookingChanged, shopPurchase, portalShowsWhatTheCustomerHas\]/);
  });
});

describe('the customer hears about their case', () => {
  // Found by doing support-to-resolution by hand in the admin (2026-11-18).
  const mod = read('src/lib/modules/tickets-module.ts');
  const handler = read('supabase/functions/comms-send/ticket_update.ts');
  const sql = read('supabase/migrations/20261118120000_kunden-far-veta-om-sitt-arende.sql');
  const drawer = read('src/components/admin/tickets/TicketDetailDrawer.tsx');

  it('two automations answer a new case and a staff reply with the mail skill', () => {
    for (const [event, arg] of [['ticket.created', "ticket_id: '{{event.payload.id}}'"], ['ticket.replied', "comment_id: '{{event.payload.id}}'"]] as const) {
      const at = mod.indexOf(`trigger_config: { event: '${event}' }`);
      expect(at, event).toBeGreaterThan(-1);
      const seed = mod.slice(at, at + 300);
      expect(seed, event).toMatch(/skill_name: 'send_ticket_update'/);
      expect(seed, event).toContain(arg);
    }
    expect(read('supabase/functions/comms-send/index.ts')).toMatch(/send_ticket_update: 'ticket_update'/);
  });

  it('only a public reply by staff, written now and not already mailed, raises the event', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.emit_ticket_replied'));
    expect(fn).toMatch(/NEW\.is_internal IS NOT TRUE/);
    expect(fn).toMatch(/NEW\.author_type = 'agent'/);
    expect(fn).toMatch(/NEW\.emailed_at IS NULL/);
    expect(fn).toMatch(/NEW\.created_at > now\(\) - interval '10 minutes'/);
  });

  it('each mail is claimed before the send and given back when nothing went out', () => {
    expect(handler).toMatch(/\.is\('ack_sent_at', null\)/);
    expect(handler).toMatch(/\.is\('emailed_at', null\)/);
    expect(handler).toMatch(/if \(release\) await release\(\)/);
    // An internal note, a customer's own comment, a case that came in by mail: nobody is mailed.
    for (const reason of ['internal_note', 'not_a_staff_reply', 'came_in_by_email', 'case_already_settled', 'not_a_new_case']) {
      expect(handler, reason).toContain(`skipped('${reason}')`);
    }
  });

  it('a reply already sent through the mailbox is not sent again', () => {
    const core = read('supabase/functions/_shared/execute/core.ts');
    const gmail = core.slice(core.indexOf('async function executeReplyToTicketViaEmail'));
    const insert = gmail.slice(gmail.indexOf("from('ticket_comments').insert("), gmail.indexOf("from('ticket_comments').insert(") + 400);
    expect(insert).toMatch(/emailed_at: new Date\(\)\.toISOString\(\)/);
  });

  it('the admin makes the person choose who reads it — a note is never a reply by default of a single box', () => {
    expect(drawer).toMatch(/is_internal: commentKind === "note"/);
    expect(drawer).not.toMatch(/placeholder="Add a comment\.\.\."/);
    expect(drawer).toMatch(/E-mailed to \$\{ticket\.contact_email\}/);
    expect(drawer).toMatch(/Nothing is e-mailed/);
  });

  it('every writer of a staff comment says whether it is internal — discovered, not listed', () => {
    // A new writer of ticket_comments with author_type 'agent' that omits is_internal writes a public
    // reply, and a public reply is mailed.
    const sources = ['src/hooks/useTickets.ts', 'supabase/functions/_shared/execute/core.ts'].map(read).join('\n');
    const inserts = [...sources.matchAll(/from\('ticket_comments'\)\s*\.insert\(\[?\{([\s\S]{0,400}?)\}\]?\)/g)].map((m) => m[1]);
    expect(inserts.length).toBeGreaterThanOrEqual(2);
    for (const body of inserts.filter((b) => /author_type: 'agent'/.test(b))) {
      expect(body, body.slice(0, 120)).toMatch(/is_internal:/);
    }
  });

  it('the battery and the staff path read what the customer got', () => {
    const scenario = read('scripts/process-battery/scenarios/support-to-resolution.ts');
    expect(scenario).toMatch(/the customer is mailed that the case was received/);
    expect(scenario).toMatch(/the internal note is mailed to nobody/);
    expect(scenario).toMatch(/a case that came in by mail gets no automatic receipt/);
    expect(read('scripts/staff-path/index.ts')).toMatch(/\[quoteByHand, invoiceByHand, contactToDeal, ticketByHand\]/);
  });
});

describe('the customer portal shows what the customer has', () => {
  // Found by signing in to /account as a customer who holds a service agreement (2026-11-18).
  const sql = read('supabase/migrations/20261118150000_portalen-visar-vad-kunden-har.sql');
  const layout = read('src/pages/account/AccountLayout.tsx');
  const app = read('src/App.tsx');

  it('the portal opens on an overview, not on a shop\'s order list', () => {
    expect(app).toMatch(/\{ index: true, element: <AccountOverviewPage \/> \}/);
    for (const path of ['orders', 'invoices', 'agreements']) expect(app, path).toMatch(new RegExp(`\\{ path: "${path}", element: <`));
    // What a customer holds comes before what a shop sells.
    const nav = layout.slice(layout.indexOf('...overviewNav'), layout.indexOf('...profileNav'));
    expect(nav.indexOf('servicesNav')).toBeLessThan(nav.indexOf('commerceNav'));
    expect(nav.indexOf('invoicesNav')).toBeLessThan(nav.indexOf('commerceNav'));
  });

  it('one rule says which rows are the customer\'s: the confirmed e-mail and their companies', () => {
    const email = sql.slice(sql.indexOf('FUNCTION public.portal_email'), sql.indexOf('FUNCTION public.portal_company_ids'));
    expect(email).toMatch(/email_confirmed_at IS NOT NULL/);
    const account = sql.slice(sql.indexOf('FUNCTION public.my_account'), sql.indexOf('── Orders'));
    expect(account).toMatch(/v_email text := public\.portal_email\(\)/);
    expect(account).toMatch(/v_companies uuid\[\] := public\.portal_company_ids\(\)/);
    // Nothing reads the address out of the token itself, which an unconfirmed account also carries.
    expect(account).not.toMatch(/auth\.jwt\(\)/);
  });

  it('the customer is shown only what was issued to them, and only as a signed-in person', () => {
    const account = sql.slice(sql.indexOf('FUNCTION public.my_account'), sql.indexOf('── Orders'));
    expect(account).toMatch(/i\.status::text NOT IN \('draft', 'cancelled'\)/);
    expect(account).toMatch(/c\.status::text <> 'draft'/);
    expect(account).toMatch(/IF v_uid IS NULL THEN\s+RAISE EXCEPTION/);
    for (const fn of ['my_account()', 'portal_email()', 'portal_company_ids()']) {
      expect(sql, fn).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM anon`);
    }
    // Internal fields stay inside: no notes, no owner, no customer e-mail of someone else's row.
    for (const internal of ["'notes'", "'created_by'", "'customer_email'", "'signer_ip'", "'line_items'"]) {
      expect(account, internal).not.toContain(internal);
    }
  });
});

describe('the customer can change their own booking', () => {
  const mod = read('src/lib/modules/booking-module.ts');
  const handler = read('supabase/functions/comms-send/booking_confirmation.ts');
  const sql = read('supabase/migrations/20261119090000_kunden-andrar-sin-bokning.sql');

  it('the confirmation links to the booking\'s own page, in every template', () => {
    expect(handler).toMatch(/\/my-booking\/\$\{manageToken\}/);
    expect(handler).toMatch(/manage_block:/);
    // A template from before the link existed still carries it.
    expect(handler).toMatch(/!templateHtml\.includes\(manageHref\)/);
  });

  it('a move is judged by the booking rules and confirmed anew', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.reschedule_booking_by_token'));
    expect(fn).toMatch(/UPDATE public\.bookings/);
    expect(fn).toMatch(/confirmation_sent_at = NULL/);
    expect(fn).toMatch(/exclusion_violation/);
    expect(fn).toMatch(/'booking\.rescheduled'/);
    const seed = mod.slice(mod.indexOf("name: 'New confirmation when the customer moves a booking'"));
    expect(seed.slice(0, 700)).toMatch(/trigger_config: \{ event: 'booking\.rescheduled' \}/);
    expect(seed.slice(0, 700)).toMatch(/skill_name: 'send_booking_confirmation'/);
  });

  it('the key shows a view of the booking, never the row', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.get_booking_by_token'), sql.indexOf('FUNCTION public.cancel_booking_by_token'));
    expect(fn).toMatch(/token_is_plausible\(p_token\)/);
    expect(fn).not.toMatch(/customer_email|customer_phone|b\.notes/);
  });
});

describe('a purchase with Stripe off is a whole purchase', () => {
  // Found by buying in the shop in a browser, as a visitor (2026-11-19).
  const checkout = read('supabase/functions/create-checkout/index.ts');
  const page = read('src/pages/CheckoutSuccessPage.tsx');
  const sandbox = checkout.slice(checkout.indexOf('if (sandboxMode) {'), checkout.indexOf('Stripe secret key not configured'));

  it('a test-mode order is born pending and then paid, so order.paid is raised', () => {
    const insert = sandbox.slice(sandbox.indexOf('.from("orders")'), sandbox.indexOf('.select()'));
    expect(insert).toMatch(/status: "pending"/);
    expect(insert).not.toMatch(/status: orderStatus/);
    expect(sandbox.indexOf('.from("order_items").insert')).toBeLessThan(sandbox.indexOf('.update({ status: "paid" })'));
  });

  it('the buyer is sent the order confirmation, as after a Stripe payment', () => {
    expect(sandbox).toMatch(/comms-send\?kind=order_confirmation/);
  });

  it('the confirmation page reads the order by its own key, never the table', () => {
    expect(page).toMatch(/rpc\('get_order_confirmation'/);
    expect(page).not.toMatch(/\.from\('orders'\)/);
    expect(page).not.toMatch(/\.from\('order_items'\)/);
  });
});

describe('the business hears when the customer calls off a booking', () => {
  const mod = read('src/lib/modules/booking-module.ts');
  const sql = read('supabase/migrations/20261119160000_foretaget-far-veta-nar-kunden-avbokar.sql');

  it('the customer\'s own cancellation raises its own event, after the booking is off', () => {
    expect(sql.indexOf("SET status = 'cancelled'")).toBeGreaterThan(-1);
    expect(sql.indexOf("'booking.cancelled_by_customer'")).toBeGreaterThan(sql.indexOf("SET status = 'cancelled'"));
  });

  it('an automation mails the admins on it', () => {
    const seed = mod.slice(mod.indexOf("name: 'Notify admins when a customer cancels a booking'"));
    expect(seed.slice(0, 700)).toMatch(/trigger_config: \{ event: 'booking\.cancelled_by_customer' \}/);
    expect(seed.slice(0, 700)).toMatch(/skill_name: 'email_admins'/);
  });
});
