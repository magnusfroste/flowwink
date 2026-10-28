import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SITE_EXPORT_MAX_FILE_MB,
  SITE_EXPORT_MAX_PAYLOAD_MB,
  base64Size,
  collectMediaUrls,
  fetchStorageObjectWithinBudget,
  groupUrlsByStorageObject,
  ownHostsFrom,
  parsePublicStorageUrl,
  publicObjectUrl,
  publicStorageBase,
  rewriteUrlsInTemplate,
  siteExportBudget,
  type SiteExportFetch,
} from '../../../supabase/functions/_shared/media/site-export';

/**
 * "Move the whole site to a new instance" — including its knowledge.
 *
 * export_site_template carried the shop window: pages, posts, KB, products.
 * The wiki, the uploaded documents (file + indexed text) and the images the
 * pages referenced stayed behind, so a site moved through the export arrived
 * without exactly the parts an operator cannot rewrite from memory. These
 * tests hold the additions in place:
 *
 *  1. include "wiki" and "documents" exist in the seed AND the handler — the
 *     flag an agent reads must be the flag the code honours;
 *  2. a document keeps its visibility through the round trip and never widens
 *     (nothing uploaded becomes public), and a STORED template is as private
 *     as the most private thing it carries;
 *  3. copy_media embeds the files and install_template rewrites the URLs —
 *     everywhere, wiki and document text included;
 *  4. whatever the edge budget leaves behind is NAMED in export_report.skipped
 *     — an export never fails as a whole, and never reads as complete when it
 *     is not.
 *
 * The pure half (_shared/media/site-export.ts) is exercised for real: the
 * review of #797 found four defects that a text match could not have seen.
 */

