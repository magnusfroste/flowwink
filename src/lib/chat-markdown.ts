import DOMPurify from 'dompurify';

// Escape any raw HTML in user-supplied text so markdown can't be used to inject tags
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow safe URL schemes for links
function isSafeUrl(url: string): boolean {
  try {
    const trimmed = url.trim();
    if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
    const parsed = new URL(trimmed, 'https://example.com');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Chat markdown — escape first, then apply markdown, then sanitize.
// Line-based, because a model answers in paragraphs, lists and the odd heading:
// the old one-pass replace turned every newline into <br>, so a "- item" list
// arrived as literal hyphens and an answer that began with a blank line began
// with two empty rows (MJP demo, 2026-09-28).
function inlineMarkdown(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code class="bg-muted-foreground/20 px-1 py-0.5 rounded text-sm">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      if (!isSafeUrl(url)) return label;
      // An address on this site stays in this tab; only the outside world opens a new one.
      const internal = url.trim().startsWith('/') || url.trim().startsWith('#');
      return internal
        ? `<a href="${url}" class="text-primary underline">${label}</a>`
        : `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${label}</a>`;
    });
}

// A model writes "see /contact-us" or "https://…" as often as a markdown link,
// and the widget showed those as dead text (MJP, 2026-09-29: "read the full
// comparison at /kb/mixed-flow-vs-…"). Bare site paths and bare web addresses
// become links too. Only text between tags is touched — never an existing link
// or code — and a path must stand on its own (start, space or "(" before it),
// so "and/or" or "1/2" stay text. Trailing punctuation stays outside the link.
const BARE_PATH = /(^|[\s(])(\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*\/?(?:#[a-z0-9-]+)?)(?=$|[\s),.;:!?])/gi;
const BARE_URL = /(^|[\s(])(https?:\/\/[^\s<]*[^\s<.,;:!?)])/gi;
function linkifyBare(html: string): string {
  return html
    .split(/(<a\b[^>]*>[\s\S]*?<\/a>|<code\b[^>]*>[\s\S]*?<\/code>|<[^>]+>)/)
    .map((part) => (part.startsWith('<')
      ? part
      : part
        .replace(BARE_URL, (_m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${url}</a>`)
        .replace(BARE_PATH, (_m, pre, path) => `${pre}<a href="${path}" class="text-primary underline">${path}</a>`)))
    .join('');
}

export function parseMarkdown(text: string): string {
  const escaped = escapeHtml(text.replace(/\r\n/g, '\n').trim());
  const out: string[] = [];
  // Code blocks first — their content is left exactly as written.
  const parts = escaped.split(/```(\w*)\n?([\s\S]*?)```/g);
  for (let i = 0; i < parts.length; i += 3) {
    const prose = parts[i] ?? '';
    let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
    let para: string[] = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br />')}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((li) => `<li>${li}</li>`).join('')}</${list.tag}>`); list = null; } };
    for (const raw of prose.split('\n')) {
      const line = raw.trimEnd();
      const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
      const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
      if (bullet || numbered) {
        flushPara();
        const tag = bullet ? 'ul' : 'ol';
        if (list && list.tag !== tag) flushList();
        if (!list) list = { tag, items: [] };
        list.items.push(inlineMarkdown((bullet ?? numbered)![1]));
      } else if (heading) {
        flushPara(); flushList();
        out.push(`<p><strong>${inlineMarkdown(heading[1])}</strong></p>`);
      } else if (!line.trim()) {
        flushPara(); flushList();
      } else {
        flushList();
        para.push(inlineMarkdown(line));
      }
    }
    flushPara(); flushList();
    if (i + 2 < parts.length) out.push(`<pre><code class="language-${parts[i + 1]}">${parts[i + 2]}</code></pre>`);
  }
  return DOMPurify.sanitize(linkifyBare(out.join('')), {
    ALLOWED_TAGS: ['a', 'br', 'code', 'pre', 'strong', 'em', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    // DOMPurify checks every non-URI-safe attribute's VALUE against ALLOWED_URI_REGEXP,
    // so "_blank" and "noopener" failed it and were dropped: outside links replaced the site.
    ADD_URI_SAFE_ATTR: ['target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[/#])/i,
  });
}
