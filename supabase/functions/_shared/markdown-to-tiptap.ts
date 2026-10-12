/**
 * Minimal Markdown → Tiptap JSON converter used by agent-execute when AI
 * generates blog/article content as Markdown that must be stored as a
 * Tiptap doc (the canonical content model for blog posts).
 *
 * Supports: headings (h1-h6), bullet lists, ordered lists, paragraphs, and
 * inline links (`[label](url)`, `<https://…>`), images (as a link to the
 * image), `code`, bold (`**text**`) and italic (`*text*` / `_text_`).
 *
 * Links were missing until 2026-10-12: parseInline knew only bold and italic,
 * so FlowPilot's `[liteIT.se](https://www.liteit.se/#erbjudandet)` reached the
 * reader as raw text on www.liteit.se — 5 links in 4 of 7 posts. Both write
 * paths (write_blog_post, manage_blog_posts update with `content`) use this.
 */

/**
 * Hrefs a published page may carry. The renderer does not filter schemes, so
 * the parser is the gate: anything else (javascript:, data:, vbscript:…)
 * stays plain text — the reader sees the label, nothing runs.
 */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;
const isExternal = (href: string) => /^https?:\/\//i.test(href);

type Mark = { type: string; attrs?: Record<string, string | null> };

function linkMark(href: string): Mark {
  // External: the renderer's defaults (target _blank, rel noopener noreferrer
  // nofollow). Own-site paths open in place and are not nofollow'd.
  return isExternal(href)
    ? { type: 'link', attrs: { href } }
    : { type: 'link', attrs: { href, target: null, rel: null } };
}

/** Plain text of a fragment — for headings, which carry no marks. */
export function inlineClean(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)\s]+(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)\s]+(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/(^|[^\p{L}\p{N}_])_(.+?)_(?![\p{L}\p{N}_])/gu, '$1$2')
    .trim();
}

// One pass, first match wins, in this order: code (its content is literal),
// image, link, autolink, bold, italic. `_x_` is italic only on a word
// boundary, so snake_case words and URLs keep their underscores.
const INLINE = new RegExp(
  [
    '`([^`]+)`',                                             // 1 code
    '!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)',   // 2 alt, 3 src
    '\\[([^\\]]+)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)',     // 4 label, 5 href
    '<((?:https?:\\/\\/|mailto:)[^>\\s]+)>',                  // 6 autolink
    '\\*\\*(.+?)\\*\\*',                                     // 7 bold
    '\\*([^*\\s](?:[^*]*?[^*\\s])?)\\*',                       // 8 italic *
    '(?<![\\p{L}\\p{N}_])_([^_\\s](?:[^_]*?[^_\\s])?)_(?![\\p{L}\\p{N}_])', // 9 italic _
  ].join('|'),
  'gu',
);

export function parseInline(text: string): any[] {
  const result: any[] = [];
  const push = (t: string, marks?: Mark[]) => {
    if (!t) return;
    result.push(marks && marks.length ? { type: 'text', marks, text: t } : { type: 'text', text: t });
  };
  let last = 0;
  INLINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE.exec(text)) !== null) {
    push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      push(m[1], [{ type: 'code' }]);
    } else if (m[3] !== undefined) {
      const label = inlineClean(m[2] || '') || m[3];
      push(label, SAFE_HREF.test(m[3]) ? [linkMark(m[3])] : undefined);
    } else if (m[5] !== undefined) {
      const label = inlineClean(m[4]);
      push(label, SAFE_HREF.test(m[5]) ? [linkMark(m[5])] : undefined);
    } else if (m[6] !== undefined) {
      push(m[6], [linkMark(m[6])]);
    } else if (m[7] !== undefined) {
      push(m[7], [{ type: 'bold' }]);
    } else if (m[8] !== undefined) {
      push(m[8], [{ type: 'italic' }]);
    } else if (m[9] !== undefined) {
      push(m[9], [{ type: 'italic' }]);
    }
    last = m.index + m[0].length;
  }
  push(text.slice(last));
  if (result.length === 0) {
    result.push({ type: 'text', text: text.trim() || ' ' });
  }
  return result;
}

export function markdownToTiptap(md: string): any {
  const lines = md.split('\n');
  const nodes: any[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      nodes.push({
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text: inlineClean(headingMatch[2]) }],
      });
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: any[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^[-*]\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(itemText) }],
        });
        i++;
      }
      nodes.push({ type: 'bulletList', content: items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: any[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+\.\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(itemText) }],
        });
        i++;
      }
      nodes.push({ type: 'orderedList', content: items });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    nodes.push({
      type: 'paragraph',
      content: parseInline(line),
    });
    i++;
  }

  if (nodes.length === 0) {
    nodes.push({ type: 'paragraph' });
  }

  return { type: 'doc', content: nodes };
}
