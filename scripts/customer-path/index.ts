/**
 * The customer's path — the mail, the link in it, and the page it opens.
 *
 * The process battery runs every business process through skills, as an agent
 * works; the view sweep loads the admin's pages. Neither is the CUSTOMER. A
 * customer's whole experience of a process is what lands in the inbox and what
 * happens when the link in it is pressed — and until 2026-11-17 nothing read a
 * mail or pressed a link: a booking an agent made gave the customer no
 * confirmation and a contract "sent for signature" was e-mailed to nobody, both
 * green in the battery.
 *
 * This test does one process step as the business does (a skill), reads the
 * mail the customer was sent out of the mail rail (outbound_communications —
 * without a provider the send is logged as simulated, row and text are real),
 * opens the link from that mail in a real headless browser with NO session,
 * and does what the customer does. A step passes when:
 *   1. the customer was mailed, and the mail carries a link,
 *   2. the page behind the link rendered without an uncaught error,
 *   3. the customer's action went through, and
 *   4. the process moved on in the database.
 *
 * Local stacks only (assertLocal). Every row is scoped to one run id.
 *
 *   npm run qa:customer-path             # against the local stack
 *   npm run qa:customer-path -- --headed # watch it
 *
 * Exit 0 = every step passed, 1 = a step failed, 2 = the tool could not run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { assertLocal, createFixtureUser, deleteFixtureUser, storageKeyFor, type FixtureUser } from '../view-sweep/fixtures';
import { readStackConfig, freePort, startVite } from '../view-sweep/stack';
import { Scenario, connect } from '../process-battery/lib';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const OUT_DIR = join(REPO_ROOT, '.customer-path');
const headed = process.argv.includes('--headed');
const baseUrlArg = process.argv.find((a) => a.startsWith('--base-url='))?.split('=')[1];

interface StepResult { step: string; verdict: 'pass' | 'fail'; checks: Array<{ name: string; ok: boolean; detail?: string }>; link?: string }

/** A step's checks, collected — a step fails on its first false one but reports them all. */
class Step {
  readonly checks: StepResult['checks'] = [];
  link?: string;
  constructor(readonly name: string) {}
  check(name: string, ok: boolean, detail?: string): boolean {
    this.checks.push({ name, ok, detail: ok ? undefined : detail });
    return ok;
  }
  result(): StepResult {
    return { step: this.name, verdict: this.checks.length > 0 && this.checks.every((c) => c.ok) ? 'pass' : 'fail', checks: this.checks, link: this.link };
  }
}

/** The mail's link, pointed at this run's browser: the mail names the site's public URL, the test serves the app elsewhere. */
/** A name is data, not a pattern. */
const esc = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function onThisStack(link: string, base: string): string {
  const u = new URL(link);
  return `${base}${u.pathname}${u.search}`;
}

/** Open a page as a first-time visitor: no session, tracking declined, uncaught errors kept. */
async function visit(browser: Browser, url: string, ready: RegExp): Promise<{ page: Page; errors: string[]; rendered: boolean }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  let rendered = false;
  // The first visit compiles the page's chunk in Vite; give a stuck first load one retry.
  for (let attempt = 0; attempt < 2 && !rendered; attempt++) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    rendered = await page.getByRole('button', { name: ready }).first().waitFor({ state: 'visible', timeout: 45_000 }).then(() => true, () => false);
  }
  const essential = page.getByRole('button', { name: /essential only|endast nödvändiga/i }).first();
  if (await essential.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) await essential.click().catch(() => {});
  return { page, errors, rendered };
}

async function snap(page: Page, name: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}

/** Fill the name and e-mail the signing form asks for, then press its button. */
async function signAs(page: Page, name: string, email: string, confirm: RegExp): Promise<void> {
  const inputs = page.locator('input:visible');
  await inputs.nth(0).fill(name);
  await page.locator('input[type="email"]:visible').first().fill(email);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: confirm }).first().click();
}

// ── the steps ───────────────────────────────────────────────────────────────