const agentExecute = readFileSync(
  resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'), 'utf-8');
const templatesModule = readFileSync(
  resolve(__dirname, '../../../src/lib/modules/templates-module.ts'), 'utf-8');
const templateTypes = readFileSync(
  resolve(__dirname, '../../../src/data/templates/types.ts'), 'utf-8');
const sharedSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/_shared/media/site-export.ts'), 'utf-8');
const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261028090024_site-templates-keep-document-visibility.sql'), 'utf-8');

const exportHandler = agentExecute.slice(
  agentExecute.indexOf('async function tplExportSite'),
  agentExecute.indexOf('async function executeTemplatesAction'));
const installHandler = agentExecute.slice(
  agentExecute.indexOf('async function tplInstall'),
  agentExecute.indexOf('async function executeResetSandbox'));
const exportSeed = templatesModule.slice(
  templatesModule.indexOf("name: 'export_site_template'"));
const installSeed = templatesModule.slice(
  templatesModule.indexOf("name: 'install_template'"),
  templatesModule.indexOf("name: 'export_site_template'"));
const exportDescription = templatesModule.slice(
  templatesModule.indexOf('const EXPORT_SITE_TEMPLATE_DESCRIPTION'),
  templatesModule.indexOf('const TEMPLATE_SKILLS'));

const ORIGIN = 'https://origin.supabase.co';
const imgUrl = (name: string, q = '') => `${ORIGIN}/storage/v1/object/public/cms-images/${name}${q}`;

describe('the include flags exist in the seed AND the handler', () => {
  it('the seed enumerates wiki and documents beside pages/blog/kb/products', () => {
    expect(exportSeed).toMatch(/enum: \['pages', 'blog', 'kb', 'products', 'wiki', 'documents'\]/);
  });

  it('the export handler honours both flags', () => {
    expect(exportHandler).toMatch(/include\.includes\('wiki'\)/);
    expect(exportHandler).toMatch(/include\.includes\('documents'\)/);
  });

  it('wiki pages travel as the wiki stores them — slug, markdown, tags, hierarchy, visibility', () => {
    expect(exportHandler).toMatch(/readAllRows<WikiPageRow>\(supabase, 'wiki_pages', \{\s*columns: 'slug, title, content_md, tags, parent_slug, visibility, editable_by'/);
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

  it('a role this instance does not have narrows to private — the document is kept, not skipped', () => {
    // visible_to_role is the app_role enum: an unknown value is refused with
    // 22P02, which used to drop the document while the note claimed it narrowed.
    expect(installHandler).toMatch(/first\.error\?\.code === '22P02' && meta\.visibility === 'role'/);
    expect(installHandler).toMatch(/meta\.visibility = 'private';\s*meta\.visible_to_role = null;/);
    expect(installHandler).toMatch(/documents_narrowed_to_private:/);
    // Both writes go through the narrowing retry.
    expect((installHandler.match(/await writeNarrowingUnknownRole/g) || []).length).toBe(2);
  });

  it('an existing document on the target is never reopened by an install — visibility only narrows', () => {
    expect(installHandler).toMatch(/if \(rank\(existing\.visibility\) > rank\(visibility\)\) \{/);
    expect(installHandler).toMatch(/meta\.visibility = existing\.visibility/);
  });

  it('the vocabulary has no public value and the bytes land in the private documents bucket', () => {
    expect(agentExecute).toMatch(/const DOCUMENT_VISIBILITY = new Set\(\['shared', 'role', 'private'\]\)/);
    expect(installHandler).toMatch(/supabase\.storage\.from\('documents'\)\s*\.upload\(objectKey, bytes/);
    // A media copy may only write to a PUBLIC media bucket — and the documents
    // bucket is not one, so a document can never be smuggled in as "media".
    expect(sharedSource).toMatch(/SITE_EXPORT_PUBLIC_BUCKETS = new Set\(\['cms-images', 'river-media'\]\)/);
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
});

describe('a STORED template is as private as the most private thing it carries', () => {
  // "Authenticated view site templates" let every signed-in user read every
  // active template; a saved export with an HR contract — or an admin-only
  // wiki page — would have been readable by all of sales one row over.
  it('restricted means a non-shared document OR a non-internal wiki page', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.site_template_carries_restricted_content\(p_template jsonb\)/);
    expect(migration).toMatch(/COALESCE\(d ->> 'visibility', 'private'\) <> 'shared'/);
    expect(migration).toMatch(/p_template -> 'wikiPages'/);
    expect(migration).toMatch(/COALESCE\(w ->> 'visibility', 'internal'\) <> 'internal'/);
  });

  it('decided ONCE at write time by trigger into a column — the policy never walks template_json', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS carries_restricted_content boolean NOT NULL DEFAULT false/);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE ON public\.site_templates/);
    expect(migration).toMatch(/NEW\.carries_restricted_content := public\.site_template_carries_restricted_content\(NEW\.template_json\)/);
    const policy = migration.slice(migration.indexOf('CREATE POLICY "Authenticated view site templates"'));
    expect(policy).toMatch(/is_active = true AND NOT carries_restricted_content/);
    expect(policy).not.toMatch(/template_json/);
  });

  it('rows saved before the migration are stamped, idempotently', () => {
    expect(migration).toMatch(/WHERE carries_restricted_content IS DISTINCT FROM public\.site_template_carries_restricted_content\(template_json\)/);
  });

  it('the export tells the caller who can read what it stored', () => {
    expect(exportHandler).toMatch(/readable_by: restrictedDocuments \|\| restrictedWiki/);
  });
});

describe('copy_media: one definition of a media URL, read per string, never through JSON escapes', () => {
  it('finds a URL inside an HTML attribute with a query string — without the escape backslash', () => {
    // Review of #797: over JSON.stringify output this captured `…?t=123\`.
    const body = { blocks: [{ data: { html: `<img src="${imgUrl('x.png', '?t=123')}">` } }] };
    expect(collectMediaUrls(body)).toEqual([imgUrl('x.png', '?t=123')]);
  });

  it('rewriting a URL inside an escaped-quote attribute keeps the body valid and the markup intact', () => {
    const from = imgUrl('x.png', '?t=123');
    const to = 'https://target.supabase.co/storage/v1/object/public/cms-images/x.png?t=123';
    const body = { pages: [{ blocks: [{ data: { html: `<p>a</p><img src="${from}" alt="x">` } }] }] };
    const out = rewriteUrlsInTemplate(body, new Map([[from, to]]));
    expect(out.pages[0].blocks[0].data.html).toBe(`<p>a</p><img src="${to}" alt="x">`);
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
  });

  it('markdown links, trailing punctuation and look-alike hosts', () => {
    const md = `![a](${imgUrl('a.jpg')}) then https://cdn.example/b.webp. and https://x.png.example.com/c.png`;
    expect(collectMediaUrls({ content_md: md })).toEqual([imgUrl('a.jpg'), 'https://cdn.example/b.webp', 'https://x.png.example.com/c.png']);
    expect(collectMediaUrls('video https://o/hero.mp4?v=2, then')).toEqual(['https://o/hero.mp4?v=2']);
    expect(collectMediaUrls('https://o/a.pngx is not media')).toEqual([]);
  });

  it('video and 3D count as media for the host tally AND the copy — the two used to disagree', () => {
    expect(collectMediaUrls({ hero: { video: imgUrl('hero.mp4') } })).toEqual([imgUrl('hero.mp4')]);
    expect(exportHandler).toMatch(/const mediaUrls = collectMediaUrls\(body\)/);
    expect(exportHandler).toMatch(/const assetCount = mediaUrls\.length/);
    expect(exportHandler).toMatch(/groupUrlsByStorageObject\(mediaUrls, ownHosts\)/);
    // No second, narrower pattern anywhere in the export.
    expect(exportHandler).not.toMatch(/matchAll\(\/https/);
  });

  it('the rewrite is longest-URL-first so a prefix never clobbers a longer URL', () => {
    const short = imgUrl('a.png');
    const long = imgUrl('a.png', '?w=200');
    const out = rewriteUrlsInTemplate({ s: `${long} ${short}` }, new Map([[short, 'S'], [long, 'L']]));
    expect(out.s).toBe('L S');
  });
});

describe('the installer rewrites before it reads — wiki and documents included', () => {
  it('knowledge is re-pointed at the rewritten body after the media step', () => {
    // Review of #797: `knowledge` was captured before step 0, so the wiki and
    // document passes wrote the ORIGIN URLs while media_rewritten_urls said 1.
    expect(installHandler).toMatch(/let knowledge = template as unknown as SiteExportKnowledge/);
    expect(installHandler).toMatch(/template = rewritten as never;\s*knowledge = rewritten as SiteExportKnowledge;/);
    const reassignAt = installHandler.indexOf('knowledge = rewritten as SiteExportKnowledge');
    expect(reassignAt).toBeGreaterThan(0);
    expect(reassignAt).toBeLessThan(installHandler.indexOf('const pages: Partial<SiteExportWikiPage>[] = knowledge.wikiPages'));
    expect(reassignAt).toBeLessThan(installHandler.indexOf('const docs: Partial<SiteExportDocument>[] = knowledge.documents'));
  });

  it('a wiki page and a document body carry the target URL after the rewrite step', () => {
    const from = imgUrl('a.png');
    const to = 'https://target.supabase.co/storage/v1/object/public/cms-images/a.png';
    const body = { wikiPages: [{ slug: 'Home', content_md: `![](${from})` }], pages: [] };
    expect(rewriteUrlsInTemplate(body, new Map([[from, to]])).wikiPages[0].content_md).toBe(`![](${to})`);
    expect(installHandler).toMatch(/content_md: rewriteUrlsInTemplate\(d\.content_md, mediaRewrites\)/);
  });

  it('uploads to the same bucket/path before a page is written', () => {
    expect(installHandler).toMatch(/\.upload\(targetPath, bytes, \{ contentType, upsert: targetPath !== path \}\)/);
    expect(installHandler).toMatch(/mediaRewrites\.set\(v, q >= 0 \? `\$\{toUrl\}\$\{v\.slice\(q\)\}` : toUrl\)/);
    expect(installHandler.indexOf('rewriteUrlsInTemplate(withoutMedia')).toBeLessThan(installHandler.indexOf('// 3. Create pages'));
    expect(installHandler).toMatch(/media_rewritten_urls: mediaRewrites\.size/);
  });
});

describe('"this instance" is more than the runtime URL', () => {
  it('a self-hosted stack: the runtime says kong, the content says the public domain', () => {
    const own = ownHostsFrom(['http://kong:8000', 'https://api.customer.se', undefined, '', ['media.customer.se']]);
    expect(own.has('kong:8000')).toBe(true);
    expect(own.has('api.customer.se')).toBe(true);
    expect(own.has('media.customer.se')).toBe(true);
    const url = 'https://api.customer.se/storage/v1/object/public/cms-images/hero.png';
    expect(parsePublicStorageUrl(url, own)).toEqual({ bucket: 'cms-images', path: 'hero.png', host: 'api.customer.se', own: true });
    expect(parsePublicStorageUrl(url, ownHostsFrom(['http://kong:8000']))?.own).toBe(false);
  });

  it('a URL that is not a storage object is not one at all', () => {
    expect(parsePublicStorageUrl('https://cdn.example/a.png', ownHostsFrom(['cdn.example']))).toBeNull();
  });

  it('the export reads the public-URL variables and media_hosts, and names a host it did not recognise', () => {
    expect(agentExecute).toMatch(/\[Deno\.env\.get\('SUPABASE_PUBLIC_URL'\), Deno\.env\.get\('API_EXTERNAL_URL'\), Deno\.env\.get\('SUPABASE_URL'\)\]/);
    expect(exportHandler).toMatch(/siteExportOwnHosts\(a\.media_hosts\)/);
    expect(exportHandler).toMatch(/unrecognisedStorageHosts\.add\(host\)/);
    expect(exportSeed).toMatch(/media_hosts:/);
  });

  it('a copy that embedded nothing does not read as a portable export', () => {
    expect(exportHandler).toMatch(/mode: !copyMedia \? 'referenced' : media\.length \? 'copied' : 'none_copied'/);
    expect(exportHandler).toMatch(/copied: media\.map/);
    expect(exportHandler).toMatch(/referenced: copyMedia \? mediaReferenced : undefined/);
  });
});

describe('the edge budget: stream against the cap, name what did not fit, never fail the whole export', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  /** A storage response that streams `total` bytes in 1 MB chunks and counts what was pulled. */
  function stubStorage(total: number, contentLength: string | null) {
    const state = { pulled: 0, cancelled: false };
    const CHUNK = 1024 * 1024;
    vi.stubGlobal('fetch', vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (state.pulled >= total) { controller.close(); return; }
          const n = Math.min(CHUNK, total - state.pulled);
          state.pulled += n;
          controller.enqueue(new Uint8Array(n));
        },
        cancel() { state.cancelled = true; },
      }, { highWaterMark: 0 }); // produce only on demand, so `pulled` is what the reader asked for
      const headers = new Headers({ 'content-type': 'video/mp4' });
      if (contentLength) headers.set('content-length', contentLength);
      return new Response(body, { status: 200, headers });
    }));
    return state;
  }
  const store = { url: 'http://kong:8000', key: 'service' };
  const reasonOf = (g: SiteExportFetch) => ('reason' in g ? g.reason : null);

  it('a file far over the cap with NO length header is cut off at the cap, not loaded whole', async () => {
    // Review of #797: download() + arrayBuffer() held a 300 MB video before any check.
    const state = stubStorage(300 * 1024 * 1024, null);
    const budget = siteExportBudget({});
    const got = await fetchStorageObjectWithinBudget(store, 'cms-images', 'hero.mp4', null, budget);
    expect(got.ok).toBe(false);
    expect(reasonOf(got)).toBe('too_large');
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThanOrEqual(budget.maxFileBytes + 2 * 1024 * 1024);
    expect(budget.usedBytes).toBe(0);
  });

  it('an announced Content-Length over the cap is refused before a byte is read', async () => {
    const state = stubStorage(300 * 1024 * 1024, String(300 * 1024 * 1024));
    const got = await fetchStorageObjectWithinBudget(store, 'cms-images', 'hero.mp4', null, siteExportBudget({}));
    expect(got.ok).toBe(false);
    expect(state.pulled).toBe(0);
  });

  it('a file that fits is returned whole and counted against the payload', async () => {
    stubStorage(3 * 1024 * 1024, null);
    const budget = siteExportBudget({});
    const got = await fetchStorageObjectWithinBudget(store, 'documents', 'a/b.pdf', null, budget);
    expect(got.ok).toBe(true);
    expect('bytes' in got ? got.bytes.byteLength : null).toBe(3 * 1024 * 1024);
    // The payload is charged what the body carries: base64, not the raw bytes.
    expect(budget.usedBytes).toBe(base64Size(3 * 1024 * 1024));
  });

  it('max_payload_mb counts base64 — a raw file that fits but whose base64 does not is refused', async () => {
    // Review round 2 of #797: 40 MB of raw bytes is ~53 MB in the row.
    stubStorage(900 * 1024, null); // 0.88 MB raw → 1.17 MB as base64
    const budget = siteExportBudget({ max_payload_mb: 1 });
    const got = await fetchStorageObjectWithinBudget(store, 'documents', 'd.pdf', null, budget);
    expect(reasonOf(got)).toBe('payload_full');
    expect(budget.usedBytes).toBe(0);
  });

  it('a full payload is reported as payload_full, by name, not as an error', async () => {
    stubStorage(2 * 1024 * 1024, null);
    const budget = siteExportBudget({ max_payload_mb: 1 });
    const got = await fetchStorageObjectWithinBudget(store, 'cms-images', 'b.png', null, budget);
    expect(got.ok).toBe(false);
    expect(reasonOf(got)).toBe('payload_full');
  });

  it('a spent deadline stops before the request', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const budget = { ...siteExportBudget({}), deadline: Date.now() - 1 };
    const got = await fetchStorageObjectWithinBudget(store, 'cms-images', 'c.png', null, budget);
    expect(got.ok).toBe(false);
    expect(reasonOf(got)).toBe('out_of_time');
    expect(f).not.toHaveBeenCalled();
  });

  it('the caller can raise neither cap past its ceiling', () => {
    const b = siteExportBudget({ max_file_mb: 999, max_payload_mb: 999 });
    expect(b.maxFileBytes).toBe(SITE_EXPORT_MAX_FILE_MB * 1024 * 1024);
    expect(b.maxPayloadBytes).toBe(SITE_EXPORT_MAX_PAYLOAD_MB * 1024 * 1024);
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

  it('a REFUSED save answers lean too, so the hint and validation survive', () => {
    const refused = exportHandler.slice(exportHandler.indexOf('Export succeeded but the save was refused'));
    expect(refused.slice(0, 900)).toMatch(/template: body,/);
    expect(refused.slice(0, 900)).not.toMatch(/template: fullBody/);
  });

  it('a SAVED export answers with the lean body — megabytes of base64 do not go back through the gateway', () => {
    expect(exportHandler).toMatch(/template: saved \? body : fullBody,/);
    expect(exportHandler).toMatch(/omitted_from_response: true/);
  });

  it('a narrower re-save says what it REMOVED — the new sections too', () => {
    expect(exportHandler).toMatch(/\['wikiPages', 'wiki pages'\], \['documents', 'documents'\], \['media', 'media files'\]/);
  });
});

