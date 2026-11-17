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

    const mail = await s.mail(email);
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
  for (const run of [quoteByHand]) {
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
