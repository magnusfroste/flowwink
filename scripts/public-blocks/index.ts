/**
 * Public blocks, submitted as a visitor would.
 *
 * The view sweep loads every route and the process battery runs every business
 * process — but the battery calls the platform server-side, through RPCs and
 * skills. Nothing pressed the button a visitor presses. That is how #661 lived
 * for three weeks: the battery booked fine through request_booking while the
 * public booking block threw "Cannot read properties of undefined (reading
 * 'rest')" in the browser before any request left (synclair, 2026-10-09).
 *
 * This test builds one page per public block that takes input — smart booking,
 * form, webinar sign-up, newsletter — opens each in a real headless browser
 * with NO session, fills it in and submits it. A block passes when:
 *   1. the page raised no uncaught error (pageerror),
 *   2. the block's own write call answered 2xx, and
 *   3. the row it should have created is in the database.
 * Secondary calls a block makes after its write (confirmation e-mail, webhooks)
 * are reported as warnings: a local stack has no mail provider, and those
 * paths are best-effort in the blocks themselves.
 *
 * Local stacks only (assertLocal). Writes are scoped to one run id, so a run on
 * a long-lived laptop database leaves rows a later run cannot mistake for its own.
 *
 *   npm run qa:public-blocks             # against the local stack
 *   npm run qa:public-blocks -- --headed # watch it
 *
 * Exit 0 = every block passed, 1 = a block failed, 2 = the tool could not run.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { chromium, type Browser, type Page, type Response } from 'playwright-core';
import { assertLocal } from '../view-sweep/fixtures';
import { readStackConfig, freePort, startVite } from '../view-sweep/stack';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const DATABASE_URL = process.env.VIEW_SWEEP_DATABASE_URL ?? process.env.BATTERY_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const OUT_DIR = join(REPO_ROOT, '.public-blocks');
const headed = process.argv.includes('--headed');
const baseUrlArg = process.argv.find((a) => a.startsWith('--base-url='))?.split('=')[1];

type Verdict = 'pass' | 'fail';
interface BlockResult {
  block: string;
  calls?: { url: string; status: number }[];
  page: string;
  verdict: Verdict;
  write?: { url: string; status: number };
  row: boolean;
  errors: string[];
  warnings: string[];
}

const run = randomUUID().slice(0, 8);
const email = (block: string) => `qa-${block}-${run}@qa.flowwink.test`;

/** The fixture: one page per block, plus the data a block needs to offer something. */
async function seed(db: Client): Promise<Record<string, string>> {
  // Booking: one active service and opening hours every day, so there is a free
  // time whatever weekday the night falls on. Existing services stay; the test
  // picks its own by name if the block shows a choice.
  const svc = await db.query(
    `INSERT INTO booking_services (name, description, duration_minutes, price_cents, is_active, sort_order)
     VALUES ($1, 'Public-blocks test service', 30, 0, true, -100) RETURNING id`,
    [`QA visit ${run}`],
  );
  const serviceId: string = svc.rows[0].id;
  // A laptop database keeps earlier runs: retire their services so this run's
  // block shows exactly the services a real site would, plus one of ours.
  await db.query(`UPDATE booking_services SET is_active = false WHERE name LIKE 'QA visit %' AND id <> $1`, [serviceId]);
  await db.query(`UPDATE webinars SET status = 'completed' WHERE title LIKE 'QA webinar %' AND title <> $1`, [`QA webinar ${run}`]);
  await db.query(
    `INSERT INTO booking_availability (day_of_week, start_time, end_time, is_active)
     SELECT d, '08:00', '20:00', true FROM generate_series(0, 6) d
     WHERE NOT EXISTS (SELECT 1 FROM booking_availability a WHERE a.day_of_week = d AND a.is_active
                        AND a.start_time <= '08:00' AND a.end_time >= '20:00')`,
  );
  // Webinar: one published, in a week.
  await db.query(
    `INSERT INTO webinars (title, description, date, status, duration_minutes)
     VALUES ($1, 'Public-blocks test webinar', now() + interval '7 days', 'published', 30)`,
    [`QA webinar ${run}`],
  );

  const blocks: Record<string, unknown> = {
    booking: { mode: 'smart', title: 'Book a time', description: 'Public-blocks test', showPhoneField: false },
    form: {
      title: 'Contact', submitButtonText: 'Send', successMessage: 'Thanks', variant: 'default', notifyEmail: '',
      fields: [
        { id: 'f-name', type: 'text', label: 'Name', required: true, width: 'full' },
        { id: 'f-email', type: 'email', label: 'Email', required: true, width: 'full' },
        { id: 'f-msg', type: 'textarea', label: 'Message', required: false, width: 'full' },
      ],
    },
    webinar: { title: 'Upcoming webinars', variant: 'card', maxItems: 20, showPast: false },
    newsletter: { title: 'Newsletter', buttonText: 'Subscribe', variant: 'default', showNameField: false },
  };
  const pages: Record<string, string> = {};
  for (const [type, data] of Object.entries(blocks)) {
    const slug = `qa-pb-${type}-${run}`;
    await db.query(
      `INSERT INTO pages (title, slug, status, show_in_menu, content_json, meta_json)
       VALUES ($1, $2, 'published', false, $3::jsonb, '{"noIndex": true, "showTitle": false}'::jsonb)`,
      [`QA ${type}`, slug, JSON.stringify([{ id: randomUUID(), type, data }])],
    );
    pages[type] = slug;
  }
  pages.serviceName = `QA visit ${run}`;
  pages.serviceId = serviceId;
  return pages;
}

