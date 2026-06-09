/**
 * Guardrail: module-enabled state must be read from the `key='modules'` ROW,
 * never as a `.select('modules')` column.
 *
 * `site_settings` is a key/value table. The row where `key='modules'` holds a
 * jsonb value like `{ flowpilot: { enabled: true }, hr: {...}, ... }`. Reading it
 * as a *column* (`.select('modules')`) selects something that does not exist —
 * PostgREST returns null — so any `…?.enabled === true` gate built on it is
 * permanently false on every instance.
 *
 * That exact mistake lived in `automation-dispatcher` + `event-dispatcher`: every
 * `executor='flowpilot'` automation was silently skipped as "module off" and
 * never ran (run_count stuck at 0), on every instance, since the code was
 * written. Fixed 2026-06-09 by routing both through `_shared/modules.ts`
 * `isModuleEnabled()`. This guardrail stops the column-vs-row trap from being
 * reintroduced one call site at a time. Sibling of
 * `autonomy-cron-verify-jwt.guardrails.test.ts` (same incident family).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FUNCTIONS_DIR = 'supabase/functions';

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(p));
    else if (entry.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Drop block + line comments so documentation that *names* the anti-pattern
 *  (e.g. modules.ts's own JSDoc) doesn't trip the scanner. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const MODULES_COLUMN = /\.select\(\s*['"]modules['"]\s*\)/;

describe('module-enabled state is read from the key/value row, not a column', () => {
  const files = listTsFiles(FUNCTIONS_DIR);

  it('finds edge function source to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no edge function selects a non-existent `modules` column', () => {
    const offenders = files.filter((f) =>
      MODULES_COLUMN.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(
      offenders,
      `site_settings has no \`modules\` column — module state is the row where ` +
        `key='modules'. Read it via _shared/modules.ts isModuleEnabled() (or ` +
        `\`.select('value').eq('key','modules')\`). \`.select('modules')\` returns ` +
        `null and silently disables every gate built on it (this is why ` +
        `executor='flowpilot' automations never ran):\n` +
        offenders.map((m) => `  • ${m}`).join('\n'),
    ).toEqual([]);
  });

  it('isModuleEnabled reads the key=modules row via the value column', () => {
    const src = readFileSync(join(FUNCTIONS_DIR, '_shared/modules.ts'), 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+isModuleEnabled/);
    expect(src).toMatch(/\.eq\(\s*['"]key['"]\s*,\s*['"]modules['"]\s*\)/);
    expect(src).toMatch(/\.select\(\s*['"]value['"]\s*\)/);
  });

  it('the cron + event dispatchers gate flowpilot work via the shared helper', () => {
    for (const fn of ['automation-dispatcher', 'event-dispatcher']) {
      const src = readFileSync(join(FUNCTIONS_DIR, fn, 'index.ts'), 'utf8');
      expect(src, `${fn} must gate executor='flowpilot' via isModuleEnabled`).toMatch(
        /isModuleEnabled/,
      );
    }
  });
});
