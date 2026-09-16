import { logger } from '@/lib/logger';

// =============================================================================
// TIPTAP UTILITIES
// =============================================================================
// This module provides utilities for working with Tiptap/ProseMirror documents.
// TiptapDocument is the STANDARD format for rich text in FlowWink.
//
// CONTENT FORMAT STRATEGY:
// - Primary format: TiptapDocument (JSON) - stored in database, used in editors
// - Export formats: HTML, Markdown, Plain text - generated on demand
// - Legacy format: HTML strings - deprecated, convert to TiptapDocument
//
// HEADLESS API:
// Use renderToHtml() or renderToMarkdown() when serving content via API.
// =============================================================================

/**
 * Standard Tiptap document structure (ProseMirror format)
 * This is the PRIMARY format for all rich text content in FlowWink.
 */
export interface TiptapDocument {
  type: 'doc';
  content: TiptapNode[];
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if content is a Tiptap JSON document
 */
export function isTiptapDocument(content: unknown): content is TiptapDocument {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as TiptapDocument).type === 'doc'
  );
}

/**
 * Check if a Tiptap document is effectively empty
 */
export function isDocumentEmpty(content: string | TiptapDocument | undefined): boolean {
  if (!content) return true;
  
  if (typeof content === 'string') {
    return content.trim() === '' || content === '<p></p>';
  }
  
  if (isTiptapDocument(content)) {
    if (!content.content || content.content.length === 0) return true;
    if (content.content.length === 1) {
      const firstNode = content.content[0];
      if (firstNode.type === 'paragraph' && (!firstNode.content || firstNode.content.length === 0)) {
        return true;
      }
    }
  }
  
  return false;
}

// =============================================================================
// DOCUMENT CREATION
// =============================================================================

/**
 * Create an empty Tiptap document
 */
export function createEmptyDocument(): TiptapDocument {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };
}

/**
 * Create a TiptapDocument from plain text.
 * Splits on double newlines for paragraphs.
 */
export function createDocumentFromText(text: string): TiptapDocument {
  if (!text || !text.trim()) return createEmptyDocument();
  
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  
  return {
    type: 'doc',
    content: paragraphs.map(p => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p.trim() }]
    }))
  };
}

/**
 * Create a TiptapDocument from markdown text.
 * Parses headings, paragraphs, bold, italic, links, lists, blockquotes, and code blocks.
 */
export function createDocumentFromMarkdown(markdown: string): TiptapDocument {
  if (!markdown || !markdown.trim()) return createEmptyDocument();

  const lines = markdown.split('\n');
  const nodes: TiptapNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      nodes.push({
        type: 'heading',
        attrs: { level },
        content: parseInlineMarks(headingMatch[2].trim()),
      });
      i++;
      continue;
    }

    // Code blocks
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push({
        type: 'codeBlock',
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      nodes.push({
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: parseInlineMarks(quoteLines.join(' ').trim()),
        }],
      });
      continue;
    }

    // Unordered list
    if (line.match(/^\s*[-*]\s+/)) {
      const items: TiptapNode[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*]\s+/)) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, '').trim();
        items.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: parseInlineMarks(itemText),
          }],
        });
        i++;
      }
      nodes.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+\.\s+/)) {
      const items: TiptapNode[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, '').trim();
        items.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: parseInlineMarks(itemText),
          }],
        });
        i++;
      }
      nodes.push({ type: 'orderedList', content: items });
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      nodes.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // Regular paragraph
    nodes.push({
      type: 'paragraph',
      content: parseInlineMarks(line.trim()),
    });
    i++;
  }

  return { type: 'doc', content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }] };
}

/**
 * Parse inline markdown marks (bold, italic, links, code) into Tiptap nodes.
 */