/** Errors the page raised and Supabase calls it made, from the moment it opens. */
function watch(page: Page, supabaseUrl: string) {
  const pageErrors: string[] = [];
  const calls: { url: string; status: number }[] = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on('response', (r: Response) => {
    const url = r.url();
    if (url.startsWith(supabaseUrl) && r.request().method() !== 'OPTIONS') calls.push({ url: url.replace(supabaseUrl, ''), status: r.status() });
  });
  return { pageErrors, calls };
}

async function waitForCall(calls: { url: string; status: number }[], match: RegExp, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = calls.find((c) => match.test(c.url));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  return undefined;
}

async function rowExists(db: Client, sql: string, params: unknown[], ms = 15_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await db.query(sql, params);
    if (r.rowCount && r.rowCount > 0) return true;
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}

/**
 * Behave like a person, not a bot. FormBlock drops a submission whose hidden
 * honeypot is filled or that comes faster than 800 ms after mount — and shows
 * "Thanks" anyway (that is the point of a honeypot). So: visible inputs only,
 * a human pause before submitting, and the consent banner answered the
 * privacy-preserving way (Essential only) as a first-time visitor would.
 */
async function arrive(page: Page, url: string, ready: string): Promise<void> {
  // The first visit to a block compiles its chunk in Vite and cold-starts
  // get-page; wait for the block itself, and give a stuck first load one retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const ok = await page.locator('main').locator(ready).first().waitFor({ state: 'visible', timeout: 45_000 }).then(() => true, () => false);
    if (ok) break;
    if (attempt === 1) throw new Error(`the block never rendered (${ready} not visible after two loads)`);
  }
  // The consent banner slides in after the page; answer it like a first-time
  // visitor who declines tracking.
  const essential = page.getByRole('button', { name: /essential only|endast nödvändiga/i }).first();
  if (await essential.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)) {
    await essential.click().catch(() => {});
  }
}
const visible = (page: Page, css: string) => page.locator('main').locator(`${css}:visible`);
const humanPause = (page: Page) => page.waitForTimeout(1200);
/** The first visible free-text field — an <input> with no type is text too. */
const nameField = (page: Page) =>
  visible(page, 'input:not([type]), input[type="text"]').first();

/** What the visitor saw when the block finished — kept next to the report. */
async function snap(page: Page, name: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}

function verdict(r: Omit<BlockResult, 'verdict'>): BlockResult {
  const ok = r.errors.length === 0 && !!r.write && r.write.status < 400 && r.row;
  return { ...r, verdict: ok ? 'pass' : 'fail' };
}

// ── the four blocks, as a visitor uses them ─────────────────────────────────

