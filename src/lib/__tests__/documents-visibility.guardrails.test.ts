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
const migration = read('supabase/migrations/20260808140000_documents-visibility.sql');
const dialog = read('src/components/admin/documents/AddDocumentDialog.tsx');
const hook = read('src/hooks/useDocuments.ts');

describe('the permissive policy is removed, not merely joined', () => {
  it('drops the `true` SELECT policy', () => {
    // Postgres ORs permissive policies together. Leaving the old
    // "Authenticated users can view documents" (qual: true) in place would make
    // every restriction below decorative — the same shape as revoking from
    // `anon` while PUBLIC still holds the grant.
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Authenticated users can view documents"/);
  });

  it('replaces it with one that reads the visibility field', () => {
    const policy = migration.slice(migration.indexOf('CREATE POLICY "Documents are visible per their visibility setting"'));
    const body = policy.slice(0, policy.indexOf(';'));
    expect(body).toMatch(/visibility = 'shared'/);
    expect(body).toMatch(/visibility = 'role'/);
    expect(body).toMatch(/visibility = 'private'/);
    expect(body).toMatch(/has_role\(auth\.uid\(\), 'admin'/);
  });

  it('never leaves a bare `true` in the documents SELECT policy', () => {
    const policy = migration.slice(migration.indexOf('CREATE POLICY "Documents are visible per their visibility setting"'));
    const body = policy.slice(0, policy.indexOf(';'));
    expect(/USING\s*\(\s*true\s*\)/i.test(body)).toBe(false);
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
    const policy = migration.slice(migration.indexOf('CREATE POLICY "Documents are visible per their visibility setting"'));
    const body = policy.slice(0, policy.indexOf(';'));
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