/** The business sends a quote; the customer opens the mail's link and accepts it. */
async function quoteAccepted(s: Scenario, browser: Browser, base: string): Promise<StepResult> {
  const step = new Step('quote: the customer accepts from the mail');
  const email = `kund-quote-${s.tag}@example.test`;
  const name = `Kundväg Offert ${s.tag}`;
  const created = await s.skill('manage_quote', {
    action: 'create', customer_name: name, customer_email: email, title: `Customer path ${s.tag}`,
    valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    intro_text: 'As we agreed on the phone.', terms_text: 'Payment within thirty days of the invoice date.',
    items: [{ description: 'Consulting day', quantity: 2, unit_price_cents: 100_000, tax_rate_pct: 25 }],
  });
  if (!step.check('the business drafts a quote', created.ok, created.error)) return step.result();
  const quoteId = s.idOf(created.data, 'quote');
  const sent = await s.skill('manage_quote', { action: 'send', id: quoteId });
  if (!step.check('the business sends it', sent.ok && sent.data.email_sent === true, sent.error || String(sent.data.email_error ?? JSON.stringify(sent.data).slice(0, 200)))) return step.result();

  const mail = await s.mail(email);
  if (!step.check('the customer is mailed the quote', !!mail, `nothing in the mail rail for ${email}`)) return step.result();
  const link = mail!.links.find((l) => /\/quote\/[^/]+$/.test(new URL(l).pathname));
  if (!step.check('the mail carries the link to the quote', !!link, `links in the mail: ${JSON.stringify(mail!.links)}`)) return step.result();
  step.check('the mail states the total the customer is asked to accept', /2\s?500[,.]00/.test(mail!.html.replace(/&nbsp;|\u00a0/g, ' ')), 'no "2 500,00" in the mail');
  step.link = link;

  const { page, errors, rendered } = await visit(browser, onThisStack(link!, base), /accept quote|approve quote|acceptera|godkänn/i);
  try {
    if (!step.check('the quote page opens from the link', rendered, `the accept button never showed; page errors: ${errors.join(' | ') || 'none'}`)) { await snap(page, 'quote-not-rendered'); return step.result(); }
    // FINDING 2026-11-17: the page said "Quote QUO-0024", lines and a total. The title, the
    // introduction, the TERMS and both names were drawn by the page and never handed to it.
    step.check('the page says what the offer is', await page.getByText(`Customer path ${s.tag}`).first().isVisible().catch(() => false), 'the quote title is not on the page');
    step.check('…who it is for', await page.getByText(name).first().isVisible().catch(() => false), `"${name}" is not on the page`);
    step.check('…and the terms the customer is about to accept', await page.getByText('Payment within thirty days of the invoice date.').first().isVisible().catch(() => false), 'the terms are not on the page');
    await page.getByRole('button', { name: /accept quote|approve quote|acceptera|godkänn/i }).first().click();
    await signAs(page, name, email, /accept & sign|approve quote|acceptera|godkänn/i);
    const accepted = async () => (await s.one<{ status: string }>('select status from quotes where id = $1', [quoteId]))?.status === 'accepted';
    let ok = false;
    for (let i = 0; i < 30 && !(ok = await accepted()); i++) await page.waitForTimeout(500);
    await snap(page, 'quote-accepted');
    step.check('the customer\'s acceptance lands on the quote', ok, `quotes.status is ${(await s.one<{ status: string }>('select status from quotes where id = $1', [quoteId]))?.status}`);
    step.check('the page raised no error', errors.length === 0, errors.join(' | '));
    const thanks = (await s.mail(email, 'accepted')) ?? (await s.mail(email, 'godkänd'));
    step.check('the customer is mailed a receipt of the acceptance', !!thanks, 'no "accepted" mail in the rail');
  } finally {
    await page.context().close();
  }
  return step.result();
}

/** The business sends an agreement for signature; the counterparty opens the mail's link and signs. */
async function contractSigned(s: Scenario, browser: Browser, base: string): Promise<StepResult> {
  const step = new Step('contract: the counterparty signs from the mail');
  const email = `kund-avtal-${s.tag}@example.test`;
  const name = `Kundväg Avtal ${s.tag}`;
  const created = await s.skill('manage_contract', {
    action: 'create', title: `Customer path agreement ${s.tag}`, counterparty_name: name, counterparty_email: email,
    contract_type: 'service', start_date: new Date().toISOString().slice(0, 10),
    body_markdown: `# Service agreement\n\nThis agreement is made between the supplier and ${name} (the customer).\n\n1. The supplier delivers the service described in the accepted quote, on the dates agreed in writing.\n2. The agreement runs for twelve months from the start date and is renewed one year at a time.\n3. Either party may end it with three months' written notice before a renewal.\n4. Invoices are due thirty days after the invoice date.`,
  });
  if (!step.check('the business drafts an agreement', created.ok, created.error)) return step.result();
  const contractId = s.idOf(created.data, 'contract');
  const sent = await s.skill('send_contract_for_signature', { contract_id: contractId });
  if (!step.check('the business sends it for signature — and the counterparty is mailed', sent.ok && sent.data.email_sent === true, sent.error || String(sent.data.email_error ?? JSON.stringify(sent.data).slice(0, 200)))) return step.result();

  const mail = await s.mail(email);
  if (!step.check('the counterparty is mailed the agreement', !!mail, `nothing in the mail rail for ${email}`)) return step.result();
  const link = mail!.links.find((l) => /\/contract\/[^/]+$/.test(new URL(l).pathname));
  if (!step.check('the mail carries the signing link', !!link, `links in the mail: ${JSON.stringify(mail!.links)}`)) return step.result();
  step.link = link;

  const { page, errors, rendered } = await visit(browser, onThisStack(link!, base), /^\s*(sign|accept|signera|godkänn)/i);
  try {
    if (!step.check('the signing page opens from the link', rendered, `the sign button never showed; page errors: ${errors.join(' | ') || 'none'}`)) { await snap(page, 'contract-not-rendered'); return step.result(); }
    // FINDING 2026-11-17: the page read "Between you and <counterparty>" — to the counterparty, their own name.
    const sellerName = (await s.one<{ n: string | null }>('select public.business_name() as n'))?.n ?? '';
    step.check('the page names both parties, the seller first', !!sellerName && await page.getByText(new RegExp(`${esc(sellerName)} (and|och) ${esc(name)}`)).first().isVisible().catch(() => false),
      `"${sellerName} and ${name}" is not on the page`);
    step.check('the page shows the agreement text', await page.getByText('The agreement runs for twelve months', { exact: false }).first().isVisible().catch(() => false), 'the agreement body is not on the page');
    await page.getByRole('button', { name: /^\s*(sign|accept|signera|godkänn)/i }).first().click();
    await signAs(page, name, email, /sign|accept|signera|godkänn/i);
    const signed = async () => ['active', 'signed'].includes(String((await s.one<{ status: string }>('select status from contracts where id = $1', [contractId]))?.status));
    let ok = false;
    for (let i = 0; i < 30 && !(ok = await signed()); i++) await page.waitForTimeout(500);
    await snap(page, 'contract-signed');
    step.check('the signature lands on the agreement', ok, `contracts.status is ${(await s.one<{ status: string }>('select status from contracts where id = $1', [contractId]))?.status}`);
    step.check('the page raised no error', errors.length === 0, errors.join(' | '));
    const receipt = (await s.mail(email, 'signed')) ?? (await s.mail(email, 'signerat'));
    step.check('the counterparty is mailed the signed agreement', !!receipt, 'no "signed" mail in the rail');
  } finally {
    await page.context().close();
  }
  return step.result();
}

