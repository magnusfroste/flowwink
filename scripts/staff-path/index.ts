/**
 * The staff's path — a process done by hand in the admin, in a real browser.
 *
 * The process battery runs every business process through skills, as an agent
 * works; the customer path opens what the customer is mailed. Neither is the
 * PERSON at the business, who does the same process with a mouse: a dialog, a
 * form, a Save, a Send. The first run by hand (2026-11-17) numbered a quote
 * QUO-0001 on an instance whose series stood at 33 (the admin and the skills
 * each kept their own count), drew the line description as a 25 px box, and
 * offered no way to write the title, the introduction or the terms the
 * customer's page shows — only an agent could.
 *
 * A step signs in as an admin, does the step with clicks and typing, and then
 * reads what the click did: the row, the mail, the page the customer opens.
 *
 * Local stacks only (assertLocal). Every row is scoped to one run id.
 *
 *   npm run qa:staff-path             # against the local stack
 *   npm run qa:staff-path -- --headed # watch it
 *
 * Exit 0 = every step passed, 1 = a step failed, 2 = the tool could not run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { assertLocal, createFixtureUser, deleteFixtureUser, storageKeyFor, type FixtureUser, type StackConfig } from '../view-sweep/fixtures';
import { readStackConfig, freePort, startVite } from '../view-sweep/stack';
import { Scenario, connect } from '../process-battery/lib';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const OUT_DIR = join(REPO_ROOT, '.staff-path');
const headed = process.argv.includes('--headed');
const baseUrlArg = process.argv.find((a) => a.startsWith('--base-url='))?.split('=')[1];

interface StepResult { step: string; verdict: 'pass' | 'fail'; checks: Array<{ name: string; ok: boolean; detail?: string }> }

class Step {
  readonly checks: StepResult['checks'] = [];
  constructor(readonly name: string) {}
  check(name: string, ok: boolean, detail?: string): boolean {
    this.checks.push({ name, ok, detail: ok ? undefined : detail });
    return ok;
  }
  result(): StepResult {
    return { step: this.name, verdict: this.checks.length > 0 && this.checks.every((c) => c.ok) ? 'pass' : 'fail', checks: this.checks };
  }
}

async function snap(page: Page, name: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) }).catch(() => {});
}

/** A browser signed in as the given user, as the app would have signed them in itself. */
async function signedIn(browser: Browser, cfg: StackConfig, user: FixtureUser): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
  await ctx.addInitScript(
    ([key, value]) => { try { if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value); } catch { /* opaque origin */ } },
    [storageKeyFor(cfg.supabaseUrl), JSON.stringify(user.session)] as const,
  );
  return ctx;
}

/** Poll the database for what a click should have written. */
async function until<T>(read: () => Promise<T | null | undefined>, ok: (v: T) => boolean, tries = 40): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const v = await read();
    if (v != null && ok(v)) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/** The mail a click sent: the page shows "sent" a moment before the mail is in the rail. */
async function mailTo(s: Scenario, recipient: string): Promise<Awaited<ReturnType<Scenario['mail']>>> {
  for (let i = 0; i < 40; i++) {
    const mail = await s.mail(recipient);
    if (mail) return mail;
    await new Promise((r) => setTimeout(r, 500));
  }
  return undefined;
}

// ── the steps ───────────────────────────────────────────────────────────────

