/**
 * View sweep — a headless crawl of every frontend route, per role, against the
 * LOCAL Supabase stack.
 *
 *   npm run qa:views
 *   npm run qa:views -- --roles=admin,staff --only=/admin/orders --concurrency=2
 *
 * What it does, in order:
 *   1. reads the route table out of src/App.tsx (routes.ts — discovered, never listed)
 *   2. resolves `:id` / `:slug` params from real rows (params.ts — a route without
 *      data is reported `skipped: no data`, never dropped)
 *   3. creates four throwaway sign-ins in the local database (fixtures.ts)
 *   4. starts its own Vite dev server pointed at the local stack, visits every
 *      route with system Chrome (crawl.ts) and writes down page errors, console
 *      errors, Supabase responses ≥ 400, blank/stuck pages and role-matrix mismatches
 *   5. writes view-sweep-report.json + .md under .view-sweep/ (gitignored) and
 *      exits non-zero when there are error-level findings
 *
 * It REFUSES to run against anything but 127.0.0.1/localhost: it creates users
 * and signs in as admin. There is deliberately no flag to override that.
 *
 * Stack credentials are read from the environment (VIEW_SWEEP_ANON_KEY,
 * VIEW_SWEEP_SERVICE_ROLE_KEY) or, when unset, from `supabase status -o env`
 * (binary: $SUPABASE_BIN, directory: $SUPABASE_WORKDIR). They are never printed
 * and never written to the report.
 *
 * Flags:
 *   --roles=anonymous,admin,staff,customer   which sweeps to run (default: all)
 *   --staff-role=<app_role>                  default: fewest grants in role_module_access_defaults
 *   --only=<substring>                       only route patterns containing this
 *   --base-url=http://127.0.0.1:4173         use a running frontend instead of starting Vite
 *   --concurrency=3  --timeout=15000  --port=5199  --out=.view-sweep
 *   --keep-users                             leave the fixture users in place
 *   --headed                                 watch it
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { chromium, type Browser } from 'playwright-core';
import { findNavMatch, isRouteAllowed } from '@/lib/admin-route-access';
import type { AppRole } from '@/types/cms';
import { discoverRoutes, fillPattern, type RouteArea } from './routes';
import { resolveParams, type Resolution } from './params';
import {
  assertLocal,
  createFixtureUser,
  deleteFixtureUser,
  loadAccessMap,
  pickMostRestrictedRole,
  storageKeyFor,
  type FixtureUser,
  type StackConfig,
} from './fixtures';
import { runPool, visitRoute, type RouteResult, type VisitInput } from './crawl';
import { groupFindings, noiseFilterManifest, writeReport, type RoleCoverage, type SkippedRoute } from './report';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const DEFAULT_SUPABASE_URL = 'http://127.0.0.1:54321';
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true';
}

function readStackConfig(): StackConfig {
  let supabaseUrl = process.env.VIEW_SWEEP_SUPABASE_URL ?? '';
  let anonKey = process.env.VIEW_SWEEP_ANON_KEY ?? '';
  let serviceRoleKey = process.env.VIEW_SWEEP_SERVICE_ROLE_KEY ?? '';
  if (!anonKey || !serviceRoleKey) {
    const bin = process.env.SUPABASE_BIN ?? 'supabase';
    const cwd = process.env.SUPABASE_WORKDIR ?? REPO_ROOT;
    let out: string;
    try {
      out = execFileSync(bin, ['status', '-o', 'env'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
      throw new Error(
        `view-sweep: no stack credentials. Set VIEW_SWEEP_ANON_KEY and VIEW_SWEEP_SERVICE_ROLE_KEY, or make \`${bin} status -o env\` work in ${cwd} ` +
          `(SUPABASE_BIN / SUPABASE_WORKDIR). Underlying: ${(e as Error).message.split('\n')[0]}`,
      );
    }
    const env: Record<string, string> = {};
    for (const line of out.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
      if (m) env[m[1]] = m[2];
    }
    supabaseUrl ||= env.API_URL ?? '';
    anonKey ||= env.ANON_KEY ?? env.PUBLISHABLE_KEY ?? '';
    serviceRoleKey ||= env.SERVICE_ROLE_KEY ?? env.SECRET_KEY ?? '';
  }
  supabaseUrl ||= DEFAULT_SUPABASE_URL;
  if (!anonKey || !serviceRoleKey) throw new Error('view-sweep: stack credentials incomplete (anon key / service role key missing)');
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), anonKey, serviceRoleKey };
}

async function freePort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + 30; port++) {
    const ok = await new Promise<boolean>((res) => {
      const srv = createServer();
      srv.once('error', () => res(false));
      srv.listen(port, '127.0.0.1', () => srv.close(() => res(true)));
    });
    if (ok) return port;
  }
  throw new Error(`view-sweep: no free port in ${preferred}–${preferred + 29}`);
}

async function startVite(cfg: StackConfig, port: number): Promise<{ proc: ChildProcess; baseUrl: string }> {
  // vite directly — `npm run dev` carries a migration pre-step the sweep must not run.
  const proc = spawn(join(REPO_ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: REPO_ROOT,
    env: { ...process.env, VITE_SUPABASE_URL: cfg.supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: cfg.anonKey, VITE_SUPABASE_PROJECT_ID: 'local' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout?.on('data', (d: Buffer) => (log += d.toString()));
  proc.stderr?.on('data', (d: Buffer) => (log += d.toString()));
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`view-sweep: vite exited early (${proc.exitCode}):\n${log.slice(-800)}`);
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { proc, baseUrl };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill('SIGTERM');
  throw new Error(`view-sweep: vite did not answer on ${baseUrl} within 60 s:\n${log.slice(-800)}`);
}

interface RolePlan {
  role: string;
  appRoles: string[];
  area: RouteArea;
  signedIn: boolean;
  /** A page only this role's session can open — proves the injected session took. */
  canary: string | null;
  expectServed: ((finalPath: string) => boolean) | null;
}

