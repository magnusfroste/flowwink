import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchModulesRow } from '../modules-patch';

/**
 * Guardrail: an admin save writes its change, not its tab's copy.
 *
 * Found on liteit 2026-11-04: forms and salesIntelligence were switched off
 * through an approved manage_modules at 16:07; the next day siteMigration was
 * switched off in an admin tab loaded before that, and useUpdateModules wrote
 * the tab's whole cached object — forms and salesIntelligence back on, the
 * approval silently undone.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('patchModulesRow', () => {
  // The tab read this before the approval ran.
  const staleTab = { forms: { enabled: true }, salesIntelligence: { enabled: true }, siteMigration: { enabled: true } };
  // The row after the approval.
  const now = { forms: { enabled: false }, salesIntelligence: { enabled: false }, siteMigration: { enabled: true } };

  it('a toggle from a stale tab changes that module only — an approved switch-off stays off', () => {
    const edited = { ...staleTab, siteMigration: { enabled: false } };
    const { value, enabledChanges, touched } = patchModulesRow(now, staleTab, edited);
    expect(value).toEqual({ forms: { enabled: false }, salesIntelligence: { enabled: false }, siteMigration: { enabled: false } });
    expect(touched).toEqual(['siteMigration']);
    expect(enabledChanges).toEqual([{ id: 'siteMigration', enabled: false }]);
  });

  it('a setting change carries only that field and keeps what others wrote on the same module', () => {
    const stored = { ecommerce: { enabled: true, vatRatePct: 25, pricesIncludeVat: false } };
    const baseline = { ecommerce: { enabled: true, vatRatePct: 25, pricesIncludeVat: true } };
    const edited = { ecommerce: { ...baseline.ecommerce, vatRatePct: 12 } };
    const { value, enabledChanges } = patchModulesRow(stored, baseline, edited);
    expect(value.ecommerce).toEqual({ enabled: true, vatRatePct: 12, pricesIncludeVat: false });
    expect(enabledChanges).toEqual([]);
  });

  it('no change is no write; without a baseline the caller\'s fields still merge onto the row', () => {
    expect(patchModulesRow(now, now, now).touched).toEqual([]);
    const { value } = patchModulesRow(now, undefined, { reports: { enabled: true } });
    expect(value).toEqual({ ...now, reports: { enabled: true } });
  });

  it('a toggle on a birth-seeded {enabled} row leaves the full entry — the readiness "module choice" signal', () => {
    const born = { forms: { enabled: true } };
    const tab = { forms: { enabled: true, name: 'Forms', adminUI: true } };
    const { value } = patchModulesRow(born, tab, { forms: { ...tab.forms, enabled: false } });
    expect(value.forms).toEqual({ enabled: false, name: 'Forms', adminUI: true });
  });

  it('an enabled change that matches the row already is not reported as a flip', () => {
    const { enabledChanges } = patchModulesRow(now, staleTab, { ...staleTab, forms: { enabled: false } });
    expect(enabledChanges).toEqual([]);
  });
});

describe('the admin save path', () => {
  it('useUpdateModules writes the patch onto a fresh read and re-reads instead of caching its copy', () => {
    const hook = read('src/hooks/useModules.tsx');
    const fn = hook.slice(hook.indexOf('export function useUpdateModules'), hook.indexOf('export function useIsModuleEnabled'));
    expect(fn).toMatch(/\.select\('id, value'\)/);
    expect(fn).toMatch(/patchModulesRow\(/);
    expect(fn).toMatch(/const jsonValue = value as unknown as Json/);
    expect(fn).toMatch(/invalidateQueries\(\{ queryKey: \['site-settings', 'modules'\] \}\)/);
    expect(fn).not.toMatch(/setQueryData\(\['site-settings', 'modules'\], modules\)/);
  });

  it('a toggle in /admin/modules is recorded as a decision and tears down every module it switched off', () => {
    const page = read('src/pages/admin/ModulesPage.tsx');
    expect(page).toMatch(/await recordModuleDecisions\(flipped\)/);
    expect(page).toMatch(/for \(const id of off\) await teardownModule\(id\)/);
    const boot = read('src/lib/module-bootstrap.ts');
    expect(boot).toMatch(/export async function recordModuleDecisions/);
    expect(boot).toMatch(/key: 'module_teardowns'/);
  });
});
