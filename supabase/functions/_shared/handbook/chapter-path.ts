/**
 * Handbook chapters from a GitHub folder — which files are chapters, and the
 * address and order each one gets. Pure, no I/O: the sync handler and its
 * guardrail test share it.
 *
 * The folder (`path`) is read recursively. A file directly in it is a chapter
 * at its own slug; a file in a subfolder belongs to that SECTION and is
 * addressed `<section>/<slug>` — clawable-handbook keeps two editions,
 * src/content/builder and src/content/business, and both have a "foreword".
 * Order: sections alphabetically, then each chapter's frontmatter `order`.
 */

/** A chapter file: markdown, not an all-caps repo document (README.md, SOURCES.md, CHANGELOG.md). */
export function isChapterFile(filePath: string): boolean {
  const name = filePath.split('/').pop() ?? '';
  if (!/\.mdx?$/i.test(name)) return false;
  const stem = name.replace(/\.mdx?$/i, '');
  return !/^[A-Z0-9_-]+$/.test(stem);
}

/** "01-introduction.md" → "introduction": the number prefix (01-, 05b-) orders files, it is not part of the name. */
export function slugFromFilename(filename: string): string {
  return filename.replace(/\.mdx?$/i, '').replace(/^\d+[a-z]?-/, '');
}

/** The chapter's place under the synced folder: its section (first subfolder, '' at the root) and slug. */
export function chapterAddress(filePath: string, basePath: string): { section: string; slug: string } {
  const base = basePath.replace(/^\/+|\/+$/g, '');
  const rel = base && filePath.startsWith(`${base}/`) ? filePath.slice(base.length + 1) : filePath;
  const parts = rel.split('/');
  const file = parts.pop() ?? '';
  const section = parts.join('/');
  const slug = slugFromFilename(file);
  return { section, slug: section ? `${section}/${slug}` : slug };
}

/** Sort key: the section's place among the folder's sections, then the chapter's own order (999 when unset). */
export function chapterSortOrder(section: string, sections: string[], order: unknown): number {
  const own = typeof order === 'number' && Number.isFinite(order) ? order : 999;
  const idx = section ? Math.max(0, [...new Set(sections)].sort().indexOf(section)) + 1 : 0;
  return idx * 1000 + own;
}

/** `---\n…\n---\n` frontmatter, flat key: value pairs (CRLF tolerated). */
export function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const text = raw.replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content: text };
  const frontmatter: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (!kv) continue;
    let val: unknown = kv[2].trim().replace(/^["']|["']$/g, '');
    if (val !== '' && !isNaN(Number(val))) val = Number(val);
    frontmatter[kv[1]] = val;
  }
  return { frontmatter, content: match[2] };
}

/**
 * The chapter a link inside a chapter points at, or null for an outside link.
 * Handbooks link both ways: "03-clawable-openclaw.md", "../business/foreword.md"
 * and clawable.org's site addresses "/business/appendix-changelog". A bare
 * name prefers the current section; otherwise it must name one chapter only.
 */
export function resolveChapterLink(href: string, slugs: string[], currentSection = ''): string | null {
  if (!href || /^(https?:|mailto:|tel:|#)/i.test(href)) return null;
  const clean = href.split(/[?#]/)[0].replace(/^(\.\.?\/)+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return null;
  const segs = clean.split('/').map((seg, i, all) => (i === all.length - 1 ? slugFromFilename(seg) : seg));
  const known = new Set(slugs);
  const candidates = [segs.join('/'), segs.slice(-2).join('/')];
  if (segs.length === 1 && currentSection) candidates.unshift(`${currentSection}/${segs[0]}`);
  for (const c of candidates) if (known.has(c)) return c;
  const last = segs[segs.length - 1];
  const tail = slugs.filter((s) => s === last || s.endsWith(`/${last}`));
  return tail.length === 1 ? tail[0] : null;
}
