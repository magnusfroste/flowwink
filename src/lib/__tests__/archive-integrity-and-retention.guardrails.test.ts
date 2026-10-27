import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyAgentError } from '../../../supabase/functions/_shared/agent-errors';
import { documentsModule } from '@/lib/modules/documents-module';
import { accountingModule } from '@/lib/modules/accounting-module';

/**
 * The archive holds seven years (20261027120000): a document's bytes are
 * sealed with SHA-256 at upload and re-verified later; a posted voucher's
 * documentation is kept until the statutory date and cannot be deleted or
 * detached before then — row, attachment and storage object alike. Only a
 * full reset may clear it, and it says so for its transaction.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261027120001_arkivet-haller-sju-ar.sql');
const executor = read('supabase/functions/agent-execute/index.ts');
type Seed = { name: string; handler: string; description: string; instructions?: string; tool_definition: { risk?: string; function: { parameters: { properties: Record<string, unknown> } } } };
const seedsOf = (m: { agent?: { skillSeeds?: unknown[] }; skillSeeds?: unknown[] }) => (m.agent?.skillSeeds ?? m.skillSeeds ?? []) as unknown as Seed[];

describe('integrity: the bytes are sealed where they enter', () => {
  it('documents and voucher attachments carry a SHA-256 and when it was taken', () => {
    expect(migration).toMatch(/ALTER TABLE public\.documents\s+ADD COLUMN IF NOT EXISTS content_sha256 text,\s+ADD COLUMN IF NOT EXISTS hashed_at timestamptz/);
    expect(migration).toMatch(/ALTER TABLE public\.journal_entry_documents\s+ADD COLUMN IF NOT EXISTS content_sha256 text/);
  });

  it('every upload path seals: the admin dialog, drag-and-drop, and the agent (text and binary)', () => {
    const hook = read('src/hooks/useDocuments.ts');
    expect(hook).toContain('export async function sha256OfFile(file: Blob): Promise<string | null>');
    expect(hook).toMatch(/content_sha256: sha,\s*hashed_at: sha \? new Date\(\)\.toISOString\(\) : null,/);
    const dialog = read('src/components/admin/documents/AddDocumentDialog.tsx');
    expect(dialog).toContain('const sha = await sha256OfFile(file);');
    expect(dialog).toMatch(/content_sha256: sha,\s*hashed_at: sha \? new Date\(\)\.toISOString\(\) : null,/);
    // The dialog hashes BEFORE the upload: the seal says what left the browser.
    expect(dialog.indexOf('const sha = await sha256OfFile(file);')).toBeLessThan(dialog.indexOf('supabase.storage.from("documents").upload(path, file'));
    expect(executor).toContain('const sealedSha = await sha256Hex(bytes);');
    expect(executor).toContain('const sealedText = await sha256Hex(new TextEncoder().encode(contentText));');
  });

  it('verify_document_integrity re-downloads, seals the unsealed and never re-seals a mismatch', () => {
    const fn = executor.slice(executor.indexOf('async function executeVerifyDocumentIntegrity('), executor.indexOf('async function executeUploadDocument('));
    expect(fn).toContain("supabase.storage.from('documents').download(path)");
    expect(fn).toMatch(/if \(!d\.content_sha256\) \{\s*if \(!dryRun\) await sealDocument\(supabase, d\.id, sha\);/);
    expect(fn).toContain("report.mismatched.push({ id: d.id, kind: 'document'");
    // The mismatch branch writes nothing: no sealDocument call after the push.
    const mismatchBranch = fn.slice(fn.indexOf("report.mismatched.push({ id: d.id, kind: 'document'"), fn.indexOf('// 2. Voucher attachments'));
    expect(mismatchBranch).not.toContain('sealDocument(');
    expect(fn).toContain("startsWith('demo://')");
    const seed = seedsOf(documentsModule).find((s) => s.name === 'verify_document_integrity')!;
    expect(seed.handler).toBe('internal:verify_document_integrity');
    expect(Object.keys(seed.tool_definition.function.parameters.properties)).toEqual(['limit', 'only_unsealed', 'dry_run']);
    expect(executor).toContain("} else if (handler === 'internal:verify_document_integrity') {");
  });
});

describe('retention: a posted voucher\'s documentation stays seven years', () => {
  it('the date is 31 December N years after the fiscal year ended, N a declared preference defaulting to 7', () => {
    expect(migration).toMatch(/COALESCE\(NULLIF\(value ->> 'documentRetentionYears', ''\)::int, 7\)/);
    expect(migration).toMatch(/make_date\(EXTRACT\(YEAR FROM r\.date_to\)::int \+ public\.document_retention_years\(\), 12, 31\)/);
  });

  it('attaching to a voucher, and posting a voucher, stamp the document; deleting or detaching before the date is refused', () => {
    expect(migration).toContain('CREATE TRIGGER trg_stamp_voucher_document_retention');
    expect(migration).toContain('AFTER INSERT OR UPDATE OF status ON public.journal_entries');
    expect(migration).toMatch(/BEFORE DELETE ON public\.documents\s+FOR EACH ROW EXECUTE FUNCTION public\.guard_document_retention\(\)/);
    expect(migration).toMatch(/BEFORE DELETE ON public\.journal_entry_documents\s+FOR EACH ROW EXECUTE FUNCTION public\.guard_voucher_document_detach\(\)/);
    // A cascade from the voucher's own deletion passes; a direct detach does not.
    expect(migration).toContain('pg_trigger_depth() > 1');
    expect(migration).toContain("USING ERRCODE = 'check_violation'");
  });

  it('the storage object follows the row (in the finalizer, where all storage DDL lives), and only a full reset may override', () => {
    const finalizer = read('supabase/migrations/20260812130000_fresh-install-finalizer.sql');
    expect(finalizer).toMatch(/d\.file_url = storage\.objects\.name\s+AND d\.retention_until IS NOT NULL AND d\.retention_until >= CURRENT_DATE/);
    expect(migration).not.toMatch(/ON storage\.objects/);
    expect(migration).toContain("ARRAY['reset_site_data', 'reset_module_data']");
    expect(migration).toContain("PERFORM set_config(''app.archive_override'', ''on'', true);");
    // Nothing else in the migration turns the override on outside the proof.
    const body = migration.slice(0, migration.indexOf('-- ── Bevisas där den körs'));
    expect((body.match(/set_config\('app\.archive_override'/g) ?? []).length).toBe(0);
  });

  it('the refusal has a stable code an agent does not retry', () => {
    const c = classifyAgentError('Document "Kvitto" is kept until 2033-12-31 (retention: Documentation of a voucher (BFL 7 kap 2 §)). It documents a posted voucher and cannot be deleted before then.');
    expect(c).toMatchObject({ code: 'RETENTION_LOCKED', retryable: false });
    expect(classifyAgentError('Voucher A-12 is posted: its documentation stays with it (BFL 7 kap).').code).toBe('RETENTION_LOCKED');
  });

  it('the proof covers stamp, refusal, detach, draft, manifest, status and override', () => {
    for (const s of ["RAISE EXCEPTION 'proof: a retained document was deleted'", "RAISE EXCEPTION 'proof: documentation was detached from a posted voucher'",
      "DELETE FROM public.journal_entry_documents WHERE journal_entry_id = v_draft;", "RAISE EXCEPTION '__archive_proof_ok__'"]) {
      expect(migration).toContain(s);
    }
  });
});

describe('the archive manifest and the integrity card', () => {
  it('voucher_archive_manifest lists every posted voucher with its documents, hashes and retention', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.voucher_archive_manifest(p_year integer DEFAULT public.fiscal_year_of(public.platform_today()))');
    expect(migration).toContain("'sha256', COALESCE(jd.content_sha256, d.content_sha256)");
    expect(migration).toContain("'retention_until', public.voucher_retention_until(je.entry_date)");
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.voucher_archive_manifest\(integer\) TO authenticated, service_role/);
    const seed = seedsOf(accountingModule).find((s) => s.name === 'export_voucher_archive_manifest')!;
    expect(seed.handler).toBe('rpc:voucher_archive_manifest');
    expect(seed.description).toContain('a ZIP of the files (not built here');
  });

  it('archive_integrity_status feeds the card on Voucher Integrity, which can run the verifier', () => {
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.archive_integrity_status\(\) TO authenticated, service_role/);
    const card = read('src/components/admin/accounting/ArchiveIntegrityCard.tsx');
    expect(card).toContain("supabase.rpc('archive_integrity_status'");
    expect(card).toContain("callSkill<VerifyReport>('verify_document_integrity'");
    expect(read('src/components/admin/accounting/VoucherIntegrityTab.tsx')).toContain('<ArchiveIntegrityCard />');
  });
});
