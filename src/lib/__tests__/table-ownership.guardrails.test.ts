import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Table-ownership guardrail — keeps modules self-contained.
 *
 * WHY THIS EXISTS
 * ----------------
 * Modularity is FlowWink's core value, but three agents (Claude local, Lovable,
 * Claude cloud) commit concurrently and cross-module raw-table access creeps in:
 * an *invoicing* dialog reading `time_entries` directly, a *purchasing* panel
 * reading `products`, etc. Every such `.from('foreign_table')` is an undeclared
 * schema dependency — the owning module can't change its tables without an
 * unknowable blast radius. The sanctioned rails are `callSkill()` (routes through
 * agent-execute with audit + trust) or a hook exported by the owning domain.
 *
 * WHAT IT ASSERTS
 * ---------------
 * 1. SINGLE OWNERSHIP: every table appears in at most one module's
 *    `data.tables`. A table claimed by two modules is ambiguous ownership —
 *    fix by declaring one owner (or extend the CO_OWNED allowlist deliberately).
 * 2. NO NEW CROSS-MODULE UI READS: a file under `components/admin/<domain>/`
 *    whose domain maps to module A must not `.from()` a table owned by module B.
 *    The current offenders are frozen in GRANDFATHERED below — they are debt to
 *    pay down, but only *new* violations fail this test. To clear one, route the
 *    read through `callSkill` / an owning-domain hook and delete its entry.
 *
 * This is a static, self-contained check (no DB, no runtime) in the same spirit
 * as the other *.guardrails.test.ts files.
 */

const ROOT = join(__dirname, '..', '..', '..');
const MODULES_DIR = join(ROOT, 'src', 'lib', 'modules');
const ADMIN_DIR = join(ROOT, 'src', 'components', 'admin');

/** Admin UI sub-directory → the module that owns it. Only unambiguous dirs are
 *  listed; dirs not here are skipped (shared/cross-cutting UI). */
const DIR_TO_MODULE: Record<string, string> = {
  invoices: 'invoicing', crm: 'crm', accounting: 'accounting', hr: 'hr', blog: 'blog',
  expenses: 'expenses', timesheets: 'timesheets', quotes: 'quotes', contracts: 'contracts',
  projects: 'projects', tickets: 'tickets', bookings: 'bookings', inventory: 'inventory',
  purchasing: 'purchasing', recruitment: 'recruitment', subscriptions: 'subscriptions',
  newsletter: 'newsletter', surveys: 'surveys', webinars: 'webinars', pos: 'pos',
  deals: 'deals', companies: 'companies', reconciliation: 'reconciliation',
};

/** Tables deliberately shared by more than one module (declare with a reason). */
const CO_OWNED = new Set<string>([
  // (none today — every table has a single owner)
]);

/**
 * Frozen baseline of existing cross-module UI reads (file::table). These are
 * pre-existing debt captured 2026-07-23; the guardrail fails only on NEW
 * violations. Pay one down by routing through callSkill / an owning-domain hook,
 * then delete its line here.
 */
const GRANDFATHERED = new Set<string>([
  'src/components/admin/accounting/EventsToBookTab.tsx::bank_transactions',
  'src/components/admin/inventory/InventoryParityPanels.tsx::products',
  'src/components/admin/inventory/InventoryV2Panels.tsx::products',
  'src/components/admin/inventory/InventoryV2Panels.tsx::vendors',
  'src/components/admin/invoices/InvoiceFromTimesheetsDialog.tsx::leads',
  'src/components/admin/invoices/InvoiceFromTimesheetsDialog.tsx::projects',
  'src/components/admin/invoices/InvoiceFromTimesheetsDialog.tsx::time_entries',
  'src/components/admin/purchasing/AutoReorderSettings.tsx::product_stock',
  'src/components/admin/purchasing/PurchaseOrderEditor.tsx::products',
  'src/components/admin/purchasing/VendorProductsManager.tsx::products',
  'src/components/admin/tickets/TicketKbSuggestions.tsx::kb_articles',
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e)) acc.push(p);
  }
  return acc;
}

/** Build table → owning-module from each module def's `data.tables`. */
function buildTableOwners(): { owner: Map<string, string>; multi: Array<[string, string, string]> } {
  const owner = new Map<string, string>();
  const multi: Array<[string, string, string]> = [];
  for (const f of readdirSync(MODULES_DIR).filter((f) => f.endsWith('-module.ts'))) {
    const src = readFileSync(join(MODULES_DIR, f), 'utf8');
    const idm = src.match(/id:\s*['"]([a-zA-Z0-9_]+)['"]/);
    const modId = idm ? idm[1] : f.replace('-module.ts', '');
    const dm = src.match(/data:\s*\{[\s\S]*?tables:\s*\[([\s\S]*?)\]/);
    if (!dm) continue;
    for (const m of dm[1].matchAll(/['"]([a-z_][a-z0-9_]*)['"]/g)) {
      const t = m[1];
      if (CO_OWNED.has(t)) continue;
      if (owner.has(t) && owner.get(t) !== modId) multi.push([t, owner.get(t)!, modId]);
      else if (!owner.has(t)) owner.set(t, modId);
    }
  }
  return { owner, multi };
}

describe('table-ownership guardrail', () => {
  const { owner, multi } = buildTableOwners();

  it('every table is owned by exactly one module (declare shared tables in CO_OWNED)', () => {
    expect(
      multi,
      `Tables claimed by two modules' data.tables:\n${multi
        .map(([t, a, b]) => `  ${t}: ${a} vs ${b}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('no NEW cross-module raw-table read from an admin domain directory', () => {
    const violations: string[] = [];
    for (const fp of walk(ADMIN_DIR)) {
      const rel = relative(ROOT, fp).split('\\').join('/');
      const m = rel.match(/components\/admin\/([^/]+)\//);
      if (!m || !DIR_TO_MODULE[m[1]]) continue;
      const fileOwner = DIR_TO_MODULE[m[1]];
      const src = readFileSync(fp, 'utf8');
      for (const call of src.matchAll(/\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]/g)) {
        const tbl = call[1];
        const tblOwner = owner.get(tbl);
        if (tblOwner && tblOwner !== fileOwner && !GRANDFATHERED.has(`${rel}::${tbl}`)) {
          violations.push(`${rel} — ${fileOwner} reads ${tbl} (owned by ${tblOwner})`);
        }
      }
    }
    expect(
      violations,
      `New cross-module raw-table access. Route through callSkill() or an owning-\n` +
        `domain hook instead of .from(foreign_table). Offenders:\n  ${violations.join('\n  ')}`,
    ).toEqual([]);
  });

  it('grandfathered offenders still exist (prune the allowlist as debt is paid)', () => {
    // Keeps the allowlist honest: once a read is removed from the code, its line
    // here must be deleted too, or this fails — preventing a stale allowlist from
    // silently re-permitting a re-introduced violation.
    const live = new Set<string>();
    for (const fp of walk(ADMIN_DIR)) {
      const rel = relative(ROOT, fp).split('\\').join('/');
      const src = readFileSync(fp, 'utf8');
      for (const call of src.matchAll(/\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]/g)) {
        live.add(`${rel}::${call[1]}`);
      }
    }
    const stale = [...GRANDFATHERED].filter((g) => !live.has(g));
    expect(stale, `Stale allowlist entries (read is gone — delete these lines):\n  ${stale.join('\n  ')}`).toEqual([]);
  });
});
