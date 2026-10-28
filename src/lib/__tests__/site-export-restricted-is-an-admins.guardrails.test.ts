import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  fetchStorageObjectWithinBudget,
  sha256Hex,
  siteExportBudget,
  type SiteExportFetch,
} from '../../../supabase/functions/_shared/media/site-export';

/**
 * Review round 3 of #797 — what the second round's fixes left open.
 *
 *  1. The export reads documents and wiki pages with the SERVICE ROLE, so RLS
 *     does not stand between a non-admin caller and a private document's
 *     text and bytes. The stored row was guarded (carries_restricted_content);
 *     the answer was not. Restricted knowledge is an admin's to export.
 *  2. Wiki pages never widen on install either, and an update writes only
 *     what the export carries — no '', [] or null over a page the target has.
 *  3. Documents are keyed on the seal: two documents that share a name but
 *     not their bytes are two documents.
 *  4. The stored body is counted in the database, never echoed back: not by
 *     manage_site_template get/create/update, not by the save path.
 *  5. An existing media object is compared by the listing's MD5 before any
 *     download; a full payload short-circuits before any request; one
 *     sha256Hex seals on both ends.
 *
 * The gate test SCANS the export handler for every service-role read of the
 * two restricted tables and requires the caller check to come first — a read
 * added later is caught, not enumerated.
 */

const root = resolve(__dirname, '../../..');
const agentExecute = readFileSync(resolve(root, 'supabase/functions/agent-execute/index.ts'), 'utf-8');
const sharedSource = readFileSync(resolve(root, 'supabase/functions/_shared/media/site-export.ts'), 'utf-8');
const templatesModule = readFileSync(resolve(root, 'src/lib/modules/templates-module.ts'), 'utf-8');
const templateTypes = readFileSync(resolve(root, 'src/data/templates/types.ts'), 'utf-8');
const migrationsDir = resolve(root, 'supabase/migrations');
const leanMigrationFile = readdirSync(migrationsDir).filter((f) => f.endsWith('_site-templates-answer-lean.sql')).sort().pop();
const migration = leanMigrationFile ? readFileSync(resolve(migrationsDir, leanMigrationFile), 'utf-8') : '';

const exportHandler = agentExecute.slice(
  agentExecute.indexOf('async function tplExportSite'),
  agentExecute.indexOf('async function executeTemplatesAction'));
const installHandler = agentExecute.slice(
  agentExecute.indexOf('async function tplInstall'),
  agentExecute.indexOf('async function executeResetSandbox'));
const exportDescription = templatesModule.slice(
  templatesModule.indexOf('const EXPORT_SITE_TEMPLATE_DESCRIPTION'),
  templatesModule.indexOf('const TEMPLATE_SKILLS'));

