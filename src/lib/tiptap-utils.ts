import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

// Standard Tiptap document structure
export interface TiptapDocument {
  type: 'doc';
  content: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
    }>;
    attrs?: Record<string, unknown>;
  }>;
}

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
 * Get content suitable for initializing a Tiptap editor
 * Handles: undefined, Tiptap JSON, or legacy HTML strings
 */
export function getEditorContent(content: string | TiptapDocument | undefined): string | TiptapDocument {
  if (!content) return '';
  if (isTiptapDocument(content)) return content;
  return content; // HTML string
}

/**
 * Render Tiptap document or HTML string to HTML for display
 */
export function renderTiptapContent(content: string | TiptapDocument | undefined): string {
  if (!content) return '';
  
  if (isTiptapDocument(content)) {
    try {
      return generateHTML(content, [StarterKit, Link]);
    } catch (e) {
      console.error('Failed to render Tiptap content:', e);
      return '';
    }
  }
  
  // Legacy HTML string
  return content;
}

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

/**
 * Create a TiptapDocument from plain text
 * Splits on double newlines for paragraphs
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
 * Extract plain text from Tiptap JSON document
 */
export function extractPlainText(content: unknown): string {
  if (!content) return '';
  
  if (typeof content === 'string') {
    return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
  if (typeof content === 'object' && content !== null) {
    const texts: string[] = [];
    
    const extract = (node: any) => {
      if (node.text) {
        texts.push(node.text);
      }
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(extract);
      }
    };
    
    extract(content);
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }
  
  return '';
}
