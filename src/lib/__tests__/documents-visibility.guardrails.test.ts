/**
 * Documents can be marked sensitive — and the marking must actually restrict.
 *
 * The gap this closes: `documents` had a SELECT policy whose qual was literally
 * `true`, and no visibility field at all. HR filing an employment contract as a
 * PDF would have shown it to sales, while `employment_contracts` — the
 * STRUCTURED version of the same document — was properly scoped all along.
 *
 * The RLS behaviour was proven against the live database in both directions:
 * a real `sales` user saw only the shared document; the same person with `hr`
 * added (inside a rolled-back transaction) also saw the HR-scoped one. What
 * these tests hold is the part a future edit could quietly undo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const migration = read('supabase/migrations/20260808160000_documents-visibility.sql');
// The storage policies originally landed in 20260808170000, but ALL storage
// DDL now lives in the always-last fresh-install finalizer (mid-stream
// storage.* migrations deadlock against the storage service's own migrator on
// brand-new projects — see fresh-install-replay.guardrails.test.ts). The
// policy BODIES are unchanged; only their home moved.
const storage = read('supabase/migrations/99999999999999_fresh-install-finalizer.sql');
const dialog = read('src/components/admin/documents/AddDocumentDialog.tsx');
const hook = read('src/hooks/useDocuments.ts');

/**
 * The body of one CREATE POLICY statement, comments stripped.
 *
 * Slicing to the first `;` is not enough: a `--` comment inside the policy can
 * contain one, which truncated the body mid-clause and failed a guard that
 * should have passed. Reading the SQL rather than the prose about it is the
 * entire point of these tests.
 */
const policyBody = (sql: string, name: string): string => {
  const from = sql.slice(sql.indexOf(`CREATE POLICY "${name}"`));
  const stripped = from.replace(/--[^\n]*/g, '');
  return stripped.slice(0, stripped.indexOf(';'));
};