async function bookingBlock(page: Page, base: string, slug: string, serviceName: string, db: Client, sb: string): Promise<BlockResult> {
  const w = watch(page, sb);
  const errors: string[] = [];
  const main = page.locator('main');
  await arrive(page, `${base}/${slug}`, 'div.grid-cols-7 > button, button:has-text("QA visit")');
  // Several active services → step 1 asks; one → the block skips to the calendar.
  const svc = main.getByText(serviceName, { exact: false }).first();
  if (await svc.isVisible().catch(() => false)) await svc.click();
  await main.locator('div.grid-cols-7 > button').first().waitFor({ state: 'visible', timeout: 15_000 });
  // Next week has no past times — move one week ahead, then try each day until times show.
  const arrows = main.locator('button:has(svg)');
  const slot = main.locator('button').filter({ hasText: /^\s*\d{2}:\d{2}\s*$/ });
  let picked = false;
  for (let week = 0; week < 2 && !picked; week++) {
    if (week > 0) await arrows.nth((await arrows.count()) - 1).click().catch(() => {});
    // The week grid: seven day buttons (weekday + date). textContent is "Mon19",
    // so match the structure, not the text.
    const days = main.locator('div.grid-cols-7 > button');
    const n = await days.count();
    for (let i = 0; i < n && !picked; i++) {
      const d = days.nth(i);
      if (!(await d.isEnabled().catch(() => false))) continue;
      await d.click().catch(() => {});
      await slot.first().waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
      if ((await slot.count()) > 0) { await slot.first().click(); picked = true; }
    }
  }
  if (!picked) errors.push('no free time was offered — booking_free_slots returned nothing for two weeks');
  else {
    await nameField(page).fill(`QA booking ${run}`);
    await visible(page, 'input[type="email"]').first().fill(email('booking'));
    await humanPause(page);
    await visible(page, 'button[type="submit"]').first().click();
  }
  const write = picked ? await waitForCall(w.calls, /\/rest\/v1\/rpc\/request_booking/) : undefined;
  if (picked && !write) errors.push('request_booking was never called — the block failed before its request left');
  const row = picked && (await rowExists(db, 'SELECT 1 FROM bookings WHERE customer_email = $1', [email('booking')]));
  errors.push(...w.pageErrors);
  const warnings = w.calls.filter((c) => c.status >= 400 && !/request_booking/.test(c.url)).map((c) => `${c.status} ${c.url}`);
  await snap(page, 'booking');
  return verdict({ block: 'booking (smart)', calls: w.calls, page: slug, write, row: !!row, errors, warnings });
}

async function formBlock(page: Page, base: string, slug: string, db: Client, sb: string): Promise<BlockResult> {
  const w = watch(page, sb);
  const errors: string[] = [];
  const main = page.locator('main');
  await arrive(page, `${base}/${slug}`, 'button[type="submit"]');
  await main.getByLabel(/^name/i).first().fill(`QA form ${run}`);
  await main.getByLabel(/^email/i).first().fill(email('form'));
  await main.getByLabel(/^message/i).first().fill('Public-blocks test submission');
  await humanPause(page);
  await visible(page, 'button[type="submit"]').first().click();
  const write = await waitForCall(w.calls, /\/rest\/v1\/form_submissions/);
  if (!write) errors.push('form_submissions was never written — the block failed before its request left');
  const row = await rowExists(db, `SELECT 1 FROM form_submissions WHERE data->>'Email' = $1`, [email('form')]);
  // The lead rail must have gone through the RPC, not the fallback (the #661 class).
  const lead = await waitForCall(w.calls, /\/rest\/v1\/rpc\/ingest_form_lead/, 5_000);
  const warnings = w.calls.filter((c) => c.status >= 400 && !/form_submissions/.test(c.url)).map((c) => `${c.status} ${c.url}`);
  if (!lead) errors.push('ingest_form_lead was never called — the lead rail fell back or broke');
  else if (lead.status >= 400) errors.push(`ingest_form_lead answered ${lead.status}`);
  errors.push(...w.pageErrors);
  await snap(page, 'form');
  return verdict({ block: 'form', calls: w.calls, page: slug, write, row, errors, warnings });
}

async function webinarBlock(page: Page, base: string, slug: string, db: Client, sb: string): Promise<BlockResult> {
  const w = watch(page, sb);
  const errors: string[] = [];
  const main = page.locator('main');
  await arrive(page, `${base}/${slug}`, `:text("QA webinar ${run}")`);
  // The smallest element that holds both this run's title and a Register button is its card.
  const card = main.locator('div')
    .filter({ hasText: `QA webinar ${run}` })
    .filter({ has: page.getByRole('button', { name: /register/i }) })
    .last();
  const open = card.getByRole('button', { name: /register/i }).first();
  if (!(await open.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false))) errors.push(`the webinar "QA webinar ${run}" was not offered`);
  else {
    await open.click();
    await nameField(page).fill(`QA webinar ${run}`);
    await visible(page, 'input[type="email"]').first().fill(email('webinar'));
    await humanPause(page);
    await visible(page, 'button[type="submit"]').first().click();
  }
  const write = await waitForCall(w.calls, /\/rest\/v1\/rpc\/register_for_webinar/);
  if (!write && errors.length === 0) errors.push('register_for_webinar was never called — the block failed before its request left');
  const row = await rowExists(db, 'SELECT 1 FROM webinar_registrations WHERE email = $1', [email('webinar')]);
  errors.push(...w.pageErrors);
  const warnings = w.calls.filter((c) => c.status >= 400 && !/register_for_webinar/.test(c.url)).map((c) => `${c.status} ${c.url}`);
  await snap(page, 'webinar');
  return verdict({ block: 'webinar sign-up', calls: w.calls, page: slug, write, row, errors, warnings });
}

