/**
 * A panel of another module asks whether that module is on (2026-11-08).
 *
 * The Meeting polls tab under Bookings rendered its desk with Meeting Polls
 * off: the public page answered 404, every poll skill was refused, and the
 * feature looked present yet failed. Nothing caught it, because the route
 * gate judges the PAGE's module and the panel belonged to another one.
 *
 * Discover, don't enumerate: for every admin page the router mounts, every
 * component it imports from components/admin is judged by the tables it reads
 * (directly or through the hooks it imports) and the modules that declare
 * those tables (`data.tables`). A component whose every non-core table
 * belongs to a module that is neither the page's module nor one of its
 * parents is that module's panel; it must name the module in a gate
 * (`useIsModuleEnabled('<id>')`, `modules.<id>.enabled`, a `moduleId` prop…)
 * in its own file or in the page. A parent is always on when its child is,
 * and a core module cannot be switched off, so neither needs asking.
 *
 * The findings that existed when the guard was written are the baseline: the
 * number may only shrink — fix one and delete its line.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as modules from '@/lib/modules';
import { routeModuleId } from '@/lib/admin-route-access';
import { LEGACY_MODULE_DEPENDENCIES } from '@/lib/module-dependencies';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

type Mod = { id: string; requires?: string[]; data?: { tables?: string[] }; tables?: string[] };

/**
 * Reference data every module reads to render its own records — who a person
 * is, who can be assigned, what a currency is worth, what happened to a
 * record. Reading them does not make a component another module's panel, so
 * they never decide a component's home. Add a table here only with that
 * reason; a table that holds a module's own records belongs to it.
 */
const SHARED_REFERENCE_TABLES = new Set<string>([
  'profiles', 'user_roles',          // who someone is, what they may do
  'employees', 'support_agents',     // who can be assigned a visit, a ticket, a call
  'exchange_rates', 'currencies',    // what an amount is in the business currency
  'activities', 'entity_followers',  // the generic activity timeline any record carries
]);

const BASELINE = new Set<string>([
  // Gated upstream, where the scanner does not look: useInboxItems builds no
  // form or ticket item while Forms / Tickets is off, so these never mount.
  'FlowBoxPage.tsx | components/admin/flowbox/FormHandle.tsx → forms',
  'FlowBoxPage.tsx | components/admin/flowbox/TicketReply.tsx → tickets',
  // Read leads (CRM) as context — the task's record, an owner, a push target.
  // Left to judge one at a time: whether a CRM-less instance should see them.
  'ActivitiesPage.tsx | components/admin/CreateTaskDialog.tsx → leads|deals',
  'CompaniesPage.tsx | components/admin/OwnerChip.tsx → leads',
  'PurchaseOrdersPage.tsx | components/admin/purchasing/AutoReorderSettings.tsx → ecommerce',
  'FlowtablePage.tsx | components/admin/flowtable/FieldsMenu.tsx → leads',
  'QuotesPage.tsx | components/admin/OwnerChip.tsx → leads',
  'Customer360Page.tsx | components/admin/crm/RecordDiscussPanel.tsx → leads',
]);

