import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { TextBlockData, TiptapDocument } from '@/types/cms';

// Extensions used for HTML generation (must match editor extensions)
const extensions = [StarterKit, Link];

// Helper to check if content is Tiptap JSON
function isTiptapDocument(content: string | TiptapDocument): content is TiptapDocument {
  return typeof content === 'object' && content !== null && content.type === 'doc';
}

// Convert content to HTML for rendering
function renderContent(content: string | TiptapDocument | undefined): string {
  if (!content) return '';
  
  // If it's Tiptap JSON, convert to HTML
  if (isTiptapDocument(content)) {
    try {
      return generateHTML(content, extensions);
    } catch (error) {
      console.error('Failed to render Tiptap JSON:', error);
      return '';
    }
  }
  
  // Legacy HTML content - return as-is
  return content;
}

interface TextBlockProps {
  data: TextBlockData;
}

export function TextBlock({ data }: TextBlockProps) {
  const html = renderContent(data.content);
  
  return (
    <section className="py-12 px-6" style={{ backgroundColor: data.backgroundColor }}>
      <div 
        className="container mx-auto max-w-3xl prose prose-lg dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