describe('the permissive policy is removed, not merely joined', () => {
  it('drops the `true` SELECT policy', () => {
    // Postgres ORs permissive policies together. Leaving the old
    // "Authenticated users can view documents" (qual: true) in place would make
    // every restriction below decorative — the same shape as revoking from
    // `anon` while PUBLIC still holds the grant.
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Authenticated users can view documents"/);
  });

  it('replaces it with one that reads the visibility field', () => {
    const body = policyBody(migration, 'Documents are visible per their visibility setting');
    expect(body).toMatch(/visibility = 'shared'/);
    expect(body).toMatch(/visibility = 'role'/);
    expect(body).toMatch(/visibility = 'private'/);
    expect(body).toMatch(/has_role\(auth\.uid\(\), 'admin'/);
  });

  it('never leaves a bare `true` in the documents SELECT policy', () => {
    const body = policyBody(migration, 'Documents are visible per their visibility setting');
    expect(/USING\s*\(\s*true\s*\)/i.test(body)).toBe(false);
  });
});

describe('the file follows the row — restricting one and not the other is the whole bug', () => {
  // Two migrations landed the same day from different threads of work.
  // `20260808100000_documents-bucket-in-repo.sql` granted every authenticated
  // user SELECT on the entire `documents` bucket; the row-level fix above
  // restricted the table. Together they produced a control that reads as
  // protection and is bypassable one layer down — the storage API lists
  // objects directly, so nobody even has to guess a path.
  //
  // Proven live on optic in three directions: a real `sales` user saw only the
  // shared file; the same person with `hr` added saw both; and restoring the
  // old bucket-wide policy inside a rolled-back transaction made the HR file
  // reappear — so the leak was real, not inferred.
  it('drops the bucket-wide SELECT that made the row policy decorative', () => {
    expect(storage).toMatch(
      /DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage\.objects/,
    );
  });

  it('defers to the table policy instead of restating the rules', () => {
    // RLS on a table referenced inside another policy's expression is evaluated
    // as the querying user, so this EXISTS succeeds only when that user could
    // see the row. Restating `visibility = 'role' AND has_role(...)` here would
    // work today and drift the first time the table policy changes.
    // Tolerant of pg_get_policydef normalisation (the finalizer's bodies are
    // read back from live pg_policies): optional schema prefixes, wrapping
    // parens and newlines around the EXISTS subquery.
    const body = policyBody(storage, `Document files follow their document's visibility`);
    expect(body).toMatch(
      /EXISTS\s*\(\s*SELECT 1\s+FROM\s+(?:public\.)?documents d\s+WHERE\s+\(?d\.file_url = (?:storage\.)?objects\.name\)?\s*\)/,
    );
    expect(body).not.toMatch(/visibility = 'role'/);
  });

  it('never leaves bucket membership as the only condition', () => {
    // `USING (bucket_id = 'documents')` is exactly what the leak looked like.
    for (const name of [
      `Document files follow their document's visibility`,
      'Uploaders and admins can overwrite document files',
    ]) {
      const body = policyBody(storage, name);
      expect(/USING\s*\(\s*bucket_id = 'documents'\s*\)/.test(body)).toBe(false);
      expect(body).toMatch(/has_role\(auth\.uid\(\), 'admin'/);
    }
  });

  it('keeps the uploader able to read back a file whose row does not exist yet', () => {
    // The client uploads the file BEFORE inserting the row. Without the
    // own-folder clause, the uploader cannot read their own file during that
    // window and an abandoned upload becomes unreachable by anyone.
    expect(storage).toMatch(/\(storage\.foldername\(name\)\)\[1\] = \(?auth\.uid\(\)\)?::text/);
  });

  it('closes overwriting too, not only reading', () => {
    // Same hole in the other direction: replacing an employment contract with a
    // different PDF while the row, its title and its audit trail stay untouched.
    expect(storage).toMatch(
      /DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage\.objects/,
    );
    expect(storage).toMatch(/CREATE POLICY "Uploaders and admins can overwrite document files"/);
  });

  it('is dated after the migration that opened the bucket', () => {
    // A back-dated fix is silently skipped by the ledger on every instance
    // already past that timestamp — the exact drift this repo has been bitten
    // by. The guard script enforces this globally; this pins the pair.
    expect(20260808170000).toBeGreaterThan(20260808100000);
  });
});

describe('the defaults keep existing installs working', () => {
  it('defaults to shared, so nothing already uploaded disappears', () => {
    // A default of `private` would hide every existing document from everyone
    // but its uploader the moment the migration ran — a data-loss-shaped
    // surprise even though no row changes.
    expect(migration).toMatch(/visibility text NOT NULL DEFAULT 'shared'/);
  });

  it('constrains the value set rather than trusting callers', () => {
    expect(migration).toMatch(/CHECK \(visibility IN \('shared', 'role', 'private'\)\)/);
  });

  it('rejects a role-scoped document with no role', () => {
    // Otherwise it is invisible to everyone but admin: a silent black hole
    // rather than an error. Verified live — the INSERT is refused.
    expect(migration).toMatch(/documents_role_requires_role/);
    expect(migration).toMatch(/visibility <> 'role' OR visible_to_role IS NOT NULL/);
  });

  it('keeps the uploader able to see their own role-scoped file', () => {
    // Someone in sales filing something for HR must not lose their own upload.
    const body = policyBody(migration, 'Documents are visible per their visibility setting');
    expect(body).toMatch(/uploaded_by = auth\.uid\(\)/);
  });
});

describe('the dialog offers the setting, and offers it honestly', () => {
  it('lets the uploader choose at upload time', () => {
    expect(dialog).toMatch(/Who can see this/);
    expect(dialog).toMatch(/setVisibility/);
  });

  it('sends the choice to the database', () => {
    // A picker that never reaches the insert is the worst possible outcome:
    // it reads as protection and provides none.
    // Scoped to the mutation payload, not the file: a bare /visibility,/ also
    // matches `const [visibility, setVisibility]` and passed while the field
    // was missing from the insert — caught by negative-testing the guard.
    const payload = dialog.slice(dialog.indexOf('createDoc.mutateAsync({'));
    const body = payload.slice(0, payload.indexOf('});'));
    expect(body).toMatch(/^\s*visibility,\s*$/m);
    expect(body).toMatch(/visible_to_role: visibility === "role" \? visibleToRole : null/);
  });

  it('does not offer roles that would make the setting a no-op', () => {
    // `admin` sees everything regardless, and `customer` is not a colleague.
    // Offering either produces a control that reads meaningfully and does
    // nothing — which is how people learn not to trust the controls.
    const list = dialog.slice(dialog.indexOf('RESTRICTABLE_ROLES'), dialog.indexOf('];', dialog.indexOf('RESTRICTABLE_ROLES')));
    expect(list).toContain('"hr"');
    expect(list).not.toContain('"admin"');
    expect(list).not.toContain('"customer"');
  });

  it('defaults the dialog to shared, matching the column default', () => {
    // If the UI defaulted to private while the column defaulted to shared, the
    // two halves would disagree about what "no choice" means.
    expect(dialog).toMatch(/useState<DocumentVisibility>\("shared"\)/);
  });
});

describe('the type carries the field, so a caller cannot forget it silently', () => {
  it('exposes visibility on the Document type', () => {
    expect(hook).toMatch(/visibility: DocumentVisibility;/);
    expect(hook).toMatch(/visible_to_role: AppRole \| null;/);
  });

  it('names the three states in one place', () => {
    expect(hook).toMatch(/export type DocumentVisibility = 'shared' \| 'role' \| 'private';/);
  });
});
