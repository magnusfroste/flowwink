/**
 * Minimal Markdown → Tiptap JSON converter used by agent-execute when AI
 * generates blog/article content as Markdown that must be stored as a
 * Tiptap doc (the canonical content model for blog posts).
 *
 * Supports: headings (h1-h6), bullet lists, ordered lists, paragraphs,
 * inline bold (`**text**`) and italic (`*text*` / `_text_`).
 */

export function inlineClean(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1').trim();
}

export function parseInline(text: string): any[] {
  const result: any[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|([^*_]+))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      result.push({ type: 'text', marks: [{ type: 'bold' }], text: match[2] });
    } else if (match[3]) {
      result.push({ type: 'text', marks: [{ type: 'italic' }], text: match[3] });
    } else if (match[4]) {
      result.push({ type: 'text', marks: [{ type: 'italic' }], text: match[4] });
    } else if (match[5] && match[5].trim()) {
      result.push({ type: 'text', text: match[5] });
    }
  }
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