describe('review round 2 of #797: the install never destroys what the target has', () => {
  it('an update writes only what the export carries — null never erases indexed text', () => {
    expect(installHandler).toMatch(/const carriedOnly = \(m: Record<string, unknown>\)/);
    expect(installHandler).toMatch(/update\(\{ \.\.\.carriedOnly\(m\), updated_at/);
    // content_md is written only when the export has text, and then with a status that matches it.
    expect(installHandler).toMatch(/if \(typeof m\.content_md === 'string' && \(m\.content_md as string\)\.trim\(\)\) \{\s*patch\.content_md = m\.content_md;\s*patch\.extraction_status = 'success';/);
  });

  it('a document with nothing to read is failed, so the extraction sweep never loops on an empty path', () => {
    expect(installHandler).toMatch(/const nothingToRead = !fileUrl && !contentMd;/);
    expect(installHandler).toMatch(/if \(nothingToRead && extractionStatus === 'pending'\) extractionStatus = 'failed';/);
  });

  it('the target\'s own media are never overwritten — same bytes reused, a different file kept', () => {
    expect(installHandler).toMatch(/const there = await statStorageObject\(supabase, bucket, path\)/);
    expect(installHandler).toMatch(/targetPath = `\$\{stem\}-\$\{sha\.slice\(0, 12\)\}\$\{ext\}`/);
    expect(installHandler).toMatch(/media_written_beside_existing:/);
    expect(installHandler).toMatch(/media_reused_existing:/);
    // A failed existence check copies nothing rather than risk an overwrite.
    expect(installHandler).toMatch(/could not check \$\{bucket\}\/\$\{path\} before writing/);
  });

  it('new URLs are written from the PUBLIC base, the same candidates the export recognises', () => {
    expect(installHandler).toMatch(/publicStorageBase\(\[a\.media_base_url, \.\.\.siteExportPublicCandidates\(\)\]\)/);
    expect(agentExecute).toMatch(/return ownHostsFrom\(\[\.\.\.siteExportPublicCandidates\(\), mediaHosts\]\)/);
    expect(installSeed).toMatch(/media_base_url:/);
    // Public first: a self-hosted runtime's SUPABASE_URL is the internal gateway.
    expect(publicStorageBase([undefined, 'https://api.customer.se', 'http://kong:8000'])).toBe('https://api.customer.se');
    expect(publicStorageBase(['', 'http://kong:8000'])).toBe('http://kong:8000');
    expect(publicObjectUrl('https://api.customer.se/', 'cms-images', 'blog/hero image.jpg'))
      .toBe('https://api.customer.se/storage/v1/object/public/cms-images/blog/hero%20image.jpg');
  });

  it('an updated wiki page whose parent is missing is reported as staying where it is', () => {
    expect(installHandler).toMatch(/the page keeps its current place in the hierarchy/);
    expect(installHandler).toMatch(/left at the root/);
  });
});

describe('review round 2 of #797: the export reads completely and fetches each object once', () => {
  it('wiki and documents go through readAllRows on a unique key, and a reached cap fails loudly', () => {
    expect(exportHandler).toMatch(/readAllRows<WikiPageRow>\(supabase, 'wiki_pages', \{[\s\S]*?orderBy: 'slug'/);
    expect(exportHandler).toMatch(/readAllRows<DocumentRow>\(supabase, 'documents', \{[\s\S]*?orderBy: 'id'/);
    expect((exportHandler.match(/if \(truncated\) return \{ error:/g) || []).length).toBe(2);
    expect(agentExecute).not.toMatch(/function readAllRowsPaged/);
  });

  it('URL variants of one storage object are one fetch', () => {
    const own = ownHostsFrom([ORIGIN]);
    const { objects, other } = groupUrlsByStorageObject(
      [imgUrl('a.png'), imgUrl('a.png', '?t=123'), imgUrl('b.png'), 'https://cdn.example/c.png'], own);
    expect(objects).toEqual([
      { bucket: 'cms-images', path: 'a.png', urls: [imgUrl('a.png'), imgUrl('a.png', '?t=123')] },
      { bucket: 'cms-images', path: 'b.png', urls: [imgUrl('b.png')] },
    ]);
    expect(other).toEqual([{ url: 'https://cdn.example/c.png', host: null }]);
  });
});
