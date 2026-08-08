/**
 * A website template an agent can author — the mirror of the contract anatomy.
 *
 * What made contract generation work for an external operator was five things
 * acting together: the template lives in a TABLE (not in the bundle), an
 * authoring RPC with the service_role escape, a long guide delivered lazily via
 * read_skill, a machine-readable validation response, and discovery before
 * authoring. Site templates had none of them — they were TypeScript files.
 *
 * Proven live on optic (rolled back): create/idempotency/list/get-by-prefix all
 * behave; a non-admin authenticated caller is refused (P0001) while service_role
 * — the MCP gateway's identity — goes through; and every structural defect
 * class is reported rather than stored.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const strip = (s: string) => s.replace(/--[^\n]*/g, '');
const sql = strip(read('supabase/migrations/20260808500000_site-templates-authorable.sql'));

describe('the template is instance data, like a contract template', () => {
  it('stores the body in a table, not in the bundle', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.site_templates/);
    expect(sql).toMatch(/template_json jsonb NOT NULL/);
  });

  it('is unique by name so create can be idempotent', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS site_templates_name_lower_key/);
    expect(sql).toMatch(/'already_existed', true/);
  });

  it('outlives its author — SET NULL, not CASCADE', () => {
    // The 20260808290000 doctrine: CASCADE for personal artifacts, SET NULL for
    // business records. A template a colleague wrote is the instance's, not theirs.
    expect(sql).toMatch(/created_by uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
  });
});

describe('an external operator can actually call it', () => {
  it('keeps the service_role escape', () => {
    // Without this the MCP gateway (service key, auth.uid() NULL) only ever sees
    // "Only admins…" — the failure that stranded 44 admin functions.
    expect(sql).toMatch(/auth\.role\(\) = 'service_role' OR public\.has_role\(auth\.uid\(\), 'admin'\)/);
  });

  it('resolves a template by id, exact name, or unique prefix — never guessing', () => {
    expect(sql).toMatch(/Several templates start with/);
  });
});

describe('the validation response is the unrendered_tokens of templates', () => {
  it('reports rather than silently accepting', () => {
    expect(sql).toMatch(/_site_template_structure_report/);
    expect(sql).toMatch(/'valid', cardinality\(v_errors\) = 0/);
    expect(sql).toMatch(/'warnings', to_jsonb\(v_warnings\)/);
  });

  it('refuses to store a structurally broken template', () => {
    // Mirrors guard_contracts_require_body: a contract with no body and a
    // template with no landing page are the same kind of nothing.
    const creates = sql.match(/Template structure is invalid/g) ?? [];
    expect(creates.length).toBeGreaterThanOrEqual(2); // create AND update
  });

  it('catches the mistake agents actually make — Tiptap sent as a string', () => {
    // It renders as nothing and looks correct in the payload, so the agent has
    // no way to notice unless told. Verified live against a broken template.
    expect(sql).toMatch(/"type"\\s\*:\\s\*"doc"/);
    expect(sql).toMatch(/is a Tiptap document sent as a string/);
  });

  it('every array append is explicitly text', () => {
    // `text[] || 'literal'` reads the unknown-typed literal as an ARRAY literal
    // and dies on the first word. Live testing caught this; the property is that
    // no bare-literal append survives.
    const appends = sql.match(/v_(errors|warnings) := v_\1 \|\| '[^']*'(?!::text)/g) ?? [];
    expect(appends).toEqual([]);
  });
});

describe('the block vocabulary keeps exactly one home', () => {
  it('the migration does not copy the list of block types', () => {
    // Today's lesson: a third copy of the contract token list appeared one day
    // after the second was reconciled. block-reference.ts → block-schema.ts is
    // the one source; the DB validates shape, never vocabulary.
    for (const blockType of ["'hero'", "'two-column'", "'bento-grid'", "'features'"]) {
      expect(sql).not.toContain(blockType);
    }
  });
});