/** A person writes a quote for a lead, sends it, and the customer opens what was sent. */
async function quoteByHand(s: Scenario, browser: Browser, cfg: StackConfig, admin: FixtureUser, base: string): Promise<StepResult> {
  const step = new Step('quote: written and sent by hand in the admin');
  const email = `hand-quote-${s.tag}@example.test`;
  const name = `Handväg Offert ${s.tag}`;
  const lead = await s.skill('add_lead', { email, name, source: 'form' });
  if (!step.check('there is a lead to quote', lead.ok, lead.error)) return step.result();

  // An agent's quote first, so the hand-made one has a series to continue.
  const agentQuote = await s.skill('manage_quote', {
    action: 'create', customer_name: `Agent ${s.tag}`, customer_email: `agent-quote-${s.tag}@example.test`,
    items: [{ description: 'Agent line', quantity: 1, unit_price_cents: 10_000, tax_rate_pct: 25 }],
  });
  const agentNumber = String((await s.one<{ quote_number: string }>('select quote_number from quotes where id = $1', [s.idOf(agentQuote.data, 'quote')]))?.quote_number ?? '');
  if (!step.check('an agent has numbered a quote', agentQuote.ok && /^QUO-\d+$/.test(agentNumber), agentQuote.error || agentNumber)) return step.result();

  const ctx = await signedIn(browser, cfg, admin);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  try {
    await page.goto(`${base}/admin/quotes`, { waitUntil: 'domcontentloaded' });
    const newQuote = page.getByRole('button', { name: /new quote/i }).first();
    if (!step.check('the quotes page opens for the person', await newQuote.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true, () => false), `no "New Quote" button; page errors: ${errors.join(' | ') || 'none'}`)) { await snap(page, 'quotes-not-rendered'); return step.result(); }
    await newQuote.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').first().click();
    const option = page.getByRole('option', { name: new RegExp(name) }).first();
    if (!step.check('the lead can be picked as the customer', await option.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false), `"${name}" is not among the leads offered`)) { await snap(page, 'quote-lead-missing'); return step.result(); }
    await option.click();
    await dialog.locator('input[type="date"]').fill(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
    await dialog.getByRole('button', { name: /create draft/i }).click();

    const quote = await until(
      () => s.one<{ id: string; quote_number: string }>('select q.id, q.quote_number from quotes q join leads l on l.id = q.lead_id where l.email = $1', [email]),
      (q) => !!q.id,
    );
    if (!step.check('the draft is created', !!quote, 'no quote row for the lead after "Create Draft"')) { await snap(page, 'quote-not-created'); return step.result(); }
    // FINDING 2026-11-17: QUO-0001 on an instance whose series stood at 33.
    const next = `QUO-${String(Number(agentNumber.slice(4)) + 1).padStart(4, '0')}`;
    step.check('its number continues the series the agent\'s quote was in', quote!.quote_number === next, `the agent's quote is ${agentNumber}; the hand-made one is ${quote!.quote_number}, expected ${next}`);
    const dup = await s.one<{ n: number }>('select count(*)::int as n from quotes where quote_number = $1', [quote!.quote_number]);
    step.check('no other quote carries that number', dup?.n === 1, `${dup?.n} quotes are numbered ${quote!.quote_number}`);

    // Open it and write the offer.
    await page.getByRole('cell', { name: quote!.quote_number }).first().click();
    const title = page.locator('#quote-title');
    // FINDING 2026-11-17: no title, introduction or terms could be written by a person.
    if (!step.check('the person can say what the offer is', await title.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false), 'the quote editor has no title field')) { await snap(page, 'quote-editor'); return step.result(); }
    await title.fill(`Hand-made offer ${s.tag}`);
    await page.locator('#quote-intro').fill('As we agreed when we met.');
    const description = page.getByPlaceholder('Description').first();
    // FINDING 2026-11-17: the description was a 25 px box beside five other fields.
    const box = await description.boundingBox();
    step.check('the line description has room to be read', (box?.width ?? 0) >= 300, `the description field is ${Math.round(box?.width ?? 0)} px wide`);
    await description.fill('Design and build');
    await page.getByPlaceholder(/^Price/).first().fill('12000');
    await page.locator('#quote-terms').fill('Payment within thirty days of the invoice date.');
    await page.getByRole('button', { name: /save changes/i }).click();
    const saved = await until(
      () => s.one<{ title: string | null; terms_text: string | null; total_cents: number }>('select title, terms_text, total_cents from quotes where id = $1', [quote!.id]),
      (q) => q.total_cents === 1_500_000 && !!q.terms_text,
    );
    await snap(page, 'quote-written');
    if (!step.check('Save writes the offer: title, terms and 12 000 kr + 25 % VAT', !!saved && saved.title === `Hand-made offer ${s.tag}`, `the row reads ${JSON.stringify(await s.one('select title, terms_text, total_cents from quotes where id = $1', [quote!.id]))}`)) return step.result();

    await page.getByRole('button', { name: /send to customer/i }).click();
    const sent = await until(() => s.one<{ status: string }>('select status from quotes where id = $1', [quote!.id]), (q) => q.status === 'sent');
    await snap(page, 'quote-sent');
    if (!step.check('Send to Customer sends it', !!sent, `quotes.status is ${(await s.one<{ status: string }>('select status from quotes where id = $1', [quote!.id]))?.status}`)) return step.result();

    const mail = await mailTo(s, email);
    if (!step.check('the customer is mailed the quote', !!mail, `nothing in the mail rail for ${email}`)) return step.result();
    const link = mail!.links.find((l) => /\/quote\/[^/]+$/.test(new URL(l).pathname));
    if (!step.check('the mail carries the link to the quote', !!link, `links in the mail: ${JSON.stringify(mail!.links)}`)) return step.result();

    // What the person wrote is what the customer reads.
    const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const customer = await visitor.newPage();
      const u = new URL(link!);
      await customer.goto(`${base}${u.pathname}${u.search}`, { waitUntil: 'domcontentloaded' });
      const reads = (text: string) => customer.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 45_000 }).then(() => true, () => false);
      step.check('the customer reads the title the person wrote', await reads(`Hand-made offer ${s.tag}`), 'the title is not on the quote page');
      step.check('…and the terms', await reads('Payment within thirty days of the invoice date.'), 'the terms are not on the quote page');
      await customer.screenshot({ path: join(OUT_DIR, 'quote-as-customer.png'), fullPage: true }).catch(() => {});
    } finally {
      await visitor.close();
    }
    step.check('the admin raised no error', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return step.result();
}

