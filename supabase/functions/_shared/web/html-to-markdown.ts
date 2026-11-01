/**
 * The built-in reader's converter — a page's HTML to readable markdown, with
 * no service and no key. The last resort of the `read` chain: what a keyless,
 * self-hosted instance reads with when Firecrawl is not configured and Jina is
 * rate-limiting it. Pure (unit-tested from src/lib/__tests__).
 *
 * Deliberately modest: the main content (main/article when present, else the
 * body) without scripts, styles, navigation, header, footer and forms;
 * headings, paragraphs, list items, links and line breaks. It does not run
 * JavaScript — a page that paints in the browser reads as a shell here, and
 * the caller is told the provider was `builtin` so it can judge that.
 */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', aring: 'å', auml: 'ä', ouml: 'ö',
  Aring: 'Å', Auml: 'Ä', Ouml: 'Ö', eacute: 'é', uuml: 'ü', copy: '©', reg: '®',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m);
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/[ \t\f\v\r]+/g, ' ').trim();
}

export interface ReadablePage {
  title: string;
  description: string;
  markdown: string;
}

export function htmlToMarkdown(html: string, baseUrl?: string): ReadablePage {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const description = decodeEntities(
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1]
    ?? '',
  ).trim();

  let body = html;
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (main && stripTags(main).length > 200) body = main;
  else body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;

  body = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, '');

  const abs = (href: string) => {
    if (!baseUrl) return href;
    try { return new URL(href, baseUrl).toString(); } catch { return href; }
  };

  let md = body
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${'#'.repeat(Math.min(Number(n), 4))} ${stripTags(t)}\n\n`)
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => {
      const text = stripTags(t);
      if (!text) return '';
      return /^(#|javascript:|mailto:)/i.test(href) ? text : `[${text}](${abs(href)})`;
    })
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${t.replace(/<[^>]+>/g, ' ').trim()}`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|ul|ol|table|tr|blockquote)>/gi, '\n\n')
    .replace(/<(p|div|section|ul|ol|table|tr|blockquote)\b[^>]*>/gi, '\n');

  md = decodeEntities(md.replace(/<[^>]+>/g, ''))
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v\r]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, description, markdown: md };
}
