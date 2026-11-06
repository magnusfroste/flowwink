/**
 * ONE module switch (2026-11-06). Switching a module on or off is four
 * writes that must agree — the row, the skills (both flags, one write), the
 * automations that run them, the decision record — and there used to be two
 * implementations (manage_modules on the server; a browser teardown that
 * stopped automations by seeded name and recorded no ids) and three more
 * writers of the row alone (the bulk toggle, manage_site_settings
 * key=modules, install_template). Now there is one implementation,
 * _shared/modules/module-switch.ts, and every writer runs it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { withParents } from '../../../supabase/functions/_shared/modules/module-switch';
import type { ModuleCatalogEntry } from '../../../supabase/functions/_shared/modules/module-plan';

const read = (p: string) => readFileSync(p, 'utf8');
const exec = read('supabase/functions/agent-execute/index.ts');
const sw = read('supabase/functions/_shared/modules/module-switch.ts');

const cat = (id: string, requires: string[] = []): ModuleCatalogEntry => ({ moduleId: id, name: id, tier: null, requires, tables: [], core: false });

describe('one module switch', () => {
  it('the switch writes all four things, in order, and records what enable resumes', () => {
    const order = ['upsert({ key: \'modules\'', 'hideSkills(db, mine)', ".from('agent_automations').update({ enabled: false }).in('skill_name', own)", "key: 'module_teardowns'"];
    let at = -1;
    for (const needle of order) {
      const i = sw.indexOf(needle);
      expect(i, needle).toBeGreaterThan(at);
      at = i;
    }
    expect(sw).toMatch(/automation_ids: \(\(stopped \?\? \[\]\) as NamedRow\[\]\)\.map\(\(a\) => a\.id\)/);
    expect(sw).toMatch(/\.from\('agent_automations'\)\.update\(\{ enabled: true \}\)\.in\('id', ids\)/);
    // A switch-off supersedes a keep; the audit row never gates the switch.
    expect(sw).toMatch(/delete keeps\[id\]; \/\/ a switch-off supersedes an earlier keep/);
    expect(sw).toMatch(/\.then\(\(\) => undefined, \(\) => undefined\)/);
  });

  it('every writer of the modules row on the server runs the switch', () => {
    // manage_modules, manage_site_settings key=modules and install_template.
    expect(exec.match(/switchModules\(supabase, MODULE_CATALOG, ARTIFACT_MODULES, \{/g)?.length).toBe(3);
    expect(exec).toMatch(/via: 'manage_modules'/);
    expect(exec).toMatch(/via: 'manage_site_settings'/);
    expect(exec).toMatch(/via: 'install_template'/);
    // No bare write of an enabled flag onto the row outside the switch (the
    // wake path writes the whole object: autoActivateModule, judged by its own guard).
    const bare = exec.match(/upsert\(\{ key: 'modules', value: /g) ?? [];
    expect(bare, 'a bare upsert of the modules row outside the switch').toEqual([]);
    // A template's enable takes the parents along.
    expect(exec).toMatch(/modules: withParents\(MODULE_CATALOG, template\.requiredModules\.map\(String\)\)/);
    // manage_site_settings: the flags go through the switch, the rest merges, enabled is the switch's.
    expect(exec).toMatch(/if \(sw\.refusals\.length\) throw new Error\(`modules not changed: \$\{sw\.refusal_text\}/);
    expect(exec).toMatch(/const \{ enabled: _ignored, \.\.\.rest \} = cfg as Record<string, unknown>;/);
  });

  it('the browser runs the same switch — awaited, errors shown, bulk included', () => {
    const page = read('src/pages/admin/ModulesPage.tsx');
    expect(page.match(/await switchModulesFromAdmin\(localModules, enabled \? 'enable' : 'disable', /g)?.length).toBe(2);
    expect(page).not.toMatch(/teardownModule\(id\)\.catch\(\(\) => \{\}\)/);
    expect(page).not.toMatch(/recordModuleDecisions/);
    expect(read('src/lib/module-bootstrap.ts')).not.toMatch(/export async function (teardownModule|recordModuleDecisions)/);
    // The browser's catalogues come from what it has: the registry and the row.
    const client = read('src/lib/module-switch.ts');
    expect(client).toMatch(/export function browserModuleCatalog\(modules: ModulesSettings\): ModuleCatalogEntry\[\]/);
    expect(client).toMatch(/export function browserArtifactModules\(\): ArtifactModule\[\]/);
  });

  it('withParents lists every parent before its child, once', () => {
    const catalog = [cat('leads'), cat('deals', ['leads']), cat('quotes', ['deals', 'leads']), cat('pages')];
    expect(withParents(catalog, ['quotes'])).toEqual(['leads', 'deals', 'quotes']);
    expect(withParents(catalog, ['deals', 'quotes', 'pages'])).toEqual(['leads', 'deals', 'quotes', 'pages']);
  });
});