describe('1. restricted knowledge is an admin\'s to export — the ANSWER is gated, not only the stored row', () => {
  const gateAt = exportHandler.indexOf("rpc('has_role', { _user_id: callerUserId, _role: 'admin' })");

  it('the export resolves the caller\'s role once, before any knowledge is read', () => {
    expect(gateAt).toBeGreaterThan(0);
    expect(exportHandler).toMatch(/let callerIsAdmin = !callerUserId;/);
    // A failed role lookup is a refusal, never "not admin, carry on" or "admin, carry on".
    expect(exportHandler).toMatch(/if \(roleErr\) return \{ error: `Could not resolve the caller's role/);
  });

  it('EVERY read of a restricted table in the export comes after the gate (scan, not a list)', () => {
    // documents and wiki_pages are the two tables whose rows carry a
    // visibility; any service-role read of them that lands before the gate
    // would answer restricted rows to a caller the gate has not yet judged.
    const reads = [...exportHandler.matchAll(/readAllRows<\w+>\(supabase, '(wiki_pages|documents)'|\.from\('(wiki_pages|documents)'\)\.select\(/g)];
    expect(reads.length).toBeGreaterThanOrEqual(2);
    for (const m of reads) expect(m.index, `read of ${m[1] ?? m[2]} at ${m.index}`).toBeGreaterThan(gateAt);
  });

  it('a non-admin caller gets shared documents and internal wiki pages only', () => {
    expect(exportHandler).toMatch(/const readable = callerIsAdmin \? rows : rows\.filter\(\(w\) => \{\s*if \(\(w\.visibility \|\| 'internal'\) === 'internal'\) return true;/);
    expect(exportHandler).toMatch(/if \(!callerIsAdmin && \(DOCUMENT_VISIBILITY\.has\(String\(d\.visibility\)\) \? String\(d\.visibility\) : 'private'\) !== 'shared'\) \{/);
  });

  it('what was left out is named in export_report.skipped, with who can export it', () => {
    expect(exportHandler).toMatch(/section: 'wiki pages \(admin-only\)', count: restrictedOmitted\.wiki_pages\.length/);
    expect(exportHandler).toMatch(/section: 'documents \(role-scoped or private\)', count: restrictedOmitted\.documents\.length/);
    expect(exportHandler).toMatch(/items: restrictedOmitted\.documents/);
  });

  it('the seed says it out loud, so an agent does not plan on an export it cannot get', () => {
    expect(exportDescription).toMatch(/Restricted knowledge is an admin\\'s to export/);
  });
});

describe('2. wiki pages never widen on install, and an update writes only what is carried', () => {
  const wikiPass = installHandler.slice(installHandler.indexOf('// 7b. Wiki pages'), installHandler.indexOf('// 7c. Documents'));

  it('the existing pages are read WITH their visibility and editable_by', () => {
    expect(wikiPass).toMatch(/\.from\('wiki_pages'\)\.select\('slug, visibility, editable_by'\)\.in\('slug'/);
  });

  it('visibility and editable_by move toward the narrower value only', () => {
    expect(wikiPass).toMatch(/if \(carriedVisibility && wikiRank\(carriedVisibility\) > wikiRank\(had\.visibility\)\) patch\.visibility = carriedVisibility;/);
    expect(wikiPass).toMatch(/if \(carriedEditableBy && editableRank\(carriedEditableBy\) > editableRank\(had\.editable_by\)\) patch\.editable_by = carriedEditableBy;/);
    // No default 'internal' / 'authenticated' is ever written on the update path.
    const updateBranch = wikiPass.slice(wikiPass.indexOf('if (existingSlugs.has(slug)) {'), wikiPass.indexOf('} else {', wikiPass.indexOf('if (existingSlugs.has(slug)) {')));
    expect(updateBranch).not.toMatch(/'internal'/);
    expect(updateBranch).not.toMatch(/'authenticated'/);
  });

  it('content_md and tags are written only when the export has them', () => {
    expect(wikiPass).toMatch(/if \(typeof p\.content_md === 'string' && p\.content_md\.trim\(\)\) patch\.content_md = p\.content_md;/);
    expect(wikiPass).toMatch(/if \(Array\.isArray\(p\.tags\) && p\.tags\.length\) patch\.tags = /);
    expect(wikiPass).toMatch(/\.from\('wiki_pages'\)\.update\(patch\)\.eq\('slug', slug\)/);
  });

  it('a parent that is not carried is not written — an existing page keeps its place', () => {
    const secondPass = wikiPass.slice(wikiPass.indexOf('Second pass: the hierarchy'));
    expect(secondPass).toMatch(/if \(!parent\) continue;/);
    expect(secondPass.indexOf('if (!parent) continue;')).toBeLessThan(secondPass.indexOf(".update({ parent_slug: parent })"));
    expect(secondPass).not.toMatch(/parent_slug: null/);
  });
});

describe('3. documents are keyed on the seal — a namesake with other bytes is another document', () => {
  const docPass = installHandler.slice(installHandler.indexOf('// 7c. Documents'), installHandler.indexOf('// 8. Optionally merge template settings'));

  it('the seal travels on the entry, file or no file', () => {
    expect(templateTypes).toMatch(/content_sha256\?: string \| null;/);
    expect(exportHandler).toMatch(/content_sha256: d\.content_sha256 \|\| undefined,/);
    expect(docPass).toMatch(/const carriedSha = sha \?\? \(typeof d\.content_sha256 === 'string'/);
  });

  it('the seal is looked up first; the name only finds an UNSEALED row or one when nothing is sealed on either side', () => {
    const sealAt = docPass.indexOf(".eq('content_sha256', carriedSha)");
    const nameAt = docPass.indexOf(".eq('title', title).eq('file_name', fileName)");
    expect(sealAt).toBeGreaterThan(0);
    expect(nameAt).toBeGreaterThan(sealAt);
    expect(docPass).toMatch(/if \(namesakes\.length === 1 && !\(namesakes\[0\]\.content_sha256 && carriedSha\)\) \{/);
    // Never "the first of several": the name lookup reads two rows to know there are several.
    expect(docPass).toMatch(/\.eq\('file_name', fileName\)\.order\('id'\)\.limit\(2\)/);
    expect(docPass).not.toMatch(/\.eq\('file_name', fileName\)\.limit\(1\)\.maybeSingle\(\)/);
  });

  it('a document created beside a namesake is reported by name', () => {
    expect(docPass).toMatch(/createdBesideNamesake\.push\(`\$\{title\} \(\$\{fileName\}\)`\)/);
    expect(installHandler).toMatch(/documents_created_beside_namesakes: createdBesideNamesake\.length \? createdBesideNamesake : undefined/);
  });
});

describe('4. the stored body is counted in the database, never echoed back', () => {
  it('the migration exists, forward-dated past the restricted-content migration', () => {
    expect(leanMigrationFile).toBeDefined();
    expect(leanMigrationFile! > '20261028090024_').toBe(true);
  });

  it('manage_site_template get/create/update answer the lean row — template_json without media[] and documents[].file', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\._site_template_lean\(p_row public\.site_templates\)/);
    expect(migration).toMatch(/v_json := v_json - 'media';/);
    expect(migration).toMatch(/d - 'file'/);
    expect(migration).toMatch(/'omitted_from_response', \(v_media > 0 OR v_files > 0\)/);
    const fn = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.manage_site_template('));
    expect(fn).not.toMatch(/'template', to_jsonb\(v_row\)/);
    expect((fn.match(/public\._site_template_lean\(v_row\)/g) || []).length).toBe(4);
  });

  it('the counts are one SQL function, read by list and by the export\'s save path', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\._site_template_section_counts\(p_template jsonb\)/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.site_template_section_counts\(p_template_id uuid\)/);
    expect(migration).toMatch(/'sections', public\._site_template_section_counts\(t\.template_json\)/);
    // The row-level reader is guarded the way manage_site_template is, and not open to PUBLIC.
    expect(migration).toMatch(/WHEN NOT \(auth\.role\(\) = 'service_role' OR public\.has_role\(auth\.uid\(\), 'admin'\)\)\s*THEN NULL/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.site_template_section_counts\(uuid\) FROM PUBLIC;/);
    expect(exportHandler).toMatch(/\.from\('site_templates'\)\.select\('id'\)\.ilike\('name', saveAs\)/);
    expect(exportHandler).toMatch(/rpc\('site_template_section_counts', \{ p_template_id: existing\.id \}\)/);
    expect(exportHandler).not.toMatch(/select\('id, template_json'\)/);
  });
});

describe('5. the cheap check first, the full payload refused before the request, one seal', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('an existing media object is compared by the listing\'s MD5 before any download', () => {
    expect(agentExecute).toMatch(/md5: \/\^\[0-9a-f\]\{32\}\$\/\.test\(etag\) \? etag : null/);
    const mediaPass = installHandler.slice(installHandler.indexOf('if (there.exists) {'), installHandler.indexOf('if (needsUpload) {'));
    expect(mediaPass).toMatch(/const md5 = there\.md5 \? await md5Hex\(bytes\) : null;/);
    expect(mediaPass.indexOf('same = md5 === there.md5')).toBeLessThan(mediaPass.indexOf('.download(path)'));
    // A runtime without MD5 falls back to the download, never to "not the same".
    expect(agentExecute).toMatch(/async function md5Hex\(bytes: Uint8Array\): Promise<string \| null>/);
  });

  it('a full payload answers payload_full before a single request', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const budget = siteExportBudget({ max_payload_mb: 1 });
    budget.usedBytes = budget.maxPayloadBytes;
    const got: SiteExportFetch = await fetchStorageObjectWithinBudget({ url: 'http://kong:8000', key: 'k' }, 'documents', 'late.pdf', null, budget);
    expect(got.ok).toBe(false);
    expect('reason' in got ? got.reason : null).toBe('payload_full');
    expect(f).not.toHaveBeenCalled();
    // …and even with the deadline spent, the reason is the payload, not the clock.
    const spent = { ...budget, deadline: Date.now() - 1 };
    const late = await fetchStorageObjectWithinBudget({ url: 'http://kong:8000', key: 'k' }, 'documents', 'later.pdf', null, spent);
    expect('reason' in late ? late.reason : null).toBe('payload_full');
  });

  it('ONE sha256Hex — exported from the shared module, imported by agent-execute, no private copy', async () => {
    expect(sharedSource).toMatch(/export async function sha256Hex\(bytes: Uint8Array\)/);
    expect(sharedSource).not.toMatch(/sha256OfBytes/);
    expect(agentExecute).toMatch(/rewriteUrlsInTemplate, sha256Hex, siteExportBudget,\s*\} from '\.\.\/_shared\/media\/site-export\.ts'/);
    expect(agentExecute).not.toMatch(/^async function sha256Hex\(/m);
    // and it hashes a view over a larger buffer as the view, not the buffer
    const whole = new TextEncoder().encode('xxabcxx');
    expect(await sha256Hex(whole.subarray(2, 5))).toBe(await sha256Hex(new TextEncoder().encode('abc')));
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