async function newsletterBlock(page: Page, base: string, slug: string, db: Client, sb: string): Promise<BlockResult> {
  const w = watch(page, sb);
  const errors: string[] = [];
  const main = page.locator('main');
  await arrive(page, `${base}/${slug}`, 'input[type="email"]');
  await visible(page, 'input[type="email"]').first().fill(email('newsletter'));
  await humanPause(page);
  await visible(page, 'button[type="submit"]').first().click();
  const write = await waitForCall(w.calls, /\/functions\/v1\/newsletter\/subscribe/);
  if (!write) errors.push('newsletter/subscribe was never called — the block failed before its request left');
  const row = await rowExists(db, 'SELECT 1 FROM newsletter_subscribers WHERE lower(email) = lower($1)', [email('newsletter')]);
  errors.push(...w.pageErrors);
  const warnings = w.calls.filter((c) => c.status >= 400 && !/newsletter\/subscribe/.test(c.url)).map((c) => `${c.status} ${c.url}`);
  await snap(page, 'newsletter');
  return verdict({ block: 'newsletter', calls: w.calls, page: slug, write, row, errors, warnings });
}

async function main(): Promise<number> {
  const cfg = readStackConfig();
  assertLocal(cfg.supabaseUrl, 'the Supabase URL');
  assertLocal(DATABASE_URL.replace(/^postgres(ql)?:/, 'http:'), 'the database URL');
  if (baseUrlArg) assertLocal(baseUrlArg, '--base-url');

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  let vite: Awaited<ReturnType<typeof startVite>> | null = null;
  let browser: Browser | null = null;
  try {
    const pages = await seed(db);
    vite = baseUrlArg ? null : await startVite(cfg, await freePort(5299));
    const base = baseUrlArg ?? vite!.baseUrl;

    const executablePath = process.env.VIEW_SWEEP_BROWSER || undefined;
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : { channel: 'chrome' }), headless: !headed });
    // No session, no stored consent: a first-time visitor. Each block gets its own context.
    const fresh = async () => (await browser!.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' })).newPage();

    // A block that cannot be driven (a control never appears) fails as that
    // block — it is a finding about the page, not about the tool.
    const guarded = async (block: string, slug: string, run: (p: Page) => Promise<BlockResult>): Promise<BlockResult> => {
      const p = await fresh();
      try {
        return await run(p);
      } catch (e) {
        await snap(p, block.split(' ')[0]);
        return { block, page: slug, verdict: 'fail', row: false, errors: [`could not be used: ${(e as Error).message.split('\n')[0]}`], warnings: [] };
      }
    };
    const results: BlockResult[] = [];
    results.push(await guarded('booking (smart)', pages.booking, (p) => bookingBlock(p, base, pages.booking, pages.serviceName, db, cfg.supabaseUrl)));
    results.push(await guarded('form', pages.form, (p) => formBlock(p, base, pages.form, db, cfg.supabaseUrl)));
    results.push(await guarded('webinar sign-up', pages.webinar, (p) => webinarBlock(p, base, pages.webinar, db, cfg.supabaseUrl)));
    results.push(await guarded('newsletter', pages.newsletter, (p) => newsletterBlock(p, base, pages.newsletter, db, cfg.supabaseUrl)));

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify({ run, base, results }, null, 2));
    console.log(`\npublic blocks as a visitor — run ${run}\n`);
    for (const r of results) {
      console.log(`${r.verdict === 'pass' ? 'PASS' : 'FAIL'}  ${r.block.padEnd(18)} write ${r.write ? r.write.status : '—'}  row ${r.row ? 'yes' : 'no'}`);
      for (const e of r.errors) console.log(`        ✗ ${e}`);
      for (const wn of r.warnings) console.log(`        ⚠ ${wn}`);
    }
    const failed = results.filter((r) => r.verdict === 'fail').length;
    console.log(`\n${results.length - failed}/${results.length} blocks passed · report: .public-blocks/report.json`);
    return failed ? 1 : 0;
  } finally {
    await browser?.close().catch(() => {});
    vite?.proc.kill('SIGTERM');
    await db.end().catch(() => {});
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`public-blocks: TOOL FAILURE — ${(e as Error).message}`);
    process.exit(2);
  },
);
