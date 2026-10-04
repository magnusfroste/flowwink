import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A page's SEO has one contract: the meta_json keys the public page reads.
 * Building the MJP demo (2026-09-28) an agent wrote seo_title/seo_description —
 * manage_page declared meta as "Page meta JSON" with no keys — and every page
 * went out with no description. seo_audit_page then said "0 words" on pages
 * with thousands (it read string fields only; a block body is a Tiptap doc) and
 * looked for ogImage while the page reads og_image. And index.html shipped an
 * EMPTY <meta name="description"> ahead of Helmet's, so a JS-rendering crawler
 * met a blank description first on every site.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('a share preview reads what the page puts in its head', () => {
  // Crawlers never run the SPA: vercel.json serves every navigation through
  // api/html.ts, which fills the shell's head from the same keys.
  // It read the page title while the tab showed meta_json.seoTitle, ignored
  // noIndex, had no KB route, and claimed 1200x630 for every image (MJP,
  // 2026-09-28). The head keys are DISCOVERED from PublicPage's <SeoHead>.
  const page = read('src/pages/PublicPage.tsx');
  // The <SeoHead> that carries the page's own meta (the file also has a
  // bare one for its not-found state).
  const heads = page.split('<SeoHead').slice(1).map((h) => h.slice(0, h.indexOf('/>')));
  const head = heads.find((h) => h.includes('meta_json')) ?? '';
  const headKeys = [...new Set([...head.matchAll(/meta_json\?\.([A-Za-z_]+)/g)].map((m) => m[1]))];
  const og = read('api/html.ts');

  it('every meta_json key in the page head is read by the crawler prerender', () => {
    expect(headKeys).toEqual(expect.arrayContaining(['seoTitle', 'description', 'og_image', 'noIndex']));
    const missing = headKeys.filter((k) => !new RegExp(`\\bm\\.${k}\\b`).test(og));
    expect(missing, 'api/html.ts must read these the way the page does').toEqual([]);
  });

  it('KB articles get their own card, and no image size is invented', () => {
    expect(og).toMatch(/kb_articles\?slug=eq\./);
    expect(og).not.toMatch(/og:image:width" content="1200"/);
  });
});

describe('the page reads what the skill declares', () => {
  it('every meta_json key PublicPage reads is declared on manage_page, with a description', () => {
    const page = read('src/pages/PublicPage.tsx');
    const readKeys = [...new Set([...page.matchAll(/meta_json\?\.([A-Za-z_]+)/g)].map((m) => m[1]))];
    expect(readKeys.length, 'scanner found the keys').toBeGreaterThan(3);
    type Seed = { name: string; tool_definition: { function: { parameters: { properties: Record<string, { properties?: Record<string, { description?: string }> }> } } } };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const props = artifact.modules.flatMap((m) => m.skills).find((s) => s.name === 'manage_page')!.tool_definition.function.parameters.properties;
    const declared = props.meta.properties ?? {};
    // ogImage is the legacy spelling read as a fallback; og_image is the one to write.
    for (const k of readKeys.filter((k) => k !== 'ogImage')) {
      expect(Object.keys(declared), `manage_page.meta declares ${k}`).toContain(k);
      expect(declared[k].description, `${k} says what it is for`).toBeTruthy();
    }
    expect(Object.keys(props.meta_json.properties ?? {})).toEqual(Object.keys(declared));
  });

  it('the audit counts a page\'s words with the same reader as the knowledge index', () => {
    const edge = read('supabase/functions/agent-execute/index.ts');
    const start = edge.indexOf("case 'seo_audit_page': {");
    const body = edge.slice(start, start + 9000);
    expect(body).toMatch(/extractTextFromBlock\(b\)/);
    expect(body).toMatch(/!meta\.og_image && !meta\.ogImage && !page\.featured_image/);
  });

  it('the static shell carries no empty description to compete with the page\'s own', () => {
    expect(read('index.html')).not.toMatch(/<meta name="description" content=""/);
  });
});
