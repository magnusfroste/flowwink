/**
 * Process views — the processes proven to the screen a person looks at.
 *
 *   npm run qa:process-views            (after npm run qa:processes)
 *   npm run qa:process-views -- --base-url=http://127.0.0.1:5199
 *
 * The process battery proves the DATA: an order is paid, its sale is booked,
 * its receipt is an invoice. Nobody sat in front of /admin/invoices to see
 * that the receipt is there — and on an instance nobody runs the processes by
 * hand, nobody ever will. Each scenario declares where its outcome shows
 * (`s.shows(label, route, text)` → views in process-battery-report.json, with
 * a text only that run wrote). This opens every one of those routes as an
 * admin in a real browser and requires the text on the page.
 *
 * Local stack only (it signs in as admin), exactly like the view sweep, whose
 * fixtures, stack and Vite start it reuses. Writes
 * .qa-output/process-views-report.json and exits non-zero when a process's
 * outcome is not where it says it is.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { Client } from 'pg';
import { chromium, type Browser } from 'playwright-core';
import { assertLocal, createFixtureUser, deleteFixtureUser, storageKeyFor, type FixtureUser } from '../view-sweep/fixtures';
import { freePort, readStackConfig, startVite } from '../view-sweep/stack';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const REPORT_IN = join(REPO_ROOT, '.qa-output/process-battery-report.json');
const REPORT_OUT = join(REPO_ROOT, '.qa-output/process-views-report.json');
const SHOTS = join(REPO_ROOT, '.qa-output/process-views');
const DATABASE_URL = process.env.VIEW_SWEEP_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const arg = (name: string) => {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit?.includes('=') ? hit.slice(hit.indexOf('=') + 1) : hit ? 'true' : undefined;
};

interface View { label: string; route: string; text: string }
interface Result extends View { process: string; ok: boolean; detail: string; ms: number }

async function main(): Promise<number> {
  if (!existsSync(REPORT_IN)) {
    console.error('process-views: no .qa-output/process-battery-report.json — run `npm run qa:processes` first.');
    return 2;
  }
  const battery = JSON.parse(readFileSync(REPORT_IN, 'utf8')) as { reports: Array<{ process: string; status: string; views?: View[] }> };
  const wanted = battery.reports.flatMap((r) => (r.views ?? []).map((v) => ({ ...v, process: r.process })));
  if (!wanted.length) {
    console.log('process-views: the battery report declares no views — nothing to prove.');
    return 0;
  }

  const cfg = readStackConfig();
  assertLocal(cfg.supabaseUrl, 'the Supabase URL');
  assertLocal(DATABASE_URL.replace(/^postgres(ql)?:/, 'http:'), 'the database URL');
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  let vite: ChildProcess | null = null;
  let browser: Browser | null = null;
  let admin: FixtureUser | null = null;
  const results: Result[] = [];
  try {
    let baseUrl = arg('base-url') ?? '';
    if (baseUrl) assertLocal(baseUrl, '--base-url');
    else {
      const started = await startVite(cfg, await freePort(Number(arg('port') ?? 5198)));
      vite = started.proc;
      baseUrl = started.baseUrl;
    }
    admin = await createFixtureUser(cfg, db, Date.now().toString(36), 'process-views-admin', ['admin']);
    const executablePath = process.env.VIEW_SWEEP_BROWSER || undefined;
    // As the view sweep: VIEW_SWEEP_BROWSER wins; on CI the runner's system Chrome; locally Playwright's own Chromium.
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : process.env.CI ? { channel: 'chrome' } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
    await context.addInitScript(([key, value]) => {
      try { if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value); } catch { /* opaque origin */ }
    }, [storageKeyFor(cfg.supabaseUrl), JSON.stringify(admin.session)] as const);
    const timeout = Number(arg('timeout') ?? 20_000);

    for (const v of wanted) {
      const page = await context.newPage();
      const started = Date.now();
      try {
        await page.goto(baseUrl + v.route, { waitUntil: 'domcontentloaded', timeout });
        await page.getByText(v.text, { exact: false }).first().waitFor({ state: 'visible', timeout });
        results.push({ ...v, ok: true, detail: 'shown', ms: Date.now() - started });
      } catch (e) {
        const path = new URL(page.url()).pathname;
        // What the page showed instead — the finding is unreadable without it.
        const shot = join(SHOTS, `${v.process}-${results.length}.png`);
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
        results.push({ ...v, ok: false, detail: `"${v.text}" not on ${path} within ${timeout} ms (${(e as Error).message.split('\n')[0].slice(0, 120)})`, ms: Date.now() - started });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close().catch(() => undefined);
    if (vite && vite.exitCode === null) vite.kill('SIGTERM');
    if (admin) await deleteFixtureUser(cfg, admin);
    await db.end().catch(() => undefined);
  }

  mkdirSync(join(REPO_ROOT, '.qa-output'), { recursive: true });
  writeFileSync(REPORT_OUT, JSON.stringify({ ran_at: new Date().toISOString(), results }, null, 2));
  for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.process.padEnd(22)} ${r.label} — ${r.route}${r.ok ? '' : `\n     ${r.detail}`}`);
  const red = results.filter((r) => !r.ok);
  console.log(`\n${results.length - red.length}/${results.length} process outcomes shown where they say  →  .qa-output/process-views-report.json`);
  return red.length ? 1 : 0;
}

process.exit(await main());