/** The business issues an invoice; the customer opens the mail's link, sees who to pay and how, and the payment shows. */
async function invoicePaid(s: Scenario, browser: Browser, base: string): Promise<StepResult> {
  const step = new Step('invoice: the customer sees who is asking and how to pay');
  const email = `kund-faktura-${s.tag}@example.test`;
  const name = `Kundväg Faktura ${s.tag}`;
  // What an invoice prints about the seller has two homes: Business Identity and the e-invoice settings.
  const merged = await s.skill('manage_site_settings', { action: 'update', key: 'company_profile', value: { legal_name: `Kundväg Säljare AB`, org_number: '556677-8899', vat_number: 'SE556677889901' } });
  const bank = await s.skill('manage_site_settings', { action: 'update', key: 'einvoice', value: { bankgiro: '123-4567' } });
  if (!step.check('the business has stated who it is and where to pay', merged.ok && bank.ok, merged.error || bank.error)) return step.result();

  const created = await s.skill('manage_invoice', {
    action: 'create', customer_name: name, customer_email: email, tax_rate: 0.25,
    line_items: [{ description: 'Consulting day', qty: 2, unit_price_cents: 100_000 }],
  });
  if (!step.check('the business drafts an invoice', created.ok, created.error)) return step.result();
  const invoiceId = String(created.data.invoice_id ?? created.data.id ?? s.idOf(created.data, 'invoice'));
  const number = String(created.data.invoice_number ?? '');
  // FINDING 2026-11-17: `send` set the status and mailed nobody — only the admin's button did.
  const sent = await s.skill('manage_invoice', { action: 'send', invoice_id: invoiceId });
  if (!step.check('the business sends it — and the customer is mailed', sent.ok && sent.data.email_sent === true, sent.error || String(sent.data.email_error ?? JSON.stringify(sent.data).slice(0, 200)))) return step.result();

  const mail = await s.mail(email);
  if (!step.check('the customer is mailed the invoice', !!mail, `nothing in the mail rail for ${email}`)) return step.result();
  const link = mail!.links.find((l) => /\/invoice\/[^/]+$/.test(new URL(l).pathname));
  if (!step.check('the mail carries the link to the invoice', !!link, `links in the mail: ${JSON.stringify(mail!.links)}`)) return step.result();
  step.check('the mail states the amount owed', /2\s?500[,.]00/.test(mail!.html.replace(/&nbsp;|\u00a0/g, ' ')), 'no "2 500,00" in the mail');
  step.link = link;

  const { page, errors, rendered } = await visit(browser, onThisStack(link!, base), /download pdf|ladda ner pdf/i);
  try {
    if (!step.check('the invoice page opens from the link', rendered, `the page never showed; page errors: ${errors.join(' | ') || 'none'}`)) { await snap(page, 'invoice-not-rendered'); return step.result(); }
    const shows = (text: string) => page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
    // FINDING 2026-11-17: the page named the customer and not the seller, and carried no organisation or VAT number.
    step.check('the page says who the invoice is from', await shows('Kundväg Säljare AB'), 'the seller\'s legal name is not on the page');
    step.check('…with its organisation and VAT number', (await shows('556677-8899')) && (await shows('SE556677889901')), 'the organisation or VAT number is not on the page');
    // …and one way to pay, a card button that failed wherever Stripe is not connected.
    step.check('the page says where to pay', await shows('123-4567'), 'the bankgiro is not on the page');
    const howToPay = page.getByTestId('invoice-how-to-pay');
    step.check('…and what to state as reference', !!number && await howToPay.getByText(number).first().isVisible().catch(() => false), `the reference ${number} is not in the payment details`);
    const card = await fetch(`${process.env.BATTERY_FN_URL ?? `${readStackConfig().supabaseUrl}/functions/v1`}/create-invoice-payment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readStackConfig().anonKey}` }, body: JSON.stringify({ probe: true }),
    }).then((r) => r.json() as Promise<{ available?: boolean }>).catch(() => ({ available: undefined }));
    const cardButton = await page.getByRole('button', { name: /pay by card|betala med kort/i }).first().isVisible().catch(() => false);
    step.check('a card button is offered exactly when a card can be taken', card.available !== undefined && cardButton === card.available, `the payment function says available=${card.available}, the page ${cardButton ? 'shows' : 'hides'} the button`);
    const viewed = async () => !!(await s.one<{ viewed_at: string | null }>('select viewed_at from invoices where id = $1', [invoiceId]))?.viewed_at;
    let seen = false;
    for (let i = 0; i < 20 && !(seen = await viewed()); i++) await page.waitForTimeout(500);
    step.check('the business sees that the customer opened it', seen, 'invoices.viewed_at was never set');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }).catch(() => null),
      page.getByRole('button', { name: /download pdf|ladda ner pdf/i }).first().click(),
    ]);
    step.check('the PDF downloads', !!download, 'pressing Download PDF produced no file');
    await snap(page, 'invoice-open');

    // The customer pays by bank; the business registers it; the same link is now the receipt.
    const paid = await s.skill('record_invoice_payment', { p_invoice_id: invoiceId, p_amount_cents: 250_000, p_method: 'bank_transfer', p_reference: number });
    if (step.check('the business registers the bank payment', paid.ok, paid.error)) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      step.check('the same link is now the receipt', await page.getByText(/paid in full|fullt betald/i).first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false), 'the page does not say the invoice is paid');
      step.check('…and no longer asks for money', !(await page.getByTestId('invoice-how-to-pay').isVisible().catch(() => false)), 'the payment details are still shown on a paid invoice');
      await snap(page, 'invoice-paid');
    }
    step.check('the page raised no error', errors.length === 0, errors.join(' | '));
  } finally {
    await page.context().close();
  }
  return step.result();
}

