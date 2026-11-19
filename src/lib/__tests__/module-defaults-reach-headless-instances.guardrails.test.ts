/**
 * Guardrail: a module added to the code reaches an instance no admin opens.
 *
 * MJP demo (mjpdemos.autoversio.ai), 2026-11-19: Feedback — on by default since
 * 2026-10-27 — had no key in site_settings.modules. New modules reached the row
 * only through ensure_modules_settings, called by the admin shell
 * (ensureModulesRow(defaultModulesSettings)) on page load; nobody opens that
 * instance, so it never got the key: no Feedback ping, absent from www's fleet
 * list. And planModuleChange refused the module as "not a module on this
 * instance", so neither manage_modules nor manage_site_settings could switch it
 * on.
 *
 * Now: the generator reads `defaultModulesSettings` (the one source of truth)
 * into the edge bundle's catalogue as `defaultEnabled`, and sync_skills_from_code
 * tops the row up with ensure_modules_settings (absent keys only) before it
 * reads it. These tests DISCOVER drift between the object, the generator's
 * reading of it, and the bundle — they enumerate no module.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultModulesSettings } from '@/hooks/useModules';
import { readModuleDefaultsFromSource } from '../../../scripts/lib/module-defaults-from-source';
import {
  modulesAbsentFromRow,
  moduleRowDefaults,
  type ModuleCatalogEntry,
} from '../../../supabase/functions/_shared/modules/module-plan';

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const code = Object.fromEntries(
  Object.entries(defaultModulesSettings as unknown as Record<string, { enabled?: boolean; core?: boolean }>)
    .map(([id, cfg]) => [id, { enabled: cfg.enabled === true, core: cfg.core === true }]),
);

describe('the generator reads defaultModulesSettings as the code has it', () => {
  it('every module, its default and its core flag — read from source equals the live object', () => {
    const parsed = readModuleDefaultsFromSource(read('src/hooks/useModules.tsx'));
    expect(
      parsed,
      'scripts/lib/module-defaults-from-source.ts read defaultModulesSettings differently from what ' +
        'the code exports. Write `enabled:` as a true/false literal on its own line (four spaces), or teach ' +
        'the reader the new shape — otherwise the server is shipped a wrong default.',
    ).toEqual(code);
  });

  it('the generator puts the reading into the catalogue', () => {
    const gen = read('scripts/skills-to-json.ts');
    expect(gen).toMatch(/readModuleDefaultsFromSource\(readFileSync\(join\(ROOT, 'src', 'hooks', 'useModules\.tsx'\)/);
    expect(gen).toMatch(/defaultEnabled: sourceDefaults\[m\.id\]\?\.enabled === true/);
  });
});

describe('the edge bundle carries the defaults', () => {
  // CI rebuilds the artifacts before the tests (scripts/generated-artifacts.ts),
  // so this reads what the deploy will carry.
  const bundle = JSON.parse(read('supabase/functions/agent-execute/_module-skills.json')) as { catalog: ModuleCatalogEntry[] };

  it('one module list: the catalogue and defaultModulesSettings name the same modules', () => {
    const catalogIds = bundle.catalog.map((c) => c.moduleId).sort();
    expect(catalogIds, 'A module in src/lib/modules with no entry in defaultModulesSettings (or the reverse) has no default the server can give it.')
      .toEqual(Object.keys(code).sort());
  });

  it('every catalogue entry\'s defaultEnabled is the code default', () => {
    const drift = bundle.catalog.filter((c) => c.defaultEnabled !== code[c.moduleId]?.enabled).map((c) => c.moduleId);
    expect(drift).toEqual([]);
  });

  it('moduleRowDefaults is the minimal row ensure_modules_settings stores', () => {
    const row = moduleRowDefaults(bundle.catalog);
    expect(row).toEqual(Object.fromEntries(Object.entries(code).map(([id, c]) => [id, { enabled: c.enabled }])));
    expect(modulesAbsentFromRow(bundle.catalog, row)).toEqual([]);
  });
});

describe('the server-side skill sync tops the row up', () => {
  const exec = read('supabase/functions/_shared/execute/core.ts');
  const sync = exec.slice(exec.indexOf('async function executeSyncSkillsFromCode'), exec.indexOf('async function executeResetSandbox'));
  const topUp = exec.slice(exec.indexOf('async function topUpModulesRow'), exec.indexOf('/** All rader ur agent_skills'));

  it('with the same RPC and rule as the admin shell — absent keys only', () => {
    expect(topUp).toMatch(/supabase\.rpc\('ensure_modules_settings', \{ p_defaults: moduleRowDefaults\(MODULE_CATALOG\) \}\)/);
    // A bundle without the defaults would add every new module as `false`,
    // which from then on reads as an operator's choice: it writes nothing.
    expect(topUp).toMatch(/MODULE_CATALOG\.some\(\(c\) => typeof c\.defaultEnabled !== 'boolean'\)/);
    // And the RPC still adds only what is missing.
    expect(read('supabase/migrations/20260822190000_the-module-row-is-born-with-the-instance.sql')).toMatch(/IF NOT \(v_existing \? k\)/);
  });

  it('before the row is read, so the new module\'s skills and automations follow in the same run', () => {
    const at = sync.indexOf('await topUpModulesRow(supabase)');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(sync.indexOf(".in('key', ['skills_artifact_sha', 'modules', 'module_teardowns'])"));
    expect(sync.match(/modules_row: modulesRow/g)?.length, 'both answers (unchanged and synced) say what the top-up did').toBe(2);
  });
});
