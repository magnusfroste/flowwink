import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A public token lookup returns a VIEW of the row, never the row.
 *
 * Two defects lived in the contract/signing family until 20260823110000, and
 * this file exists to stop either from growing back:
 *
 *  1. `get_contract_by_token` was SECURITY DEFINER, anon-executable, and
 *     declared `RETURNS SETOF public.contracts` — every column, `accept_token`
 *     included. A whole-rowtype return from a SECURITY DEFINER function is a
 *     hole straight through whatever RLS sits on the table, because the policy
 *     never runs. It had no caller at all.
 *
 *  2. `get_public_contract` carried `length(coalesce(trim(p_token),'')) >= 16`
 *     in 20260808154535 and lost it in 20260808400000 — a migration whose
 *     subject was appendices and which re-typed the WHERE clause from memory.
 *     The regression was silent because the happy path is identical; only the
 *     empty/short-token case differs, and nobody tests the empty case.
 *
 * Defect 2 is why these assertions read the LAST definition across every
 * migration rather than one named file. A test pinned to a single file cannot
 * see the next migration quietly redefine the function without the guard —
 * which is precisely how the guard was lost the first time.
 */

const MIGRATIONS_DIR = resolve(__dirname, '../../../supabase/migrations');

/** Every migration, in the order an instance's runner applies them. */
const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS_DIR, name), 'utf-8') }));

/** `public.foo(` and `"public"."foo"(` both count as a definition of foo. */
const createRe = (fn: string) =>
  new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+"?public"?\\.\\s*"?${fn}"?\\s*\\(`, 'gi');
const dropRe = (fn: string) =>
  new RegExp(`DROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?"?public"?\\.\\s*"?${fn}"?\\s*\\(`, 'gi');

/**
 * The body of the last CREATE of `fn` across all migrations, or null when the
 * last thing any migration says about it is a DROP.
 */
function lastDefinitionOf(fn: string): { file: string; body: string } | null {
  let found: { file: string; body: string; dropped: boolean } | null = null;

  for (const { name, sql } of migrations) {
    for (const m of sql.matchAll(createRe(fn))) {
      // Slice to the start of the next CREATE FUNCTION so the body we assert
      // on is this function's and not the next one's.
      const rest = sql.slice(m.index!);
      const next = rest.slice(1).search(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
      found = { file: name, body: next === -1 ? rest : rest.slice(0, next + 1), dropped: false };
    }
    for (const m of sql.matchAll(dropRe(fn))) {
      // A DROP only wins if nothing in this same file re-creates it after.
      const after = sql.slice(m.index!);
      if (!createRe(fn).test(after)) found = { file: name, body: '', dropped: true };
    }
  }

  if (!found || found.dropped) return null;
  return { file: found.file, body: found.body };
}

/**
 * The public token lookups. Every one is reachable by an anonymous visitor
 * holding nothing but a URL, so every one needs the input guard.
 */
const GUARDED_LOOKUPS = [
  'get_public_contract',
  'get_invoice_by_token',
  'mark_invoice_viewed_by_token',
  'get_contract_certificate',
  'get_quote_certificate',
  'get_quote_payment_status',
  'set_quote_item_selection',
];

/** Dead but loaded: anon-executable, whole-rowtype, and nothing ever called them. */
const REMOVED_FOR_GOOD = [
  'get_contract_by_token',
  'get_quote_by_token',
  'sign_contract_by_token',
];

describe('the token guard is one named thing, so it cannot rot away', () => {
  it('the guard exists and states the floor it enforces', () => {
    const def = lastDefinitionOf('token_is_plausible');
    expect(def, 'public.token_is_plausible must exist').not.toBeNull();
    // The floor must never be able to reject a token the platform mints. The
    // shortest real one is 32 chars (24 random bytes → base64url); 16 is the
    // historical contract and half of that.
    expect(def!.body).toMatch(/length\(btrim\(p_token\)\)\s*>=\s*16/);
    expect(def!.body).toMatch(/STRICT/i);
  });

  it('is not reachable by anon — REVOKE FROM PUBLIC alone would not do it', () => {
    // ALTER DEFAULT PRIVILEGES in schema public hands anon an EXPLICIT execute
    // grant on every new function, so revoking PUBLIC leaves anon standing.
    // Anything that should not be anon-reachable has to name anon directly.
    const def = lastDefinitionOf('token_is_plausible')!;
    const file = migrations.find((m) => m.name === def.file)!.sql;
    expect(file).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.token_is_plausible\(text\)\s+FROM\s+anon,\s*authenticated/i,
    );
  });

  for (const fn of GUARDED_LOOKUPS) {
    it(`${fn} — its LAST definition still calls the guard`, () => {
      const def = lastDefinitionOf(fn);
      expect(def, `${fn} should still exist`).not.toBeNull();
      expect(
        def!.body,
        `${def!.file} redefines ${fn} without token_is_plausible — that is exactly how ` +
          `get_public_contract lost its guard between 20260808154535 and 20260808400000. ` +
          `Add public.token_is_plausible(<token param>) to the WHERE clause.`,
      ).toMatch(/token_is_plausible/);
    });
  }
});

describe('a token lookup returns a view of the row, never the row', () => {
  for (const fn of REMOVED_FOR_GOOD) {
    it(`${fn} stays dropped`, () => {
      expect(
        lastDefinitionOf(fn),
        `${fn} was removed because it was anon-executable, returned a whole rowtype ` +
          `(accept_token and all), and had no caller anywhere in the tree. ` +
          `Do not bring it back — narrow to a fixed column list like get_public_contract.`,
      ).toBeNull();
    });
  }

  for (const fn of [...GUARDED_LOOKUPS, 'get_public_quote']) {
    it(`${fn} does not return a whole rowtype`, () => {
      const def = lastDefinitionOf(fn);
      if (!def) return;
      const header = def.body.slice(0, def.body.search(/\bAS\s*\$/i));
      // `RETURNS SETOF public.contracts` / `RETURNS public.invoices` hands the
      // caller every column the table will ever have — including the ones added
      // after this function was written, which is the part that makes it a trap.
      expect(
        header,
        `${def.file}: ${fn} returns a whole table rowtype. Name the columns instead.`,
      ).not.toMatch(/RETURNS\s+(SETOF\s+)?"?public"?\.\s*"?(contracts|quotes|invoices|contract_signatures|quote_signatures)"?\s*$/im);
    });
  }
});