/** A customer signs in to the portal and finds what they have: the invoice to pay, the quote to answer, the agreement to sign. */
async function portalShowsWhatTheCustomerHas(s: Scenario, browser: Browser, base: string): Promise<StepResult> {
  const step = new Step('portal: the customer finds what they have and what waits for them');
  const cfg = readStackConfig();
  let customer: FixtureUser | null = null;
  let stranger: FixtureUser | null = null;
  try {
    customer = await createFixtureUser(cfg, db, s.tag, 'portal-kund', ['customer']);
    stranger = await createFixtureUser(cfg, db, s.tag, 'portal-annan', ['customer']);
    const email = customer.email;
    const name = `Kundväg Portal ${s.tag}`;

    // The business does three things for this customer, none of them in a shop.
    const invoice = await s.skill('manage_invoice', { action: 'create', customer_name: name, customer_email: email, tax_rate: 0.25, line_items: [{ description: 'Fibre, November', qty: 1, unit_price_cents: 80_000 }] });
    const invoiceId = String(invoice.data.invoice_id ?? invoice.data.id ?? '');
    const invoiceNumber = String(invoice.data.invoice_number ?? '');
    const sentInvoice = await s.skill('manage_invoice', { action: 'send', invoice_id: invoiceId });
    const draft = await s.skill('manage_invoice', { action: 'create', customer_name: name, customer_email: email, tax_rate: 0.25, line_items: [{ description: 'Not issued yet', qty: 1, unit_price_cents: 10_000 }] });
    const draftNumber = String(draft.data.invoice_number ?? '');
    const quote = await s.skill('manage_quote', { action: 'create', customer_name: name, customer_email: email, title: `Portal offer ${s.tag}`, valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), items: [{ description: 'Upgrade', quantity: 1, unit_price_cents: 50_000, tax_rate_pct: 25 }] });
    const sentQuote = await s.skill('manage_quote', { action: 'send', id: s.idOf(quote.data, 'quote') });
    const contract = await s.skill('manage_contract', { action: 'create', title: `Portal agreement ${s.tag}`, counterparty_name: name, counterparty_email: email, contract_type: 'service', start_date: new Date().toISOString().slice(0, 10), body_markdown: `# Service agreement\n\nThis agreement is made between the supplier and ${name} (the customer).\n\n1. The supplier delivers the fibre service at the customer's address from the start date.\n2. The agreement runs for twelve months and is renewed one year at a time.\n3. Either party may end it with three months' written notice before a renewal.\n4. Invoices are due thirty days after the invoice date.` });
    const sentContract = await s.skill('send_contract_for_signature', { contract_id: s.idOf(contract.data, 'contract') });
    if (!step.check('the business invoices, quotes and sends an agreement to one customer', sentInvoice.ok && sentQuote.ok && sentContract.ok && draft.ok,
      sentInvoice.error || sentQuote.error || sentContract.error || draft.error)) return step.result();

    // …and the customer has booked a time (the booking step proves the booking itself; here only that the portal shows it).
    const bookedService = await s.skill('manage_booking_service', { action: 'create', name: `Portal booking ${s.tag}`, description: 'customer path', duration_minutes: 30 });
    const tuesdays = await s.one<{ n: string }>(`select count(*) as n from booking_availability where day_of_week = 2 and is_active and service_id is null`);
    if (Number(tuesdays?.n) === 0) await s.skill('manage_booking_availability', { action: 'set_hours', day_of_week: 2, start_time: '09:00', end_time: '12:00' });
    // A January Tuesday at 11:00 (+01:00) far ahead — booking_rules judge it like any booking; the service is the step's own.
    let hh = 11;
    for (const ch of s.tag) hh = (hh * 31 + ch.charCodeAt(0)) >>> 0;
    const when = new Date(Date.UTC(2100 + (hh % 300), 0, 8));
    while (when.getUTCDay() !== 2) when.setUTCDate(when.getUTCDate() + 1);
    const at = `${when.toISOString().slice(0, 10)}T11:00:00+01:00`;
    const bookingRow = bookedService.ok ? await s.one<{ id: string; manage_token: string }>(
      `insert into public.bookings (service_id, customer_name, customer_email, start_time, end_time, status)
       values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '30 minutes', 'confirmed')
       returning id, manage_token`, [s.idOf(bookedService.data, 'booking_service'), name, email, at]) : null;
    if (!step.check('the customer has a time booked', !!bookingRow?.manage_token, bookedService.error || 'the booking was not stored')) return step.result();

    const signIn = async (user: FixtureUser) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
      await ctx.addInitScript(
        ([key, value]) => { try { if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value); } catch { /* opaque origin */ } },
        [storageKeyFor(cfg.supabaseUrl), JSON.stringify(user.session)] as const,
      );
      return ctx;
    };

    const ctx = await signIn(customer);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
    try {
      await page.goto(`${base}/account`, { waitUntil: 'domcontentloaded' });
      const waiting = page.getByTestId('account-waiting');
      // FINDING 2026-11-18: the portal opened on "No orders yet — browse products".
      if (!step.check('the portal opens on what waits for the customer', await waiting.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true, () => false), `no "Waiting for you" on /account; page errors: ${errors.join(' | ') || 'none'}`)) { await snap(page, 'portal-not-rendered'); return step.result(); }
      const text = await waiting.innerText();
      step.check('…the invoice to pay', text.includes(invoiceNumber), `${invoiceNumber} is not among: ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
      step.check('…the quote to answer', text.includes(`Portal offer ${s.tag}`), 'the quote is not waiting');
      step.check('…the agreement to sign', text.includes(`Portal agreement ${s.tag}`), 'the agreement is not waiting');
      await snap(page, 'portal-overview');

      // FINDING 2026-11-18: no invoices page at all, and "Contracts" was the employee's own.
      await page.getByRole('link', { name: /my invoices|mina fakturor/i }).first().click();
      const rows = page.getByTestId('my-invoice');
      step.check('the customer finds their invoices', await rows.first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false) && (await rows.allInnerTexts()).some((t) => t.includes(invoiceNumber)), `${invoiceNumber} is not on /account/invoices`);
      step.check('…and never one that was not issued', !(await rows.allInnerTexts()).some((t) => t.includes(draftNumber)), `the draft ${draftNumber} is shown to the customer`);
      await page.getByRole('link', { name: /view and pay|visa och betala/i }).first().click();
      step.check('…and opens one where it is paid', await page.getByTestId('invoice-how-to-pay').or(page.getByRole('button', { name: /pay by card|download pdf|betala med kort|ladda ner pdf/i }).first()).first().waitFor({ state: 'visible', timeout: 45_000 }).then(() => true, () => false), `the invoice page did not open: ${page.url()}`);

      // FINDING 2026-11-20: the portal showed no booking — the time was only in the confirmation mail.
      await page.goto(`${base}/account/bookings`, { waitUntil: 'domcontentloaded' });
      const booking = page.getByTestId('my-booking').filter({ hasText: `Portal booking ${s.tag}` }).first();
      step.check('the customer finds the time they booked', await booking.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false), 'the booking is not on /account/bookings');
      const door = await booking.getByRole('link', { name: /change or cancel|ändra eller avboka/i }).getAttribute('href').catch(() => null);
      step.check('…with the same door to change it as the mail', door === `/my-booking/${bookingRow!.manage_token}`, `the link is ${door}`);
      await snap(page, 'portal-bookings');

      await page.goto(`${base}/account/agreements`, { waitUntil: 'domcontentloaded' });
      step.check('the customer finds their agreement', await page.getByTestId('my-agreement').filter({ hasText: `Portal agreement ${s.tag}` }).first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false), 'the agreement is not on /account/agreements');
      step.check('the portal raised no error', errors.length === 0, errors.join(' | '));
    } finally {
      await ctx.close();
    }

    // Another customer of the same business sees none of it.
    const other = await signIn(stranger);
    try {
      const p2 = await other.newPage();
      await p2.goto(`${base}/account/invoices`, { waitUntil: 'domcontentloaded' });
      const empty = await p2.getByText(/you have no invoices yet|du har inga fakturor än/i).first().waitFor({ state: 'visible', timeout: 45_000 }).then(() => true, () => false);
      step.check('another customer sees none of it', empty && !(await p2.content()).includes(invoiceNumber), 'another signed-in customer can see the invoice');
      await p2.goto(`${base}/account/bookings`, { waitUntil: 'domcontentloaded' });
      const noBookings = await p2.getByText(/you have no bookings with us|du har inga bokningar hos oss/i).first().waitFor({ state: 'visible', timeout: 45_000 }).then(() => true, () => false);
      step.check('…nor their booking', noBookings && !(await p2.content()).includes(`Portal booking ${s.tag}`), 'another signed-in customer can see the booking');
    } finally {
      await other.close();
    }
  } finally {
    if (customer) await deleteFixtureUser(cfg, customer).catch(() => {});
    if (stranger) await deleteFixtureUser(cfg, stranger).catch(() => {});
  }
  return step.result();
}

/** The business books a customer in; the customer opens the mail's link, moves the booking and then calls it off. */
async function bookingChanged(s: Scenario, browser: Browser, base: string): Promise<StepResult> {
  const step = new Step('booking: the customer moves and cancels from the mail');
  const email = `kund-bokning-${s.tag}@example.test`;
  const name = `Kundväg Bokning ${s.tag}`;

  const svc = await s.skill('manage_booking_service', { action: 'create', name: `Kundväg rådgivning ${s.tag}`, description: 'customer path', duration_minutes: 60 });
  if (!step.check('the business has a service to book', svc.ok, svc.error)) return step.result();
  const serviceId = s.idOf(svc.data, 'booking_service');
  const open = await s.one<{ n: string }>(`select count(*) as n from booking_availability where day_of_week = 2 and is_active and service_id is null`);
  if (Number(open?.n) === 0) {
    const hours = await s.skill('manage_booking_availability', { action: 'set_hours', day_of_week: 2, start_time: '09:00', end_time: '12:00' });
    if (!step.check('Tuesdays are open', hours.ok, hours.error)) return step.result();
  }
  // A January Tuesday (+01:00 in Sweden) nobody has touched.
  let h = 7;
  for (const ch of s.tag) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  const d = new Date(Date.UTC(2040 + (h % 300), 0, 8));
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  let day = '';
  for (let tries = 0; tries < 500 && !day; tries++) {
    const candidate = d.toISOString().slice(0, 10);
    const used = await s.one<{ n: string }>(
      `select (select count(*) from bookings where start_time::date = $1::date) + (select count(*) from booking_blocked_dates where date = $1::date) as n`, [candidate]);
    if (Number(used?.n) === 0 && d.getUTCMonth() === 0) day = candidate;
    else d.setUTCDate(d.getUTCDate() + 7 * 52);
    while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  }
  if (!step.check('a free Tuesday is found', !!day, 'no free January Tuesday')) return step.result();

  const booked = await s.skill('book_appointment_slot', { p_service_id: serviceId, p_customer_name: name, p_customer_email: email, p_start_time: `${day}T10:00:00+01:00` });
  if (!step.check('the customer is booked in at 10:00', booked.ok, booked.error)) return step.result();
  const bookingId = s.idOf(booked.data, 'booking');
  const sent = await s.skill('send_booking_confirmation', { booking_id: bookingId });
  step.check('the confirmation is sent', sent.ok, sent.error);
  const mail = await s.mail(email);
  if (!step.check('the customer is mailed the confirmation', !!mail, `nothing in the mail rail for ${email}`)) return step.result();
  // FINDING 2026-11-19: the mail said "contact us" — there was no link, no page, and no way to move a booking at all.
  const link = mail!.links.find((l) => /\/my-booking\/[^/]+$/.test(new URL(l).pathname));
  if (!step.check('the mail carries a link to change or cancel', !!link, `links in the mail: ${JSON.stringify(mail!.links)}`)) return step.result();
  step.link = link;

  const row = async () => await s.one<{ status: string; starts: string; reason: string | null }>(
    `select status, to_char(start_time at time zone 'Europe/Stockholm', 'HH24:MI') as starts, cancelled_reason as reason from bookings where id = $1`, [bookingId]);
  const { page, errors, rendered } = await visit(browser, onThisStack(link!, base), /choose another time|välj en annan tid/i);
  try {
    if (!step.check('the booking page opens from the link', rendered, `the page never offered another time; page errors: ${errors.join(' | ') || 'none'}`)) { await snap(page, 'booking-not-rendered'); return step.result(); }
    step.check('the page shows the time booked', /10[:.]00/.test(await page.getByTestId('booking-when').innerText().catch(() => '')), `"When" reads: ${await page.getByTestId('booking-when').innerText().catch(() => '(missing)')}`);
    step.check('…and the service', await page.getByText(`Kundväg rådgivning ${s.tag}`, { exact: false }).first().isVisible().catch(() => false), 'the service name is not on the page');

    // Move it: the same day, 11:00 — the booked 10:00 is not offered back as a "new" time.
    await page.getByRole('button', { name: /choose another time|välj en annan tid/i }).click();
    await page.locator('#booking-new-date').fill(day);
    await page.getByTestId('booking-slot').first().waitFor({ timeout: 15_000 }).catch(() => {});
    const offered = (await page.getByTestId('booking-slot').allInnerTexts()).map((x) => x.trim());
    step.check('the free times of the day are offered', offered.includes('11:00') && offered.includes('09:00'), `offered: ${offered.join(', ') || 'nothing'}`);
    await page.getByTestId('booking-slot').filter({ hasText: '11:00' }).first().click();
    let moved = false;
    for (let i = 0; i < 30 && !(moved = (await row())?.starts === '11:00'); i++) await page.waitForTimeout(500);
    step.check('the booking is moved to 11:00', moved, `the booking starts ${(await row())?.starts}`);
    step.check('the page says so', await page.getByTestId('booking-moved').isVisible().catch(() => false), 'no "moved" message on the page');
    await snap(page, 'booking-moved');
    const before = mail!.count;
    const again = async () => ((await s.mail(email))?.count ?? 0) > before;
    await s.pulse('event-dispatcher', again);
    const second = await s.mail(email);
    step.check('the customer is mailed a confirmation of the new time', (second?.count ?? 0) > before && /11[:.]00/.test(second?.html ?? ''),
      `${second?.count ?? 0} mail(s); the newest reads: ${(second?.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)}`);

    // A time somebody else holds is refused, whoever asks.
    const other = await s.skill('book_appointment_slot', { p_service_id: serviceId, p_customer_name: `Annan ${s.tag}`, p_customer_email: `annan-bokning-${s.tag}@example.test`, p_start_time: `${day}T09:00:00+01:00` });
    const token = new URL(link!).pathname.split('/').pop()!;
    const clash = await s.one<{ a: { success?: boolean; code?: string } }>(`select public.reschedule_booking_by_token($1, $2::timestamptz) as a`, [token, `${day}T09:00:00+01:00`]);
    step.check('a time someone else has is refused', other.ok && clash?.a?.success === false && clash.a.code === 'SLOT_UNAVAILABLE', `${other.error ?? ''} ${JSON.stringify(clash?.a)}`);

    // Call it off.
    await page.getByRole('button', { name: /cancel the booking|avboka/i }).first().click();
    await page.locator('#booking-cancel-reason').fill('Kan inte komma');
    await page.getByRole('button', { name: /yes, cancel|ja, avboka/i }).click();
    let off = false;
    for (let i = 0; i < 30 && !(off = (await row())?.status === 'cancelled'); i++) await page.waitForTimeout(500);
    step.check('the booking is cancelled, with the customer\'s words', off && /Kan inte komma/.test((await row())?.reason ?? ''), JSON.stringify(await row()));
    const told = await s.one<{ n: string }>(`select count(*) as n from agent_events where event_name = 'booking.cancelled_by_customer' and payload->>'id' = $1`, [bookingId]);
    const noticed = await s.one<{ enabled: boolean }>(`select enabled from agent_automations where name = 'Notify admins when a customer cancels a booking'`);
    step.check('the business is told the customer cancelled', Number(told?.n) === 1 && noticed?.enabled === true, `events: ${told?.n}; automation: ${JSON.stringify(noticed ?? null)}`);
    step.check('the page says it is cancelled', await page.getByTestId('booking-cancelled').isVisible().catch(() => false), 'no "cancelled" message on the page');
    await snap(page, 'booking-cancelled');
    const free = await s.one<{ a: { slots?: Array<{ time: string }> } }>(`select public.booking_free_slots($1::uuid, $2::date) as a`, [serviceId, day]);
    step.check('the time is free for the next customer', (free?.a?.slots ?? []).some((x) => x.time === '11:00'), JSON.stringify(free?.a?.slots ?? null));
    step.check('the page raised no error', errors.length === 0, errors.join(' | '));
  } finally {
    await page.context().close();
  }
  return step.result();
}

/** A visitor buys in the shop with Stripe switched off — the test mode — and is sent the receipt. */
async function shopPurchase(s: Scenario, browser: Browser, base: string): Promise<StepResult> {
  const step = new Step('shop: a visitor buys and is sent the receipt');
  const email = `kund-butik-${s.tag}@example.test`;
  const name = `Kundväg Butik ${s.tag}`;
  const productName = `Kundväg lampa ${s.tag}`;
  const made = await s.skill('manage_product', { action: 'create', name: productName, description: 'A lamp for the customer path.', price_cents: 49_900 });
  if (!step.check('the business puts a product in the shop', made.ok, made.error)) return step.result();
  const productId = s.idOf(made.data, 'product');

  const { page, errors, rendered } = await visit(browser, `${base}/shop/${productId}`, /add to cart|lägg i varukorg/i);
  try {
    if (!step.check('the product page opens', rendered, `no buy button; page errors: ${errors.join(' | ') || 'none'}`)) { await snap(page, 'shop-not-rendered'); return step.result(); }
    step.check('the page shows the product', await page.getByRole('heading', { name: productName }).first().isVisible().catch(() => false), 'the product name is not a heading on the page');
    await page.getByRole('button', { name: /add to cart|lägg i varukorg/i }).first().click();
    await page.getByRole('button', { name: /added to cart|tillagd/i }).first().waitFor({ timeout: 10_000 }).catch(() => {});
    await page.goto(`${base}/checkout`, { waitUntil: 'domcontentloaded' });
    const nameField = page.locator('#name');
    if (!step.check('the checkout opens with the cart', await nameField.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), `no checkout form at ${page.url()}`)) { await snap(page, 'checkout-not-rendered'); return step.result(); }
    step.check('the checkout lists what is being bought', await page.getByText(productName, { exact: false }).first().isVisible().catch(() => false), 'the product is not in the order summary');
    await nameField.fill(name);
    await page.locator('#email').fill(email);
    for (const [id, value] of [['#line1', 'Provgatan 1'], ['#postalCode', '111 22'], ['#city', 'Stockholm'], ['#country', 'SE'], ['#phone', '+46 70 555 01 02']] as const) {
      const field = page.locator(id);
      if (await field.count()) await field.fill(value);
    }
    await snap(page, 'checkout-filled');
    await page.locator('form button[type="submit"]').first().click();
    const landed = await page.waitForURL(/\/checkout\/success/, { timeout: 30_000 }).then(() => true).catch(() => false);
    if (!step.check('the order is placed — no card asked for, Stripe being off', landed, `still at ${page.url()}; page errors: ${errors.join(' | ') || 'none'}`)) { await snap(page, 'checkout-stuck'); return step.result(); }

    const order = async () => await s.one<{ id: string; status: string; total_cents: string }>(
      `select id, status, total_cents from orders where lower(customer_email) = lower($1) order by created_at desc limit 1`, [email]);
    let paid = false;
    for (let i = 0; i < 30 && !(paid = (await order())?.status === 'paid'); i++) await page.waitForTimeout(500);
    const row = await order();
    step.check('the order is there, paid, at the price shown', paid && Number(row?.total_cents) >= 49_900, JSON.stringify(row ?? null));
    step.check('the customer is told so on the page', await page.getByText(email, { exact: false }).first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false), 'the confirmation page does not show the order');
    await snap(page, 'checkout-success');

    // The receipt is the order's paid invoice, sent by the automation on order.paid.
    const receipted = async () => !!(await s.mail(email))?.links.some((l) => /\/invoice\//.test(l));
    await s.pulse('event-dispatcher', receipted);
    const mail = await s.mail(email);
    const link = mail?.links.find((l) => /\/invoice\/[^/]+$/.test(new URL(l).pathname));
    if (!step.check('the customer is mailed the receipt', !!link, `${mail?.count ?? 0} mail(s) to ${email}; links in the newest: ${JSON.stringify(mail?.links ?? [])}`)) return step.result();
    step.link = link;
    step.check('…and the order confirmation', !!(await s.mail(email, 'Order confirmation')) || ((await s.mail(email))?.count ?? 0) >= 2, 'only the receipt reached the customer');
    const invoice = await s.one<{ status: string; total_cents: string }>(`select status, total_cents from invoices where order_id = $1 and status <> 'cancelled' limit 1`, [row!.id]);
    step.check('the receipt is the order\'s paid invoice, same amount', invoice?.status === 'paid' && Number(invoice.total_cents) === Number(row!.total_cents), JSON.stringify(invoice ?? null));

    const receipt = await visit(browser, onThisStack(link!, base), /download pdf|ladda ner pdf/i);
    try {
      step.check('the receipt opens from the mail', receipt.rendered, `the page never drew; errors: ${receipt.errors.join(' | ') || 'none'}`);
      step.check('…and says it is paid', await receipt.page.getByText(/paid in full|fullt betald/i).first().isVisible().catch(() => false), 'the receipt does not say the invoice is paid');
      step.check('…lists what was bought', await receipt.page.getByText(productName, { exact: false }).first().isVisible().catch(() => false), 'the product is not on the receipt');
      step.check('…and asks for no money', (await receipt.page.getByRole('button', { name: /pay|betala/i }).count()) === 0, 'a pay button is on a paid receipt');
      await snap(receipt.page, 'shop-receipt');
      step.check('the receipt raised no error', receipt.errors.length === 0, receipt.errors.join(' | '));
    } finally {
      await receipt.page.context().close();
    }
    step.check('the shop raised no error', errors.length === 0, errors.join(' | '));
  } finally {
    await page.context().close();
  }
  return step.result();
}

// ── run ─────────────────────────────────────────────────────────────────────

const cfg = readStackConfig();
assertLocal(cfg.supabaseUrl, 'the Supabase URL');
if (baseUrlArg) assertLocal(baseUrlArg, '--base-url');
const db = await connect();
const s = new Scenario('customer-path', db);
let vite: Awaited<ReturnType<typeof startVite>> | null = null;
let browser: Browser | null = null;
const results: StepResult[] = [];
let exit = 0;
try {
  // A send can only mail a link it can build — a virgin install has no Public Site URL.
  const general = await s.skill('manage_site_settings', { action: 'get', key: 'general' });
  const value = ((general.data.value ?? (general.data.item as { value?: unknown } | undefined)?.value ?? {}) as Record<string, unknown>);
  if (!value.siteUrl) await s.skill('manage_site_settings', { action: 'update', key: 'general', value: { ...value, siteUrl: 'http://localhost:5173' } });

  const base = baseUrlArg ?? (vite = await startVite(cfg, await freePort(5197))).baseUrl;
  // The same browser the view sweep and the public blocks use: the runner's Chrome, or the one named.
  const executablePath = process.env.VIEW_SWEEP_BROWSER || undefined;
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : { channel: 'chrome' }), headless: !headed });
  for (const run of [quoteAccepted, contractSigned, invoicePaid, bookingChanged, shopPurchase, portalShowsWhatTheCustomerHas]) {
    try {
      results.push(await run(s, browser, base));
    } catch (e) {
      results.push({ step: run.name, verdict: 'fail', checks: [{ name: 'the step ran', ok: false, detail: (e as Error).message.slice(0, 400) }] });
    }
  }
  for (const r of results) {
    console.log(`\n${r.verdict === 'pass' ? '✅' : '❌'} ${r.step}`);
    for (const c of r.checks) console.log(`   ${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : `\n        ${c.detail ?? ''}`}`);
  }
  const passed = results.filter((r) => r.verdict === 'pass').length;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify({ run: s.tag, results }, null, 2));
  console.log(`\n${passed}/${results.length} customer steps passed · report: .customer-path/report.json`);
  exit = passed === results.length ? 0 : 1;
} catch (e) {
  console.error(`customer-path: could not run — ${(e as Error).message}`);
  exit = 2;
} finally {
  await browser?.close().catch(() => {});
  vite?.proc.kill('SIGTERM');
  await db.end().catch(() => {});
}
process.exit(exit);
