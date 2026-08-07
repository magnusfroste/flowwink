/**
 * Deleting a user must detach every reference — not the ones someone listed.
 *
 * The first delete-user detached exactly the 3 NO ACTION columns referencing
 * `profiles`: a complete list for that family, while 27 more NO ACTION columns
 * referencing `auth.users` directly went unhandled. Live case on optic: the
 * admin held contract_versions.created_by=2 and projects.created_by=1, so
 * deleting any colleague who had actually worked failed on an FK error —
 * and deleting a user who never created anything succeeded, which is exactly
 * how the gap survives testing.
 *
 * Proven live in a rolled-back transaction: detach nulled both families in one
 * pass, the auth.users DELETE went through, and both flowtable bases survived
 * ownerless with all 25 rows — where the old CASCADE would have destroyed them
 * silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const sql = read('supabase/migrations/20260808290000_detach-user-references.sql');
const fn = read('supabase/functions/delete-user/index.ts');

describe('the detach walks the catalog, not a list', () => {
  it('derives the columns from pg_constraint at execution time', () => {
    // A hardcoded list was right on the day it was written and wrong by review
    // time. Every new created_by column re-opens the gap silently.
    expect(sql).toMatch(/FROM pg_constraint c/);
    expect(sql).toMatch(/c\.confdeltype = 'a'/);
  });

  it('covers both families — auth.users AND profiles', () => {
    // The original bug in one line: one family handled completely, the other
    // not at all. Completeness within the wrong scope reads as correctness.
    expect(sql).toMatch(/c\.confrelid IN \('auth\.users'::regclass, 'public\.profiles'::regclass\)/);
  });

  it('reports NOT NULL columns by name instead of failing generically', () => {
    expect(sql).toMatch(/User has NOT NULL references that cannot be detached: %/);
  });

  it('nulls authorship, never reassigns it', () => {
    // History keeps the row and loses the name. Reassigning would claim the
    // deleting admin authored a departed colleague's contracts.
    expect(sql).toMatch(/UPDATE %s SET %I = NULL WHERE %I = \$1/);
    expect(sql).not.toMatch(/SET %I = auth\.uid\(\)/);
  });
});

describe('the function cannot be turned against the platform', () => {
  it('requires service role or admin', () => {
    // SECURITY DEFINER + callable by authenticated = any logged-in user could
    // strip ownership columns platform-wide without this.
    expect(sql).toMatch(/auth\.role\(\) = 'service_role'\s*\n?\s*OR public\.has_role\(auth\.uid\(\), 'admin'/);
  });

  it('has no postgres escape hatch', () => {
    // A superuser bypasses RLS anyway; an extra OR-clause is one more branch a
    // probe cannot exercise. Verified live: sales-role claims are rejected.
    expect(sql).not.toMatch(/session_user\s*=\s*'postgres'/);
  });

  it('revokes from anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.detach_user_references\(uuid\) FROM PUBLIC, anon/);
  });
});

describe('the cascade is defused', () => {
  it('rewrites flowtable_bases.owner_id to SET NULL', () => {
    // The old CASCADE ran on through tables to fields and records: deleting
    // optic's admin would have silently destroyed the Produkter base the whole
    // sales conversation reads from. A base is a shared workspace artifact
    // that happens to record who created it.
    expect(sql).toMatch(/FOREIGN KEY \(owner_id\) REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
  });

  it('only rewrites when the constraint is still CASCADE', () => {
    // Re-running the migration must not drop and recreate a constraint that is
    // already correct — idempotence is the fleet contract.
    expect(sql).toMatch(/confdeltype = 'c'\s+-- only rewrite if still CASCADE/);
  });

  it('makes the column nullable, since SET NULL needs somewhere to go', () => {
    expect(sql).toMatch(/ALTER COLUMN owner_id DROP NOT NULL/);
  });

  it('gives an orphaned base an admin management path', () => {
    // The old policies were owner-only. Fine while every base had an owner —
    // a dead end the moment one does not.
    const upd = sql.slice(sql.indexOf('"flowtable_bases owner update"\n  ON'));
    const del = sql.slice(sql.indexOf('"flowtable_bases owner delete"\n  ON'));
    expect(upd.slice(0, upd.indexOf(';'))).toMatch(/owner_id = auth\.uid\(\) OR public\.has_role\(auth\.uid\(\), 'admin'/);
    expect(del.slice(0, del.indexOf(';'))).toMatch(/owner_id = auth\.uid\(\) OR public\.has_role\(auth\.uid\(\), 'admin'/);
  });
});

describe('delete-user actually uses it', () => {
  it('calls the RPC', () => {
    expect(fn).toMatch(/admin\.rpc\(\s*"detach_user_references",\s*\{ p_user_id: user_id \}/);
  });

  it('carries no hardcoded detach list any more', () => {
    // Two detach mechanisms would mean the list version quietly wins for its
    // three columns and the dynamic one for the rest — one mechanism, one truth.
    expect(fn).not.toMatch(/await detach\(/);
  });

  it('fails the deletion honestly when detach fails', () => {
    expect(fn).toMatch(/Detach failed: \$\{detachErr\.message\}/);
  });
});
