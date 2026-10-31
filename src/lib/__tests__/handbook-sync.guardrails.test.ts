import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chapterAddress,
  chapterSortOrder,
  isChapterFile,
  parseFrontmatter,
  resolveChapterLink,
  slugFromFilename,
} from '../../../supabase/functions/_shared/handbook/chapter-path';

/**
 * Guardrail: the handbook syncs from where clawable.org's handbook actually is.
 *
 * Found 2026-10-31: the default named magnusfroste/clawable (unreachable on
 * GitHub) and src/content/chapters, and the sync listed ONE directory level —
 * while the handbook lives in magnusfroste/clawable-handbook as two editions,
 * src/content/builder and src/content/business, both with a "foreword". So a
 * sync found nothing, and a fixed path would still have collided on slugs.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('handbook sync', () => {
  it('defaults to the clawable.org handbook repo and its content root', () => {
    const hook = read('src/hooks/useHandbook.ts');
    expect(hook).toMatch(/repoName: 'clawable-handbook'/);
    expect(hook).toMatch(/path: 'src\/content'/);
    expect(hook).not.toMatch(/repoName: 'clawable',/);
    expect(read('supabase/functions/_shared/handlers/github-content-sync.ts')).toMatch(/path: rawPath = "src\/content"/);
  });

  it('reads the tree recursively in one call, not one directory level', () => {
    const sync = read('supabase/functions/_shared/handlers/github-content-sync.ts');
    expect(sync).toMatch(/git\/trees\/\$\{encodeURIComponent\(branch\)\}\?recursive=1/);
    expect(sync).not.toMatch(/\/contents\/\$\{path\}/);
  });

  it('a subfolder is a section: chapters are <section>/<slug>, so two editions never collide', () => {
    expect(chapterAddress('src/content/builder/00-foreword.md', 'src/content')).toEqual({ section: 'builder', slug: 'builder/foreword' });
    expect(chapterAddress('src/content/business/00-foreword.md', 'src/content/')).toEqual({ section: 'business', slug: 'business/foreword' });
    expect(chapterAddress('handbook/01-welcome.md', 'handbook')).toEqual({ section: '', slug: 'welcome' });
    expect(chapterAddress('01-welcome.md', '')).toEqual({ section: '', slug: 'welcome' });
    expect(slugFromFilename('05b-the-harness.md')).toBe('the-harness');
  });

  it('chapters are markdown files that are not all-caps repo documents', () => {
    expect(isChapterFile('src/content/builder/01-introduction.md')).toBe(true);
    expect(isChapterFile('handbook/intro.mdx')).toBe(true);
    expect(isChapterFile('src/content/SOURCES.md')).toBe(false);
    expect(isChapterFile('README.md')).toBe(false);
    expect(isChapterFile('src/content.config.ts')).toBe(false);
  });

  it('orders by section, then by the chapter\'s own (decimal) order', () => {
    const sections = ['business', 'builder', 'builder'];
    const builderHarness = chapterSortOrder('builder', sections, 5.5);
    const builderLast = chapterSortOrder('builder', sections, 40);
    const businessFirst = chapterSortOrder('business', sections, 0);
    expect(builderHarness).toBeLessThan(builderLast);
    expect(builderLast).toBeLessThan(businessFirst);
    expect(chapterSortOrder('', [], undefined)).toBe(999);
  });

  it('frontmatter: numbers, quotes and CRLF', () => {
    const { frontmatter, content } = parseFrontmatter('---\r\ntitle: "The Harness"\r\norder: 5.5\r\n---\r\n\r\nBody');
    expect(frontmatter).toEqual({ title: 'The Harness', order: 5.5 });
    expect(content.trim()).toBe('Body');
  });

  it('links between chapters resolve whichever way the handbook writes them', () => {
    const slugs = ['builder/foreword', 'builder/heartbeat-protocol', 'business/foreword', 'business/appendix-changelog'];
    expect(resolveChapterLink('/business/appendix-changelog', slugs)).toBe('business/appendix-changelog');
    expect(resolveChapterLink('../business/00-foreword.md', slugs)).toBe('business/foreword');
    expect(resolveChapterLink('00-foreword.md', slugs, 'builder')).toBe('builder/foreword');
    expect(resolveChapterLink('heartbeat-protocol.md', slugs)).toBe('builder/heartbeat-protocol');
    expect(resolveChapterLink('foreword', slugs)).toBeNull(); // two sections have it, no current section
    expect(resolveChapterLink('https://www.clawable.org', slugs)).toBeNull();
  });

  it('handbook_search finds a bare slug when one section has it, and names the choices when several do', () => {
    const exec = read('supabase/functions/agent-execute/index.ts');
    expect(exec).toMatch(/\.like\('slug', `%\/\$\{bare\.replace\(\/\[%_\]\/g, ''\)\}`\)/);
    expect(exec).toMatch(/is in several sections`, code: 'INVALID_INPUT'/);
  });
});