function parseInlineMarks(text: string): TiptapNode[] {
  const nodes: TiptapNode[] = [];
  // Regex for: **bold**, *italic*, `code`, [text](url)
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    if (match[2]) {
      // Bold
      nodes.push({ type: 'text', text: match[2], marks: [{ type: 'bold' }] });
    } else if (match[3]) {
      // Italic
      nodes.push({ type: 'text', text: match[3], marks: [{ type: 'italic' }] });
    } else if (match[4]) {
      // Code
      nodes.push({ type: 'text', text: match[4], marks: [{ type: 'code' }] });
    } else if (match[5] && match[6]) {
      // Link
      nodes.push({ type: 'text', text: match[5], marks: [{ type: 'link', attrs: { href: match[6] } }] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', text }];
}

/**
 * Get content suitable for initializing a Tiptap editor.
 * Handles: undefined, Tiptap JSON, or legacy HTML strings.
 * 
 * @deprecated Prefer using TiptapDocument directly. HTML support is legacy.
 */
export function getEditorContent(content: string | TiptapDocument | undefined): string | TiptapDocument {
  if (!content) return '';
  if (isTiptapDocument(content)) return content;
  return content; // HTML string (legacy)
}

// =============================================================================
// RENDERING / EXPORT
// =============================================================================

/* -----------------------------------------------------------------------------
 * Rendering without the editor.
 *
 * `renderToHtml` used `generateHTML` from @tiptap/react with StarterKit + Link.
 * That import pulled the whole editor -- @tiptap/core, ProseMirror state, view,
 * transform and model -- into EVERY public page, because text, accordion, tabs,
 * info-box, two-column, KB and blog renderers all call it. A visitor's phone
 * parsed an editor it would never open before it could draw a paragraph
 * (optic's landing page, 2026-09-16).
 *
 * Rendering stored content needs a serializer, not an editor. What follows
 * reproduces ProseMirror's DOMSerializer for the StarterKit + Link schema
 * exactly -- mark ranks, shared-mark grouping across adjacent text, link
 * attribute defaults, and the browser's innerHTML escaping -- and is proven
 * identical to the old implementation by a test that keeps @tiptap as the
 * reference (src/lib/__tests__/tiptap-render-equivalence.test.ts).
 *
 * Failure semantics are kept on purpose: an unknown node or mark, or an empty
 * text node, made ProseMirror throw and renderToHtml return ''. Same here.
 * -------------------------------------------------------------------------- */

class UnrenderableContent extends Error {}

/* Schema rank = serialisation order: the lower rank is the OUTER element. Read
   from the live schema: link 0, bold 1, code 2, italic 3, strike 4, underline 5. */
const MARK_RANK: Record<string, number> = { link: 0, bold: 1, code: 2, italic: 3, strike: 4, underline: 5 };
const MARK_TAG: Record<string, string> = { link: 'a', bold: 'strong', code: 'code', italic: 'em', strike: 's', underline: 'u' };
const LINK_DEFAULTS: Record<'target' | 'rel' | 'class', string | null> = {
  target: '_blank',
  rel: 'noopener noreferrer nofollow',
  class: null,
};

const NBSP = String.fromCharCode(0xa0);
const WS_CLASS = '[ \\t\\r\\n' + String.fromCharCode(0x0c) + ']';
const WS_RUN = new RegExp(WS_CLASS + '+', 'g');
const WS_LEADING = new RegExp('^' + WS_CLASS);
const WS_TRAILING_CHAR = new RegExp(WS_CLASS + '$');
const WS_TRAILING_RUN = new RegExp(WS_CLASS + '+$');

/* The browser's innerHTML serialisation: text escapes & < > and nbsp;
   attribute values escape & " and nbsp. Nothing else. */
const escText = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split(NBSP).join('&nbsp;');
const escAttr = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').split(NBSP).join('&nbsp;');

interface NormMark { type: string; attrs: Record<string, unknown> }

function normaliseMark(m: TiptapMark): NormMark {
  const type = m?.type;
  if (!type || !(type in MARK_RANK)) throw new UnrenderableContent(`Unknown mark type: ${type}`);
  if (type !== 'link') return { type, attrs: {} };
  const raw = (m.attrs ?? {}) as Record<string, unknown>;
  // undefined -> the extension default; an explicit null -> attribute omitted.
  const pick = (k: 'target' | 'rel' | 'class') => (raw[k] === undefined ? LINK_DEFAULTS[k] : raw[k]);
  return { type, attrs: { href: raw.href ?? null, target: pick('target'), rel: pick('rel'), class: pick('class') } };
}

function marksEqual(a: NormMark, b: NormMark): boolean {
  if (a.type !== b.type) return false;
  const ka = Object.keys(a.attrs);
  const kb = Object.keys(b.attrs);
  return ka.length === kb.length && ka.every((k) => a.attrs[k] === b.attrs[k]);
}

function openMark(m: NormMark): string {
  const tag = MARK_TAG[m.type];
  if (m.type !== 'link') return `<${tag}>`;
  // mergeAttributes(defaults{target,rel,class}, attrs{href,...}) -> target, rel, class, href; nulls dropped.
  const parts: string[] = [];
  for (const k of ['target', 'rel', 'class', 'href'] as const) {
    const v = m.attrs[k];
    if (v !== null && v !== undefined) parts.push(`${k}="${escAttr(String(v))}"`);
  }
  return `<a${parts.length ? ' ' + parts.join(' ') : ''}>`;
}

const closeMark = (m: NormMark) => `</${MARK_TAG[m.type]}>`;

/* ProseMirror DOMSerializer.serializeFragment: marks shared with the previous
   node stay open; the rest close from the point of divergence and reopen. */
function renderChildren(children: TiptapNode[]): string {
  let html = '';
  const active: NormMark[] = [];
  for (const child of children) {
    const marks = (child.marks ?? []).map(normaliseMark).sort((x, y) => MARK_RANK[x.type] - MARK_RANK[y.type]);
    let keep = 0;
    while (keep < active.length && keep < marks.length && marksEqual(marks[keep], active[keep])) keep++;
    while (active.length > keep) html += closeMark(active.pop()!);
    for (let i = keep; i < marks.length; i++) {
      html += openMark(marks[i]);
      active.push(marks[i]);
    }
    html += renderNode(child);
  }
  while (active.length) html += closeMark(active.pop()!);
  return html;
}

function renderNode(node: TiptapNode): string {
  switch (node?.type) {
    case 'text': {
      if (typeof node.text !== 'string' || node.text === '') {
        throw new UnrenderableContent('Empty text nodes are not allowed');
      }
      return escText(node.text);
    }
    case 'doc':
      return renderChildren(node.content ?? []);
    case 'paragraph':
      return `<p>${renderChildren(node.content ?? [])}</p>`;
    case 'heading': {
      const level = (node.attrs as { level?: unknown } | undefined)?.level ?? 1;
      return `<h${level}>${renderChildren(node.content ?? [])}</h${level}>`;
    }
    case 'blockquote':
      return `<blockquote>${renderChildren(node.content ?? [])}</blockquote>`;
    case 'bulletList':
      return `<ul>${renderChildren(node.content ?? [])}</ul>`;
    case 'listItem':
      return `<li>${renderChildren(node.content ?? [])}</li>`;
    case 'orderedList': {
      const start = (node.attrs as { start?: unknown } | undefined)?.start ?? 1;
      const attr = start !== 1 ? ` start="${escAttr(String(start))}"` : '';
      return `<ol${attr}>${renderChildren(node.content ?? [])}</ol>`;
    }
    case 'codeBlock': {
      const lang = (node.attrs as { language?: unknown } | undefined)?.language;
      const cls = lang ? ` class="language-${escAttr(String(lang))}"` : '';
      return `<pre><code${cls}>${renderChildren(node.content ?? [])}</code></pre>`;
    }
    case 'hardBreak':
      return '<br>';
    case 'horizontalRule':
      return '<hr>';
    default:
      throw new UnrenderableContent(`Unknown node type: ${node?.type}`);
  }
}

/* -- Legacy HTML strings -> document, by the StarterKit parse rules ----------
   ProseMirror's DOMParser without preserveWhitespace: runs of whitespace
   collapse to one space, a leading space is dropped at the start of a block or
   after a space or <br>, trailing space is trimmed when the block closes, and
   inline content outside a textblock is wrapped in a paragraph. */

const BLOCK_TAGS: Record<string, string> = {
  P: 'paragraph', H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading',
  BLOCKQUOTE: 'blockquote', UL: 'bulletList', OL: 'orderedList', LI: 'listItem', PRE: 'codeBlock',
};
const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);

function markFromElement(el: Element): TiptapMark | null {
  const tag = el.tagName;
  const style = (el.getAttribute('style') ?? '').toLowerCase();
  if (tag === 'STRONG') return { type: 'bold' };
  if (tag === 'B') return /font-weight\s*:\s*normal/.test(style) ? null : { type: 'bold' };
  if (tag === 'EM' || tag === 'I') return { type: 'italic' };
  if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') return { type: 'strike' };
  if (tag === 'U') return { type: 'underline' };
  if (tag === 'CODE') return { type: 'code' };
  if (tag === 'A') {
    const href = el.getAttribute('href');
    if (!href || /^\s*javascript:/i.test(href)) return null;
    // Tiptap's parse rule skips an attribute the element does not carry, so the
    // extension default applies (target _blank, the rel list) -- absent is not null.
    const attrs: Record<string, string> = { href };
    for (const k of ['target', 'rel', 'class'] as const) {
      const v = el.getAttribute(k);
      if (v !== null) attrs[k] = v;
    }
    return { type: 'link', attrs };
  }
  if (tag === 'SPAN') {
    if (/font-weight\s*:\s*(bold|[6-9]00)/.test(style)) return { type: 'bold' };
    if (/font-style\s*:\s*italic/.test(style)) return { type: 'italic' };
    if (/text-decoration[^;]*line-through/.test(style)) return { type: 'strike' };
    if (/text-decoration[^;]*underline/.test(style)) return { type: 'underline' };
  }
  return null;
}

type Frame = { node: TiptapNode; inline: boolean; implicit?: boolean };

function htmlToDocument(html: string): TiptapDocument {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const blocks: TiptapNode[] = [];
  const stack: Frame[] = [{ node: { type: 'doc', content: blocks }, inline: false }];
  const top = () => stack[stack.length - 1];
  const childrenOf = (n: TiptapNode) => (n.content ??= []);

  const trimTrailing = (n: TiptapNode) => {
    const c = n.content;
    const last = c?.[c.length - 1];
    if (last?.type === 'text' && typeof last.text === 'string') {
      last.text = last.text.replace(WS_TRAILING_RUN, '');
      if (!last.text) c!.pop();
    }
  };

  const openImplicitParagraph = () => {
    if (top().inline) return;
    const p: TiptapNode = { type: 'paragraph', content: [] };
    childrenOf(top().node).push(p);
    stack.push({ node: p, inline: true, implicit: true });
  };

  const closeImplicit = () => {
    const t = top();
    if (t.inline && t.implicit) {
      trimTrailing(t.node);
      stack.pop();
    }
  };

  const walk = (dom: Node, marks: TiptapMark[]) => {
    if (dom.nodeType === 3) {
      let value = (dom as Text).data.replace(WS_RUN, ' ');
      if (!value) return;
      if (!top().inline) {
        if (!value.trim()) return; // whitespace between blocks
        openImplicitParagraph();
      }
      const content = childrenOf(top().node);
      const before = content[content.length - 1];
      const prevDom = dom.previousSibling;
      if (
        WS_LEADING.test(value) &&
        (!before ||
          before.type === 'hardBreak' ||
          (prevDom !== null && prevDom.nodeName === 'BR') ||
          (before.type === 'text' && WS_TRAILING_CHAR.test(before.text ?? '')))
      ) {
        value = value.slice(1);
      }
      if (!value) return;
      content.push(marks.length ? { type: 'text', text: value, marks: marks.map((m) => ({ ...m })) } : { type: 'text', text: value });
      return;
    }
    if (dom.nodeType !== 1) return;
    const el = dom as Element;
    if (IGNORED_TAGS.has(el.tagName)) return;

    if (el.tagName === 'BR') {
      openImplicitParagraph();
      childrenOf(top().node).push({ type: 'hardBreak' });
      return;
    }
    if (el.tagName === 'HR') {
      closeImplicit();
      childrenOf(top().node).push({ type: 'horizontalRule' });
      return;
    }

    const blockType = BLOCK_TAGS[el.tagName];
    if (blockType) {
      closeImplicit();
      const node: TiptapNode = { type: blockType, content: [] };
      if (blockType === 'heading') node.attrs = { level: Number(el.tagName.slice(1)) };
      if (blockType === 'orderedList') {
        const start = el.getAttribute('start');
        node.attrs = { start: start ? parseInt(start, 10) : 1 };
      }
      if (blockType === 'codeBlock') {
        const code = el.querySelector('code');
        const m = /(?:^|\s)language-(\S+)/.exec(code?.getAttribute('class') ?? '');
        node.attrs = { language: m ? m[1] : null };
        const text = (code ?? el).textContent ?? '';
        node.content = text ? [{ type: 'text', text }] : [];
        childrenOf(top().node).push(node);
        return;
      }
      childrenOf(top().node).push(node);
      const inline = blockType === 'paragraph' || blockType === 'heading';
      stack.push({ node, inline });
      el.childNodes.forEach((c) => walk(c, marks));
      closeImplicit();
      if (inline) trimTrailing(node);
      stack.pop();
      return;
    }

    const mark = markFromElement(el);
    el.childNodes.forEach((c) => walk(c, mark ? [...marks, mark] : marks));
  };

  body.childNodes.forEach((c) => walk(c, []));
  closeImplicit();
  return { type: 'doc', content: blocks };
}

function renderDocumentOrEmpty(doc: unknown, what: string): string {
  try {
    return renderNode(doc as TiptapNode);
  } catch (e) {
    logger.error(`Failed to render ${what}:`, e);
    return '';
  }
}

/**
 * Render Tiptap document to HTML for display.
 * Use this for public-facing content or headless API HTML output.
 * Accepts unknown type to handle Supabase JSON fields.
 */
export function renderToHtml(content: unknown): string {
  if (!content) return '';

  // Two legacy string shapes: markdown AND raw HTML. HTML must NOT go through
  // the markdown parser -- tags would land in text nodes and render escaped,
  // showing literal "<p>...</p>" to visitors.
  if (typeof content === 'string') {
    if (/^\s*</.test(content)) {
      if (typeof DOMParser === 'undefined') {
        logger.error('Failed to render legacy HTML content: no DOMParser in this environment');
        return '';
      }
      let doc: TiptapDocument;
      try {
        doc = htmlToDocument(content);
      } catch (e) {
        logger.error('Failed to render legacy HTML content:', e);
        return '';
      }
      return renderDocumentOrEmpty(doc, 'legacy HTML content');
    }
    return renderDocumentOrEmpty(createDocumentFromMarkdown(content), 'markdown content to HTML');
  }

  if (isTiptapDocument(content)) return renderDocumentOrEmpty(content, 'Tiptap content to HTML');

  // Array of blocks (legacy format) - Tiptap content from the first text block.
  if (Array.isArray(content) && content.length > 0) {
    const firstBlock = content[0];
    if (firstBlock?.type === 'text' && firstBlock?.data?.content) {
      const html = renderDocumentOrEmpty(firstBlock.data.content, 'wrapped Tiptap content');
      if (html) return html;
    }
  }

  return '';
}

/**
 * @deprecated Use renderToHtml instead
 */
export const renderTiptapContent = renderToHtml;

/**
 * Render Tiptap document to Markdown for headless API or export.
 * Supports: paragraphs, headings, lists, links, bold, italic, code.
 */
export function renderToMarkdown(content: string | TiptapDocument | undefined): string {
  if (!content) return '';
  
  if (!isTiptapDocument(content)) {
    // Legacy HTML - convert to plain text as fallback
    return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
  return nodesToMarkdown(content.content);
}

function nodesToMarkdown(nodes: TiptapNode[] | undefined, depth = 0): string {
  if (!nodes) return '';
  
  return nodes.map(node => nodeToMarkdown(node, depth)).join('');
}

function nodeToMarkdown(node: TiptapNode, depth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return textWithMarks(node.content) + '\n\n';
    
    case 'heading': {
      const level = (node.attrs?.level as number) || 1;
      const prefix = '#'.repeat(level);
      return `${prefix} ${textWithMarks(node.content)}\n\n`;
    }
    
    case 'bulletList':
      return (node.content || []).map(item => nodeToMarkdown(item, depth)).join('') + '\n';
    
    case 'orderedList':
      return (node.content || []).map((item, i) => 
        nodeToMarkdown({ ...item, attrs: { ...item.attrs, orderedIndex: i + 1 } }, depth)
      ).join('') + '\n';
    
    case 'listItem': {
      const prefix = node.attrs?.orderedIndex ? `${node.attrs.orderedIndex}. ` : '- ';
      const indent = '  '.repeat(depth);
      const content = (node.content || []).map(child => {
        if (child.type === 'paragraph') {
          return textWithMarks(child.content);
        }
        return nodeToMarkdown(child, depth + 1);
      }).join('');
      return `${indent}${prefix}${content}\n`;
    }
    
    case 'blockquote':
      return (node.content || []).map(child => 
        '> ' + nodeToMarkdown(child, depth).trim()
      ).join('\n') + '\n\n';
    
    case 'codeBlock': {
      const lang = (node.attrs?.language as string) || '';
      const code = textWithMarks(node.content);
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
    
    case 'horizontalRule':
      return '---\n\n';
    
    case 'hardBreak':
      return '  \n';
    
    case 'text':
      return applyMarks(node.text || '', node.marks);
    
    default:
      return nodesToMarkdown(node.content, depth);
  }
}

function textWithMarks(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return '';
  return nodes.map(node => {
    if (node.type === 'text') {
      return applyMarks(node.text || '', node.marks);
    }
    return nodeToMarkdown(node);
  }).join('');
}

function applyMarks(text: string, marks: TiptapMark[] | undefined): string {
  if (!marks || marks.length === 0) return text;
  
  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `**${result}**`;
        break;
      case 'italic':
        result = `*${result}*`;
        break;
      case 'code':
        result = `\`${result}\``;
        break;
      case 'link':
        result = `[${result}](${mark.attrs?.href || ''})`;
        break;
      case 'strike':
        result = `~~${result}~~`;
        break;
    }
  }
  return result;
}

// =============================================================================
// PLAIN TEXT EXTRACTION
// =============================================================================

/**
 * Extract plain text from Tiptap JSON document or HTML.
 * Use for search indexing, AI context, or excerpts.
 */
export function extractPlainText(content: unknown): string {
  if (!content) return '';
  
  if (typeof content === 'string') {
    return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
  if (typeof content === 'object' && content !== null) {
    const texts: string[] = [];
    
    const extract = (node: TiptapNode) => {
      if (node.text) {
        texts.push(node.text);
      }
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(extract);
      }
    };
    
    extract(content as TiptapNode);
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }
  
  return '';
}
