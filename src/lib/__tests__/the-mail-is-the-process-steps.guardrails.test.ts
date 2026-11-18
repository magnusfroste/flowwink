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
    expect(read('scripts/customer-path/index.ts')).toMatch(/\[quoteAccepted, contractSigned, invoicePaid\]/);
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