/** A person writes an invoice for a lead, sends it and registers the bank payment — all in the admin. */
async function invoiceByHand(s: Scenario, browser: Browser, cfg: StackConfig, admin: FixtureUser, base: string): Promise<StepResult> {
  const step = new Step('invoice: written, sent and paid by hand in the admin');
  const email = `hand-invoice-${s.tag}@example.test`;
  const name = `Handväg Faktura ${s.tag}`;
  const lead = await s.skill('add_lead', { email, name, source: 'form' });
  if (!step.check('there is a lead to invoice', lead.ok, lead.error)) return step.result();

  const ctx = await signedIn(browser, cfg, admin);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  // "Send invoice … to …?" is a native confirm: the person presses OK.
  page.on('dialog', (d) => { void d.accept(); });
  const row = () => s.one<{ id: string; invoice_number: string; status: string; due_date: string | null; issue_date: string | null; customer_name: string | null; customer_email: string | null; total_cents: number; paid_amount_cents: number | null }>(
    `select i.id, i.invoice_number, i.status::text as status, i.due_date::text as due_date, i.issue_date::text as issue_date, i.customer_name, i.customer_email, i.total_cents, i.paid_amount_cents
       from invoices i join leads l on l.id = i.lead_id where l.email = $1`, [email]);
  try {
    await page.goto(`${base}/admin/invoices`, { waitUntil: 'domcontentloaded' });
    const newInvoice = page.getByRole('button', { name: /new invoice/i }).first();
    if (!step.check('the invoices page opens for the person', await newInvoice.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true, () => false), `no "New Invoice" button; page errors: ${errors.join(' | ') || 'none'}`)) { await snap(page, 'invoices-not-rendered'); return step.result(); }
    await newInvoice.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').first().click();
    const option = page.getByRole('option', { name: new RegExp(name) }).first();
    if (!step.check('the lead can be picked as the customer', await option.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false), `"${name}" is not among the leads offered`)) { await snap(page, 'invoice-lead-missing'); return step.result(); }
    await option.click();
    await dialog.getByRole('button', { name: /create draft/i }).click();

    const born = await until(row, (r) => !!r.id);
    if (!step.check('the draft is created', !!born, 'no invoice row for the lead after "Create Draft"')) { await snap(page, 'invoice-not-created'); return step.result(); }
    step.check('it is numbered in the yearly series', /^INV-\d{4}-\d{5}$/.test(born!.invoice_number), `the hand-made invoice is ${born!.invoice_number}`);
    // FINDING 2026-11-18: no due date (so never overdue, and no reminder ever), and no customer on the invoice itself.
    const expectDue = born!.issue_date ? new Date(new Date(`${born!.issue_date}T00:00:00Z`).getTime() + 30 * 86_400_000).toISOString().slice(0, 10) : '';
    step.check('it is born with a due date, thirty days out', born!.due_date === expectDue, `issue ${born!.issue_date}, due ${born!.due_date}`);
    step.check('…and carries the customer\'s own name and e-mail', born!.customer_name === name && born!.customer_email === email, `customer_name "${born!.customer_name}", customer_email "${born!.customer_email}"`);

    await page.getByRole('cell', { name: born!.invoice_number }).first().click();
    const description = page.getByPlaceholder('Description').first();
    if (!step.check('the invoice opens for editing', await description.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false), 'the invoice editor did not open')) { await snap(page, 'invoice-editor'); return step.result(); }
    await description.fill('Consulting day');
    await page.getByPlaceholder(/^Price/).first().fill('8000');
    await page.getByRole('button', { name: /save changes/i }).click();
    const saved = await until(row, (r) => r.total_cents === 1_000_000);
    await snap(page, 'invoice-written');
    if (!step.check('Save writes the line: 8 000 kr + 25 % VAT', !!saved, `invoices.total_cents is ${(await row())?.total_cents}`)) return step.result();

    await page.getByRole('button', { name: /^\s*send\s*$/i }).click();
    const sent = await until(row, (r) => r.status === 'sent');
    await snap(page, 'invoice-sent');
    if (!step.check('Send issues it', !!sent, `invoices.status is ${(await row())?.status}`)) return step.result();
    const mail = await mailTo(s, email);
    if (!step.check('the customer is mailed the invoice', !!mail, `nothing in the mail rail for ${email}`)) return step.result();
    const link = mail!.links.find((l) => /\/invoice\/[^/]+$/.test(new URL(l).pathname));
    step.check('the mail carries the link to the invoice', !!link, `links in the mail: ${JSON.stringify(mail!.links)}`);

    if (link) {
      const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      try {
        const customer = await visitor.newPage();
        const u = new URL(link);
        await customer.goto(`${base}${u.pathname}${u.search}`, { waitUntil: 'domcontentloaded' });
        step.check('the customer reads their own name on the invoice', await customer.getByText(name, { exact: false }).first().waitFor({ state: 'visible', timeout: 45_000 }).then(() => true, () => false), `"${name}" is not on the invoice page`);
        await customer.screenshot({ path: join(OUT_DIR, 'invoice-as-customer.png'), fullPage: true }).catch(() => {});
      } finally {
        await visitor.close();
      }
    }

    // The money arrives at the bank; the person registers it.
    const record = page.getByRole('button', { name: /record payment/i }).first();
    if (!step.check('the person can register a payment', await record.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false), 'no "Record Payment" on a sent invoice')) { await snap(page, 'invoice-no-record-payment'); return step.result(); }
    await record.click();
    const pay = page.getByRole('dialog').last();
    await snap(page, 'invoice-record-payment');
    await pay.getByRole('button', { name: /record|save|register|confirm/i }).last().click();
    const paid = await until(row, (r) => r.status === 'paid');
    await snap(page, 'invoice-paid');
    step.check('registering the full amount settles the invoice', !!paid && Number(paid.paid_amount_cents) === 1_000_000, `status ${(await row())?.status}, paid ${(await row())?.paid_amount_cents}`);
    step.check('the admin raised no error', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return step.result();
}