function findings(): string[] {
  const mods = (Object.values(modules) as unknown[]).filter((m): m is Mod => !!m && typeof m === 'object' && typeof (m as Mod).id === 'string');
  const byId = new Map(mods.map((m) => [m.id, m]));
  const owner = new Map<string, Set<string>>();
  for (const m of mods) for (const t of m.data?.tables ?? m.tables ?? []) {
    if (!owner.has(t)) owner.set(t, new Set());
    owner.get(t)!.add(m.id);
  }
  // Core = cannot be switched off (`core: true` in useModules' defaults) — read as the skills artifact reads it.
  const core = new Set<string>();
  {
    let cur: string | null = null;
    for (const l of read('src/hooks/useModules.tsx').split('\n')) {
      const h = l.match(/^ {2}([A-Za-z0-9]+): \{\s*$/);
      if (h) cur = h[1];
      else if (/^\S/.test(l)) cur = null;
      else if (cur && /^\s{4}core: true,/.test(l)) core.add(cur);
    }
  }
  // Parents: the module's own `requires` plus the legacy edges, the same graph
  // /admin/modules and the skills artifact cascade along.
  const parentsOf = (id: string) => [...(byId.get(id)?.requires ?? []), ...(LEGACY_MODULE_DEPENDENCIES[id] ? [LEGACY_MODULE_DEPENDENCIES[id]] : [])];
  const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
    for (const p of parentsOf(id)) if (!seen.has(p)) { seen.add(p); ancestors(p, seen); }
    return seen;
  };
  const resolve = (spec: string): string | null => {
    const base = join('src', spec.replace(/^@\//, ''));
    return ['.tsx', '.ts', '/index.tsx', '/index.ts'].map((e) => base + e).find((p) => existsSync(join(ROOT, p))) ?? null;
  };
  const tablesOf = (src: string) => [...src.matchAll(/\.from\(\s*['"]([a-z_0-9]+)['"]/g)].map((m) => m[1]).filter((t) => !SHARED_REFERENCE_TABLES.has(t));
  const hookTables = new Map<string, string[]>();
  const tablesViaHooks = (src: string): string[] => [...src.matchAll(/from '(@\/hooks\/[^']+)'/g)].flatMap((m) => {
    if (!hookTables.has(m[1])) { const f = resolve(m[1]); hookTables.set(m[1], f ? tablesOf(read(f)) : []); }
    return hookTables.get(m[1])!;
  });

  const app = read('src/App.tsx');
  const pageFile = new Map<string, string>(
    [...app.matchAll(/const (\w+) = lazy\(\(\) => import\("\.\/pages\/admin\/([\w/.-]+)"\)\)/g)].map((m) => [m[1], `src/pages/admin/${m[2]}.tsx`]),
  );
  const pageModules = new Map<string, Set<string | null>>();
  for (const m of app.matchAll(/path: "(\/admin[^"]*)", element: <(\w+)/g)) {
    const f = pageFile.get(m[2]);
    if (!f) continue;
    if (!pageModules.has(f)) pageModules.set(f, new Set());
    pageModules.get(f)!.add(routeModuleId(m[1]));
  }

  const out: string[] = [];
  for (const [page, pms] of pageModules) {
    if (!existsSync(join(ROOT, page))) continue;
    const pageSrc = read(page);
    const allowed = (o: string) => core.has(o) || [...pms].some((pm) => pm === o || (pm !== null && ancestors(pm).has(o)));
    for (const m of pageSrc.matchAll(/from '(@\/components\/admin\/[^']+)'/g)) {
      const file = resolve(m[1]);
      if (!file || /AdminLayout|AdminPageContainer/.test(file)) continue;
      const src = read(file);
      const homes = new Set<string>();
      let local = false;
      for (const t of [...tablesOf(src), ...tablesViaHooks(src)]) for (const o of owner.get(t) ?? []) {
        if (allowed(o)) local = true; else homes.add(o);
      }
      if (local || !homes.size) continue;
      const gate = (id: string) => new RegExp(`['"\`]${id}['"\`]|\\.${id}\\??\\.enabled`);
      if ([...homes].some((id) => gate(id).test(src) || gate(id).test(pageSrc))) continue;
      out.push(`${page.replace('src/pages/admin/', '')} | ${file.replace('src/', '')} → ${[...homes].join('|')}`);
    }
  }
  return out;
}

describe('a panel of another module asks whether that module is on', () => {
  const found = findings();

  it('finds pages to judge (the scanner reads the router)', () => {
    expect(found.length + BASELINE.size).toBeGreaterThan(0);
  });

  it('no NEW ungated panel of a foreign module', () => {
    const fresh = found.filter((f) => !BASELINE.has(f));
    expect(fresh, `Gate these on their module (useIsModuleEnabled / the modules row), or mount them only when it is on:\n${fresh.join('\n')}`).toEqual([]);
  });

  it('the baseline only shrinks — a fixed finding leaves it', () => {
    const gone = [...BASELINE].filter((b) => !found.includes(b));
    expect(gone, `These no longer occur — delete them from BASELINE:\n${gone.join('\n')}`).toEqual([]);
  });

  it('the Meeting polls desk under Bookings is gated (the case that taught the guard)', () => {
    expect(found.some((f) => f.includes('MeetingPollsPanel'))).toBe(false);
  });
});
