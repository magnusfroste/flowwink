import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One fact, one reader: "what is the business's currency" has ONE answer in
 * SQL, business_currency(), and a fresh install always has one.
 *
 * What happened (nightly fresh-install runs 40289704143 and 40472619205,
 * 2026-10-26/27): platform_default_currency() had a fallback chain of its
 * own, ending in the invoices.currency COLUMN DEFAULT read from the catalog
 * by regexp for a quoted three-letter literal. 20261025040000 (#766) rewrote
 * every 'SEK' column default to business_currency(); the regexp matched
 * nothing; on an instance with no platform_locale — every install from zero —
 * the function returned NULL. create_manual_subscription refused, the
 * purchase-order trigger looked for a rate to <NULL>, approval_rules.currency
 * hit NOT NULL: four processes red, live instances untouched (they carry the
 * setting). Two readers that answer the same question is how #430 inverted
 * an instance; from 20261028090000 the old name delegates to the one reader.
 */
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const read = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8');
const code = (sql: string) => sql.replace(/--[^\n]*/g, '');
/** The newest migration that (re)defines a function is the body an instance runs. */
const DEFINES = (fn: string) => `CREATE OR REPLACE FUNCTION public.${fn}(`;
const newestDefining = (fn: string) => [...files].reverse().find((f) => code(read(f)).includes(DEFINES(fn)))!;
const bodyOf = (sql: string, fn: string) => {
  const start = sql.lastIndexOf(DEFINES(fn));
  const ends = ['$fn$;', '$$;', '$function$;'].map((m) => sql.indexOf(m, start)).filter((i) => i > 0);
  return sql.slice(start, Math.min(...ends));
};

describe('the business currency has one reader', () => {
  it('platform_default_currency() IS business_currency() — no fallback chain of its own', () => {
    const file = newestDefining('platform_default_currency');
    const body = bodyOf(code(read(file)), 'platform_default_currency');
    expect(body, `${file}: the old name delegates, nothing else`).toMatch(/AS \$\$\s*SELECT public\.business_currency\(\);\s*$/);
    expect(body).not.toMatch(/pg_get_expr|site_settings|regexp_match/);
  });

  it('business_currency() is never NULL: platform_locale → accounting_preferences → the country → a last word', () => {
    const file = newestDefining('business_currency');
    const body = bodyOf(code(read(file)), 'business_currency');
    const order = ["key = 'platform_locale'", "key = 'accounting_preferences'", 'business_country_defaults(public.business_country())', 'RETURN COALESCE(v,'];
    const at = order.map((s) => body.indexOf(s));
    expect(at.every((i) => i >= 0), `${file}: ${order.join(' → ')}`).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('the SQL reader and resolveHome read the same settings in the same order', () => {
    const ts = readFileSync(join(process.cwd(), 'supabase/functions/_shared/locale/home.ts'), 'utf8');
    const tsOrder = ['pl.default_currency', 'acct.currency', 'byCountry?.currency'].map((s) => ts.indexOf(s));
    expect(tsOrder.every((i) => i >= 0)).toBe(true);
    expect([...tsOrder].sort((a, b) => a - b)).toEqual(tsOrder);
    expect(ts).toMatch(/currency: cur\?\.\[0\] \?\? FALLBACK_HOME\.currency/);
  });

  it('a later migration never re-creates platform_default_currency() with a chain of its own', () => {
    const floor = '20261028090000';
    const later = files.filter((f) => f.slice(0, 14) > floor && code(read(f)).includes('FUNCTION public.platform_default_currency('));
    for (const f of later) {
      expect(bodyOf(code(read(f)), 'platform_default_currency'), f).toMatch(/SELECT public\.business_currency\(\);/);
    }
  });

  it('the delegation migration proves both names answer the same non-NULL currency on every install', () => {
    const sql = read('20261028090000_valutan-har-en-lasare.sql');
    expect(sql).toMatch(/v_business IS NULL OR v_business !~ '\^\[A-Z\]\{3\}\$'/);
    expect(sql).toMatch(/v_platform IS DISTINCT FROM v_business/);
  });
});

describe('an install with a country is born at home', () => {
  const src = readFileSync(join(process.cwd(), 'supabase/functions/agent-execute/index.ts'), 'utf8');
  it('install_template(country) writes the business home the way set_business_home does — once, never over an existing one', () => {
    expect(src).toMatch(/if \(typeof a\.country === 'string' && a\.country\.trim\(\) && !existingCountry\) \{\s*const home = await handleSetBusinessHome\(supabase, \{ country: a\.country\.trim\(\) \}\);/);
    expect(src).toMatch(/business_home_set: homeSet,/);
  });
  it('the battery prep proves the two readers agree and are set after the install', () => {
    const prep = readFileSync(join(process.cwd(), 'scripts/process-battery/prep-local-stack.ts'), 'utf8');
    expect(prep).toMatch(/select public\.platform_default_currency\(\) as platform, public\.business_currency\(\) as business, public\.business_country\(\) as country/);
    expect(prep).toMatch(/process\.exit\(1\)/);
  });
});