async function main(): Promise<number> {
  const startedAt = new Date().toISOString();
  const cfg = readStackConfig();
  const databaseUrl = process.env.VIEW_SWEEP_DATABASE_URL ?? DEFAULT_DATABASE_URL;
  assertLocal(cfg.supabaseUrl, 'the Supabase URL');
  assertLocal(databaseUrl.replace(/^postgres(ql)?:/, 'http:'), 'the database URL');

  const wantRoles = (arg('roles') ?? 'anonymous,admin,staff,customer').split(',').map((s) => s.trim()).filter(Boolean);
  const only = arg('only');
  const concurrency = Number(arg('concurrency') ?? 3);
  const routeTimeoutMs = Number(arg('timeout') ?? 15_000);
  const outDir = resolve(REPO_ROOT, arg('out') ?? '.view-sweep');
  const notes: string[] = [];

  const routes = discoverRoutes(join(REPO_ROOT, 'src/App.tsx'), REPO_ROOT);
  console.log(`view-sweep: ${routes.length} routes discovered in src/App.tsx`);

  const db = new Client({ connectionString: databaseUrl });
  await db.connect();

  let vite: ChildProcess | null = null;
  let browser: Browser | null = null;
  const users: FixtureUser[] = [];
  const results: RouteResult[] = [];
  const skipped: SkippedRoute[] = [];
  const coverage: RoleCoverage[] = [];
  let baseUrl = arg('base-url') ?? '';

  const cleanup = async () => {
    await browser?.close().catch(() => undefined);
    if (vite && vite.exitCode === null) vite.kill('SIGTERM');
    if (!arg('keep-users')) {
      for (const u of users.splice(0)) {
        const err = await deleteFixtureUser(cfg, u);
        if (err) {
          notes.push(`Fixture user ${u.email} could not be deleted (${err}) — remove it by hand.`);
          console.warn(`view-sweep: could not delete fixture user ${u.email}: ${err}`);
        }
      }
    }
    await db.end().catch(() => undefined);
  };
  process.once('SIGINT', () => void cleanup().then(() => process.exit(130)));
  process.once('SIGTERM', () => void cleanup().then(() => process.exit(143)));

  try {
    if (baseUrl) assertLocal(baseUrl, '--base-url');
    else {
      const started = await startVite(cfg, await freePort(Number(arg('port') ?? 5199)));
      vite = started.proc;
      baseUrl = started.baseUrl;
    }
    console.log(`view-sweep: frontend ${baseUrl} → ${cfg.supabaseUrl}`);

    // ── role plans ──────────────────────────────────────────────────────
    const accessMap = await loadAccessMap(db);
    let staffRole = arg('staff-role') ?? '';
    if (wantRoles.includes('staff') && !staffRole) {
      const picked = await pickMostRestrictedRole(db);
      if (picked) {
        staffRole = picked.role;
        notes.push(`Restricted staff role: \`${picked.role}\` — fewest default grants (${picked.grants}) in role_module_access_defaults.`);
      } else {
        notes.push('Restricted staff sweep SKIPPED: role_module_access_defaults is empty, so there is no seeded role to pick (platform-config seed gap).');
      }
    }
    const plans: RolePlan[] = [];
    for (const r of wantRoles) {
      if (r === 'anonymous') plans.push({ role: 'anonymous', appRoles: [], area: 'public', signedIn: false, canary: null, expectServed: null });
      else if (r === 'admin') plans.push({ role: 'admin', appRoles: ['admin'], area: 'admin', signedIn: true, canary: '/admin/profile', expectServed: () => true });
      else if (r === 'staff' && staffRole) {
        const typed = Object.fromEntries(Object.entries(accessMap)) as Partial<Record<AppRole, Set<string>>>;
        plans.push({
          role: `staff:${staffRole}`,
          appRoles: [staffRole],
          area: 'admin',
          signedIn: true,
          canary: '/admin/profile',
          // The SAME function AdminLayout gates with — the sweep must not carry
          // its own opinion of the role matrix.
          expectServed: (finalPath) =>
            finalPath === '/admin' || finalPath.startsWith('/admin/')
              ? isRouteAllowed(finalPath, { isAdmin: false, roles: [staffRole as AppRole], accessMap: typed })
              : true,
        });
      } else if (r === 'customer') plans.push({ role: 'customer', appRoles: ['customer'], area: 'portal', signedIn: true, canary: '/account/profile', expectServed: null });
      else if (r !== 'staff') throw new Error(`view-sweep: unknown role "${r}"`);
    }

    // ── fixtures: admin FIRST (on a virgin instance the first signup claims admin) ──
    const runId = Date.now().toString(36);
    const ordered = [...plans].sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin'));
    const sessions = new Map<string, FixtureUser>();
    for (const p of ordered) {
      if (!p.signedIn) continue;
      const u = await createFixtureUser(cfg, db, runId, p.role.replace(/[^a-z0-9]+/gi, '-'), p.appRoles);
      users.push(u);
      sessions.set(p.role, u);
    }

    browser = await chromium.launch({ channel: 'chrome', headless: !arg('headed') });
    const storageKey = storageKeyFor(cfg.supabaseUrl);
    const paramCache = new Map<string, Resolution>();

    for (const plan of plans) {
      const inArea = routes.filter((r) => r.area === plan.area && (!only || r.pattern.includes(only)));
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
      const user = sessions.get(plan.role);
      if (user) {
        await context.addInitScript(
          ([key, value]) => {
            try {
              // Only when absent: a token supabase-js refreshed mid-run must win.
              if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
            } catch {
              /* opaque origin */
            }
          },
          [storageKey, JSON.stringify(user.session)] as const,
        );
      }

      if (plan.canary) {
        const check = await visitRoute(
          context,
          { role: plan.role, pattern: plan.canary, path: plan.canary, source: 'canary', declaredRedirect: null, expectServed: null },
          { baseUrl, supabaseUrl: cfg.supabaseUrl, outDir, routeTimeoutMs: 30_000 },
        );
        if (check.outcome !== 'served') {
          notes.push(`TOOL FAILURE for ${plan.role}: session injection did not take (canary ${plan.canary} → ${check.outcome}, final ${check.finalPath}). Role not swept.`);
          for (const r of inArea) skipped.push({ role: plan.role, pattern: r.pattern, source: r.source, reason: 'tool failure: could not sign in' });
          coverage.push({ role: plan.role, appRoles: plan.appRoles, area: plan.area, discovered: inArea.length, swept: 0, skipped: inArea.length, routesWithErrors: 0, routesWithWarningsOnly: 0 });
          await context.close();
          continue;
        }
      }

      const visits: VisitInput[] = [];
      let skippedHere = 0;
      for (const r of inArea) {
        let path = r.pattern;
        if (r.params.length) {
          let res = paramCache.get(r.pattern);
          if (!res) {
            res = await resolveParams(db, r.pattern, r.params);
            paramCache.set(r.pattern, res);
          }
          if (!res.ok) {
            skipped.push({ role: plan.role, pattern: r.pattern, source: r.source, reason: res.reason });
            skippedHere++;
            continue;
          }
          path = fillPattern(r.pattern, res.values);
        }
        visits.push({ role: plan.role, pattern: r.pattern, path, source: r.source, declaredRedirect: r.redirectTo, expectServed: plan.expectServed });
      }

      console.log(`view-sweep: ${plan.role} — ${visits.length} routes (${skippedHere} skipped)`);
      let done = 0;
      const roleResults = await runPool(visits, concurrency, async (v) => {
        const res = await visitRoute(context, v, { baseUrl, supabaseUrl: cfg.supabaseUrl, outDir, routeTimeoutMs });
        // The matrix oracle above is the app's own gate, so it cannot see what
        // that gate does not cover: isRouteAllowed() lets any path through that
        // no nav item claims. A restricted role being served such a page is
        // worth a line — the page either needs a nav home or its own guard.
        if (plan.role.startsWith('staff:') && res.outcome === 'served' && res.finalPath?.startsWith('/admin/') && !findNavMatch(res.finalPath)) {
          res.findings.push({
            kind: 'access-ungated',
            severity: 'warn',
            signature: 'access: admin route is outside the role matrix (no nav item claims it) and was served to the restricted role',
            message: `${res.finalPath} matches no navigationGroups item, so isRouteAllowed() returns true for every staff role`,
          });
        }
        done++;
        const errs = res.findings.filter((f) => f.severity === 'error').length;
        console.log(`  [${plan.role} ${done}/${visits.length}] ${errs ? 'FAIL' : 'ok  '} ${v.path} → ${res.outcome}${res.redirected ? ` (${res.finalPath})` : ''}${errs ? ` · ${errs} error(s)` : ''}`);
        return res;
      });
      results.push(...roleResults);
      coverage.push({
        role: plan.role,
        appRoles: plan.appRoles,
        area: plan.area,
        discovered: inArea.length,
        swept: roleResults.length,
        skipped: skippedHere,
        routesWithErrors: roleResults.filter((r) => r.findings.some((f) => f.severity === 'error')).length,
        routesWithWarningsOnly: roleResults.filter((r) => r.findings.length > 0 && !r.findings.some((f) => f.severity === 'error')).length,
      });
      await context.close();
    }
  } finally {
    await cleanup();
  }

  let gitCommit = 'unknown';
  try {
    gitCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    /* not a checkout */
  }
  const groups = groupFindings(results);
  const paths = writeReport(outDir, {
    tool: 'view-sweep',
    startedAt,
    finishedAt: new Date().toISOString(),
    supabaseUrl: cfg.supabaseUrl,
    baseUrl,
    gitCommit,
    routesDiscovered: routes.length,
    coverage,
    skipped,
    noiseFilters: noiseFilterManifest(),
    notes,
    groups,
    results,
  });

  const errorGroups = groups.filter((g) => g.severity === 'error').length;
  console.log(`\nview-sweep: ${results.length} visits · ${errorGroups} distinct error signature(s) · ${skipped.length} skipped`);
  console.log(`view-sweep: ${paths.markdown}\nview-sweep: ${paths.json}`);
  const toolFailure = notes.some((n) => n.startsWith('TOOL FAILURE'));
  return toolFailure ? 2 : errorGroups > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error((e as Error).message);
    process.exit(2);
  });
