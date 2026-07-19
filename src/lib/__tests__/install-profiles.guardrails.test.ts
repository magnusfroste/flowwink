import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: a fresh install must not walk into the Supabase function cap.
 *
 * Live finding (2026-07-19, before the demo rebuild): flowwink.sh's selective
 * deploy reads site_settings.modules to decide what to skip — but /update-funcs
 * runs BEFORE /create-admin, so on a fresh project the row does not exist and
 * the filter failed OPEN: all 110 functions, against a Free cap of 100. The
 * deploy 402s partway through and the site is silently missing functions.
 *
 * The fix is an install profile (cms/crm/erp) that seeds the modules row. These
 * tests pin the two properties that make it safe:
 *   1. the profiles the operator can pick actually FIT the plan they claim to
 *   2. the profile definition stays consistent with the function map and with
 *      the module ids the frontend knows (a typo would silently enable nothing)
 */

const root = process.cwd();
const profiles = JSON.parse(readFileSync(join(root, 'supabase/seed/install-profiles.json'), 'utf8'));
const map = JSON.parse(readFileSync(join(root, 'supabase/seed/edge-function-map.json'), 'utf8'));
const modulesSrc = readFileSync(join(root, 'src/hooks/useModules.tsx'), 'utf8');

/** Module ids a profile enables, following `extends` — mirrors profile_modules() in flowwink.sh. */
function modulesOf(name: string): string[] {
  const p = profiles.profiles[name];
  if (p.modules === '*') return Object.keys(map.modules);
  const inherited = p.extends ? modulesOf(p.extends) : [];
  return [...new Set([...inherited, ...p.modules])];
}

/** Functions a profile deploys — mirrors profile_function_count() in flowwink.sh. */
function functionCount(name: string): number {
  const mods = new Set(modulesOf(name));
  const fns = new Set<string>(map.core);
  for (const [mod, list] of Object.entries(map.modules as Record<string, string[]>)) {
    if (mods.has(mod)) list.forEach((f) => fns.add(f));
  }
  return fns.size;
}

const FREE_CAP: number = map.plan_limits.free;
const names = Object.keys(profiles.profiles);

describe('install profiles', () => {
  it('the entry profile fits the Free plan with headroom for a module or two', () => {
    // cms is what a first-time operator lands on; it must never be the reason
    // an install fails.
    expect(functionCount('cms')).toBeLessThanOrEqual(FREE_CAP - 8);
  });

  it('at least one profile beyond the smallest also fits Free', () => {
    const fitting = names.filter((n) => functionCount(n) <= FREE_CAP);
    expect(fitting.length).toBeGreaterThanOrEqual(2);
  });

  it('profiles that exceed the Free cap are described as such (the cap is a cliff)', () => {
    for (const n of names) {
      if (functionCount(n) > FREE_CAP) {
        // The picker warns at runtime; the description must not promise Free.
        expect(profiles.profiles[n].description.toLowerCase()).toMatch(/free|paid|plan/);
      }
    }
  });

  it('every module id exists in the function map', () => {
    const known = new Set(Object.keys(map.modules));
    for (const n of names) {
      for (const m of modulesOf(n)) expect(known, `profile ${n}`).toContain(m);
    }
  });

  it('every module id exists in defaultModulesSettings — else the row enables nothing', () => {
    // The frontend drops keys not in defaults (useModules.tsx filters on
    // `key in defaultModulesSettings`), so a typo would be silently ignored.
    const block = modulesSrc.split('export const defaultModulesSettings')[1] ?? '';
    const declared = new Set([...block.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*):\s*\{/gm)].map((m) => m[1]));
    for (const n of names) {
      for (const m of modulesOf(n)) expect(declared, `profile ${n}`).toContain(m);
    }
  });

  it('extends chains are monotone — a bigger profile is a superset of the one it extends', () => {
    for (const n of names) {
      const ext = profiles.profiles[n].extends;
      if (!ext) continue;
      const parent = new Set(modulesOf(ext));
      const child = new Set(modulesOf(n));
      for (const m of parent) expect(child, `${n} ⊇ ${ext}`).toContain(m);
      expect(functionCount(n)).toBeGreaterThanOrEqual(functionCount(ext));
    }
  });

  it('no profile is empty, and core alone is never the whole story', () => {
    for (const n of names) {
      expect(modulesOf(n).length, n).toBeGreaterThan(0);
      expect(functionCount(n), n).toBeGreaterThan(map.core.length);
    }
  });
});

/**
 * Guardrail: the CLI must find the Supabase token wherever the CLI put it.
 *
 * Live finding (2026-07-19): flowwink.sh read ~/.supabase/access-token
 * directly, but on macOS the CLI stores the token in the login keychain and
 * that file does not exist. The token came back empty, which silently disabled
 * EVERY feature gated on it — the selective-deploy filter, the pre-bootstrap
 * SQL, and the new install-profile prompt — so a fresh install would have
 * tried to deploy all ~110 functions into a 100-function cap.
 */
describe('flowwink.sh token acquisition', () => {
  const script = readFileSync(join(root, 'scripts/flowwink.sh'), 'utf8');

  it('reads the token through the helper, never the bare file path', () => {
    const bareReads = script.match(/token=\$\(cat "\$HOME\/\.supabase\/access-token"/g) ?? [];
    expect(bareReads).toHaveLength(0);
    expect(script).toMatch(/supabase_access_token\(\)/);
  });

  it('the helper covers env var, file and macOS keychain', () => {
    const helper = script.split('supabase_access_token() {')[1]?.split('\n}')[0] ?? '';
    expect(helper).toMatch(/SUPABASE_ACCESS_TOKEN/);          // explicit env
    expect(helper).toMatch(/\$HOME\/\.supabase\/access-token/); // Linux / CI
    expect(helper).toMatch(/security find-generic-password/);   // macOS keychain
  });

  it('every token consumer goes through the helper', () => {
    const consumers = script.match(/^\s*token=.*$/gm) ?? [];
    expect(consumers.length).toBeGreaterThan(0);
    for (const line of consumers) expect(line).toMatch(/supabase_access_token/);
  });
});