/** A person enters a contact, lands on it, and opens a deal from there. */
async function contactToDeal(s: Scenario, browser: Browser, cfg: StackConfig, admin: FixtureUser, base: string): Promise<StepResult> {
  const step = new Step('contact: entered by hand and turned into a deal');
  const email = `hand-contact-${s.tag}@example.test`;
  const name = `Handväg Kontakt ${s.tag}`;
  const ctx = await signedIn(browser, cfg, admin);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  const lead = () => s.one<{ id: string; status: string; source: string | null }>('select id, status::text as status, source from leads where email = $1', [email]);
  try {
    await page.goto(`${base}/admin/contacts`, { waitUntil: 'domcontentloaded' });
    const newContact = page.getByRole('button', { name: /new contact/i }).first();
    if (!step.check('the contacts page opens for the person', await newContact.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true, () => false), `no "New Contact" button; page errors: ${errors.join(' | ') || 'none'}`)) { await snap(page, 'contacts-not-rendered'); return step.result(); }
    await newContact.click();
    await page.locator('#email').fill(email);
    await page.locator('#name').fill(name);
    await page.getByRole('button', { name: /create contact/i }).click();
    const made = await until(lead, (l) => !!l.id);
    if (!step.check('the contact is created', !!made && made.status === 'lead', `leads row: ${JSON.stringify(await lead())}`)) { await snap(page, 'contact-not-created'); return step.result(); }
    // FINDING 2026-11-18: the pipeline is ordered by score, so the new contact (score 0)
    // was the last card of 114 — created, and nowhere to be seen.
    const landed = await page.waitForURL(new RegExp(`/admin/contacts/${made!.id}$`), { timeout: 15_000 }).then(() => true, () => false);
    step.check('the person lands on the contact they made', landed && await page.getByText(name, { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false), `the page is ${page.url()}`);
    await snap(page, 'contact-made');

    await page.getByRole('button', { name: /^create deal$/i }).first().click();
    const value = page.locator('#value');
    if (!step.check('a deal can be opened from the contact', await value.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false), 'the deal dialog did not open')) { await snap(page, 'deal-dialog'); return step.result(); }
    await value.fill('25000');
    await page.getByRole('dialog').getByRole('button', { name: /create deal/i }).click();
    const deal = await until(
      () => s.one<{ value_cents: number; stage: string }>('select d.value_cents, d.stage::text as stage from deals d where d.lead_id = $1', [made!.id]),
      (d) => d.value_cents > 0,
    );
    await snap(page, 'deal-made');
    step.check('the deal carries what the person typed: 25 000 kr', deal?.value_cents === 2_500_000, `deals row: ${JSON.stringify(deal)}`);
    const moved = await until(lead, (l) => l.status === 'opportunity');
    step.check('the contact becomes an opportunity', !!moved, `leads.status is ${(await lead())?.status}`);
    step.check('the admin raised no error', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return step.result();
}

// ── run ─────────────────────────────────────────────────────────────────────

const cfg = readStackConfig();
assertLocal(cfg.supabaseUrl, 'the Supabase URL');
if (baseUrlArg) assertLocal(baseUrlArg, '--base-url');
const db = await connect();
const s = new Scenario('staff-path', db);
let vite: Awaited<ReturnType<typeof startVite>> | null = null;
let browser: Browser | null = null;
let admin: FixtureUser | null = null;
const results: StepResult[] = [];
let exit = 0;
try {
  // A send can only mail a link it can build — a virgin install has no Public Site URL.
  const general = await s.skill('manage_site_settings', { action: 'get', key: 'general' });
  const value = ((general.data.value ?? (general.data.item as { value?: unknown } | undefined)?.value ?? {}) as Record<string, unknown>);
  if (!value.siteUrl) await s.skill('manage_site_settings', { action: 'update', key: 'general', value: { ...value, siteUrl: 'http://localhost:5173' } });

  admin = await createFixtureUser(cfg, db, s.tag, 'staff-path', ['admin']);
  const base = baseUrlArg ?? (vite = await startVite(cfg, await freePort(5196))).baseUrl;
  const executablePath = process.env.VIEW_SWEEP_BROWSER || undefined;
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : { channel: 'chrome' }), headless: !headed });
  for (const run of [quoteByHand, invoiceByHand, contactToDeal]) {
    try {
      results.push(await run(s, browser, cfg, admin, base));
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
  console.log(`\n${passed}/${results.length} staff steps passed · report: .staff-path/report.json`);
  exit = passed === results.length ? 0 : 1;
} catch (e) {
  console.error(`staff-path: could not run — ${(e as Error).message}`);
  exit = 2;
} finally {
  await browser?.close().catch(() => {});
  if (admin) await deleteFixtureUser(cfg, admin).catch(() => {});
  vite?.proc.kill('SIGTERM');
  await db.end().catch(() => {});
}
process.exit(exit);
