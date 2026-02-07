import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

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

/**
 * Render Tiptap document to HTML for display.
 * Use this for public-facing content or headless API HTML output.
 * Accepts unknown type to handle Supabase JSON fields.
 */
export function renderToHtml(content: unknown): string {
  if (!content) return '';
  
  // Handle string content - convert markdown to Tiptap JSON, then render
  if (typeof content === 'string') {
    const doc = createDocumentFromMarkdown(content);
    try {
      return generateHTML(doc, [StarterKit, Link]);
    } catch (e) {
      console.error('Failed to render markdown content to HTML:', e);
      return '';
    }
  }
  
  // Handle Tiptap document
  if (isTiptapDocument(content)) {
    try {
      return generateHTML(content, [StarterKit, Link]);
    } catch (e) {
      console.error('Failed to render Tiptap content to HTML:', e);
      return '';
    }
  }
  
  // Handle array of blocks (legacy format) - extract Tiptap content from text blocks
  if (Array.isArray(content) && content.length > 0) {
    const firstBlock = content[0];
    if (firstBlock?.type === 'text' && firstBlock?.data?.content) {
      try {
        return generateHTML(firstBlock.data.content, [StarterKit, Link]);
      } catch (e) {
        console.error('Failed to render wrapped Tiptap content:', e);
      }
    }
  }
  
  // Unknown type - return empty
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
