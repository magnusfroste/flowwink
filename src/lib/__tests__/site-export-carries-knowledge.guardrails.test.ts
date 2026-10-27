import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * "Move the whole site to a new instance" — including its knowledge.
 *
 * export_site_template carried the shop window: pages, posts, KB, products.
 * The wiki, the uploaded documents (file + indexed text) and the images the
 * pages referenced stayed behind, so a site moved through the export arrived
 * without exactly the parts an operator cannot rewrite from memory. These
 * tests hold the three additions in place:
 *
 *  1. include "wiki" and "documents" exist in the seed AND the handler — the
 *     flag an agent reads must be the flag the code honours;
 *  2. a document keeps its visibility through the round trip and never widens
 *     (nothing uploaded becomes public);
 *  3. copy_media embeds the files and install_template rewrites the URLs;
 *  4. whatever the edge budget leaves behind is NAMED in export_report.skipped
 *     — an export never fails as a whole, and never reads as complete when it
 *     is not.
 */

const agentExecute = readFileSync(
  resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'), 'utf-8');
const templatesModule = readFileSync(
  resolve(__dirname, '../../../src/lib/modules/templates-module.ts'), 'utf-8');
const templateTypes = readFileSync(
  resolve(__dirname, '../../../src/data/templates/types.ts'), 'utf-8');

const exportHandler = agentExecute.slice(
  agentExecute.indexOf('async function tplExportSite'),
  agentExecute.indexOf('async function executeTemplatesAction'));
const installHandler = agentExecute.slice(
  agentExecute.indexOf('async function tplInstall'),
  agentExecute.indexOf('async function executeResetSandbox'));
const helpers = agentExecute.slice(
  agentExecute.indexOf('const SITE_EXPORT_TIME_BUDGET_MS'),
  agentExecute.indexOf('async function tplInstall'));
const exportSeed = templatesModule.slice(
  templatesModule.indexOf("name: 'export_site_template'"));
const installSeed = templatesModule.slice(
  templatesModule.indexOf("name: 'install_template'"),
  templatesModule.indexOf("name: 'export_site_template'"));
const exportDescription = templatesModule.slice(
  templatesModule.indexOf('const EXPORT_SITE_TEMPLATE_DESCRIPTION'),
  templatesModule.indexOf('const TEMPLATE_SKILLS'));

describe('the include flags exist in the seed AND the handler', () => {
  it('the seed enumerates wiki and documents beside pages/blog/kb/products', () => {
    expect(exportSeed).toMatch(/enum: \['pages', 'blog', 'kb', 'products', 'wiki', 'documents'\]/);
  });

  it('the export handler honours both flags', () => {
    expect(exportHandler).toMatch(/include\.includes\('wiki'\)/);
    expect(exportHandler).toMatch(/include\.includes\('documents'\)/);
  });

  it('wiki pages travel as the wiki stores them — slug, markdown, tags, hierarchy, visibility', () => {
    expect(exportHandler).toMatch(/\.from\('wiki_pages'\)\s*\.select\('slug, title, content_md, tags, parent_slug, visibility, editable_by'\)/);
  });

  it('an omitted section is counted, not silently empty', () => {
    expect(exportHandler).toMatch(/section: 'wiki pages', count, how: 'Add "wiki" to include\.'/);
    expect(exportHandler).toMatch(/section: 'documents', count, how: 'Add "documents" to include\.'/);
  });

  it('the install side restores both, and the seed exposes the switches', () => {
    expect(installHandler).toMatch(/wiki: a\.include_wiki !== false/);
    expect(installHandler).toMatch(/documents: a\.include_documents !== false/);
    expect(installSeed).toMatch(/include_wiki:/);
    expect(installSeed).toMatch(/include_documents:/);
    expect(installSeed).toMatch(/include_media:/);
  });

  it('the StarterTemplate type names the new sections', () => {
    expect(templateTypes).toMatch(/wikiPages\?: TemplateWikiPage\[\]/);
    expect(templateTypes).toMatch(/documents\?: TemplateDocument\[\]/);
    expect(templateTypes).toMatch(/media\?: TemplateMediaFile\[\]/);
  });
});

describe('restore is idempotent — same slug / same name is an update, never a duplicate', () => {
  it('wiki pages are keyed on the slug', () => {
    expect(installHandler).toMatch(/\.from\('wiki_pages'\)\.select\('slug'\)\.in\('slug'/);
    expect(installHandler).toMatch(/if \(existingSlugs\.has\(slug\)\) \{[\s\S]*?\.from\('wiki_pages'\)\.update\(row\)\.eq\('slug', slug\)/);
    expect(installHandler).toMatch(/updated\.wiki_pages\.push\(slug\)/);
  });

  it('the hierarchy is applied once every page exists — the FK would refuse a child before its parent', () => {
    expect(installHandler).toMatch(/Second pass: the hierarchy/);
    expect(installHandler).toMatch(/\.update\(\{ parent_slug: parent \}\)\.eq\('slug', slug\)/);
  });

  it('documents are keyed on title + file_name', () => {
    expect(installHandler).toMatch(/\.from\('documents'\)\s*\.select\('id, file_url, content_sha256, visibility, visible_to_role'\)\.eq\('title', title\)\.eq\('file_name', fileName\)/);
    expect(installHandler).toMatch(/updated\.documents\.push\(title\)/);
  });

  it('the response separates created from updated', () => {
    expect(installHandler).toMatch(/updated: \{ wiki_pages: updated\.wiki_pages\.length, documents: updated\.documents\.length \}/);
  });

  it('knowledge is never uninstalled by the next template install', () => {
    // The manifest records provenance; the uninstall loop at the top must not
    // gain a del('wiki_pages'…) / del('documents'…) line.
    expect(installHandler).toMatch(/wikiSlugs, documentIds, mediaPaths/);
    expect(installHandler).not.toMatch(/await del\('wiki_pages'/);
    expect(installHandler).not.toMatch(/await del\('documents'/);
  });
});

describe('documents keep their visibility — nothing uploaded becomes public', () => {
  it('the export reads visibility and the role it is scoped to', () => {
    expect(exportHandler).toMatch(/visibility, visible_to_role, content_md, extraction_status, source'/);
    expect(exportHandler).toMatch(/visibility: DOCUMENT_VISIBILITY\.has\(String\(d\.visibility\)\) \? String\(d\.visibility\) : 'private'/);
  });

  it('the installer carries it verbatim and narrows when it cannot honour it', () => {
    expect(installHandler).toMatch(/let visibility = DOCUMENT_VISIBILITY\.has\(String\(d\.visibility\)\) \? String\(d\.visibility\) : 'private'/);
    expect(installHandler).toMatch(/if \(visibility === 'role' && !visibleToRole\) \{ visibility = 'private'; visibleToRole = null; \}/);
  });

  it('an existing document on the target is never reopened by an install — visibility only narrows', () => {
    expect(installHandler).toMatch(/if \(rank\(existing\.visibility\) > rank\(visibility\)\) \{/);
    expect(installHandler).toMatch(/meta\.visibility = existing\.visibility/);
  });

  it('the vocabulary has no public value and the bytes land in the private documents bucket', () => {
    expect(helpers).toMatch(/const DOCUMENT_VISIBILITY = new Set\(\['shared', 'role', 'private'\]\)/);
    expect(installHandler).toMatch(/supabase\.storage\.from\('documents'\)\s*\.upload\(objectKey, bytes/);
    // A media copy may only write to a PUBLIC media bucket — and the documents
    // bucket is not one, so a document can never be smuggled in as "media".
    expect(helpers).toMatch(/const SITE_EXPORT_PUBLIC_BUCKETS = new Set\(\['cms-images', 'river-media'\]\)/);
    expect(installHandler).toMatch(/if \(!SITE_EXPORT_PUBLIC_BUCKETS\.has\(bucket\)\)/);
  });

  it('the carried bytes are checked against the seal they left with', () => {
    expect(exportHandler).toMatch(/documentFiles\.set\(documents\.length, \{ base64: got\.base64, sha256: got\.sha256/);
    expect(installHandler).toMatch(/d\.file\.sha256 !== sha/);
    expect(installHandler).toMatch(/content_sha256: sha/);
  });

  it('the seed says it out loud', () => {
    expect(exportDescription).toMatch(/never widened/);
    expect(installSeed).toMatch(/nothing becomes public/);
  });

  it('a STORED template carrying role/private documents is readable by admins only — the row must not leak what the documents table protects', () => {
    // "Authenticated view site templates" let every signed-in user read every
    // active template; a saved export with an HR contract inside would have
    // been readable by all of sales one row over from the RLS that hid it.
    const migration = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/20261027160001_site-templates-keep-document-visibility.sql'), 'utf-8');
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.site_template_carries_restricted_documents\(p_template jsonb\)/);
    expect(migration).toMatch(/COALESCE\(d ->> 'visibility', 'private'\) <> 'shared'/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Authenticated view site templates"/);
    expect(migration).toMatch(/is_active = true AND NOT public\.site_template_carries_restricted_documents\(template_json\)/);
    expect(exportHandler).toMatch(/readable_by: restrictedDocuments/);
  });
});

describe('copy_media embeds the files and the installer rewrites the URLs', () => {
  it('is opt-in, and the default stays referenced', () => {
    expect(exportHandler).toMatch(/const copyMedia = a\.copy_media === true/);
    expect(exportHandler).toMatch(/mode: copyMedia \? 'copied' : 'referenced'/);
    expect(exportSeed).toMatch(/copy_media:/);
  });

  it('copies only from THIS instance\'s public storage — a file on another host stays a reference', () => {
    expect(helpers).toMatch(/function parseOwnPublicStorageUrl/);
    expect(helpers).toMatch(/u\.host !== new URL\(supabaseUrl\)\.host\) return null/);
    expect(exportHandler).toMatch(/mediaReferenced\.push\(\{ url, why: 'not on this instance\\'s public storage' \}\)/);
  });

  it('the installer uploads to the same bucket/path and rewrites every URL before a page is written', () => {
    expect(installHandler).toMatch(/\.upload\(path, bytes, \{ contentType, upsert: true \}\)/);
    expect(installHandler).toMatch(/mediaRewrites\.set\(fromUrl, toUrl\)/);
    expect(installHandler).toMatch(/const rewritten: Record<string, unknown> = rewriteUrlsInTemplate\(withoutMedia, mediaRewrites\)/);
    expect(installHandler).toMatch(/template = rewritten as never/);
    // The rewrite happens in step 0 — before "3. Create pages".
    expect(installHandler.indexOf('rewriteUrlsInTemplate(withoutMedia')).toBeLessThan(installHandler.indexOf('// 3. Create pages'));
  });

  it('the rewrite is longest-URL-first so a prefix never clobbers a longer URL', () => {
    expect(helpers).toMatch(/sort\(\(x, y\) => y\.length - x\.length\)/);
  });

  it('the report says which it did', () => {
    expect(exportHandler).toMatch(/copied: media\.map/);
    expect(exportHandler).toMatch(/referenced: copyMedia \? mediaReferenced : undefined/);
    expect(installHandler).toMatch(/media_rewritten_urls: mediaRewrites\.size/);
  });
});

describe('the edge budget: cap and name, never fail the whole export', () => {
  it('stops before the Free tier\'s 150 s wall-clock', () => {
    expect(helpers).toMatch(/const SITE_EXPORT_TIME_BUDGET_MS = 100_000/);
    expect(helpers).toMatch(/if \(Date\.now\(\) > budget\.deadline\)/);
  });

  it('caps a single file and the total payload, and the caller can raise neither past the ceiling', () => {
    expect(helpers).toMatch(/SITE_EXPORT_MAX_FILE_MB = 20/);
    expect(helpers).toMatch(/SITE_EXPORT_MAX_PAYLOAD_MB = 40/);
    expect(helpers).toMatch(/Math\.min\(n, max\)/);
  });

  it('every skipped file is listed by name in export_report.skipped with its reason', () => {
    for (const section of [
      'document files (over max_file_mb)',
      'document files (payload full)',
      'document files (time budget)',
      'document files (unreachable in storage)',
      'document files (embed_files=false)',
      'media files (over max_file_mb)',
      'media files (payload full)',
      'media files (time budget)',
      'media files (unreachable in storage)',
    ]) {
      expect(exportHandler, section).toContain(`section: '${section}'`);
    }
    expect(exportHandler).toMatch(/items: fileSkips\.too_large/);
    expect(exportHandler).toMatch(/items: mediaSkips\.too_large/);
  });

  it('a document whose file did not fit still travels — text and metadata, with the reason on the entry', () => {
    expect(exportHandler).toMatch(/entry\.file_omitted = got\.detail/);
    expect(exportHandler).toMatch(/documents\.push\(entry\)/);
  });

  it('the limits in force are reported, and the description states them', () => {
    expect(exportHandler).toMatch(/limits: \{\s*time_budget_s/);
    expect(exportDescription).toMatch(/150 s/);
    expect(exportDescription).toMatch(/max_file_mb \(default 8, max 20\)/);
    expect(exportDescription).toMatch(/max_payload_mb \(default 16, max 40\)/);
    expect(exportDescription).toMatch(/never fails as a whole/);
  });

  it('the binary payloads are attached AFTER the identity policy and the validator have seen the lean body', () => {
    const policyAt = exportHandler.indexOf('applyIdentityPolicy(template, stripIdentity)');
    const validateAt = exportHandler.indexOf("rpc('_site_template_structure_report'");
    const attachAt = exportHandler.indexOf('const fullBody: Record<string, unknown>');
    expect(policyAt).toBeGreaterThan(0);
    expect(validateAt).toBeGreaterThan(policyAt);
    expect(attachAt).toBeGreaterThan(validateAt);
    expect(exportHandler).toMatch(/p_template_json: fullBody/);
  });

  it('a narrower re-save says what it REMOVED — the new sections too', () => {
    expect(exportHandler).toMatch(/\['wikiPages', 'wiki pages'\], \['documents', 'documents'\], \['media', 'media files'\]/);
  });
});
