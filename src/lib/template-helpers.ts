/**
 * Template Helpers
 * 
 * Simple functions to make creating template content easier.
 * Use these instead of writing raw Tiptap JSON.
 * 
 * @example
 * import { text, heading, bulletList } from '@/lib/template-helpers';
 * 
 * // Simple paragraph
 * content: text('Hello world!')
 * 
 * // Heading with paragraphs
 * content: heading('Welcome', 'First paragraph.', 'Second paragraph.')
 * 
 * // Bullet list
 * content: bulletList('Item 1', 'Item 2', 'Item 3')
 */

import { TiptapDocument, TiptapNode } from '@/types/cms';

/**
 * Create a simple text document from one or more paragraphs.
 * 
 * @example
 * text('Single paragraph of text.')
 * text('First paragraph.', 'Second paragraph.')
 */
export function text(...paragraphs: string[]): TiptapDocument {
  return {
    type: 'doc',
    content: paragraphs.map(p => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p }],
    })),
  };
}

/**
 * Create a document with a heading followed by paragraphs.
 * 
 * @param title The heading text
 * @param paragraphs Optional paragraphs following the heading
 * @param level Heading level (1-6), defaults to 2
 * 
 * @example
 * heading('Our Mission', 'We build great products.')
 * heading('Features', 'Feature 1 description.', 'Feature 2 description.')
 */
export function heading(title: string, ...paragraphs: string[]): TiptapDocument {
  const content: TiptapNode[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: title }],
    },
  ];

  for (const p of paragraphs) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: p }],
    });
  }

  return { type: 'doc', content };
}

/**
 * Create a heading with a specific level.
 * 
 * @example
 * headingLevel(1, 'Main Title')
 * headingLevel(3, 'Subheading')
 */
export function headingLevel(level: 1 | 2 | 3 | 4 | 5 | 6, title: string, ...paragraphs: string[]): TiptapDocument {
  const content: TiptapNode[] = [
    {
      type: 'heading',
      attrs: { level },
      content: [{ type: 'text', text: title }],
    },
  ];

  for (const p of paragraphs) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: p }],
    });
  }

  return { type: 'doc', content };
}

/**
 * Create a bullet list.
 * 
 * @example
 * bulletList('Fast deployment', 'Easy to use', 'Scalable')
 */
export function bulletList(...items: string[]): TiptapDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: items.map(item => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: item }],
            },
          ],
        })),
      },
    ],
  };
}

/**
 * Create a numbered list.
 * 
 * @example
 * numberedList('First step', 'Second step', 'Third step')
 */
export function numberedList(...items: string[]): TiptapDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: items.map(item => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: item }],
            },
          ],
        })),
      },
    ],
  };
}

/**
 * Create a heading followed by a bullet list.
 * 
 * @example
 * headingWithList('Features', 'Fast', 'Reliable', 'Secure')
 */
export function headingWithList(title: string, ...items: string[]): TiptapDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: title }],
      },
      {
        type: 'bulletList',
        content: items.map(item => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: item }],
            },
          ],
        })),
      },
    ],
  };
}

/**
 * Create a document with heading, intro paragraph, and bullet list.
 * 
 * @example
 * section('Why Us', 'We offer the best features:', 'Fast', 'Reliable', 'Affordable')
 */
export function section(title: string, intro: string, ...listItems: string[]): TiptapDocument {
  const content: TiptapNode[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: title }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: intro }],
    },
  ];

  if (listItems.length > 0) {
    content.push({
      type: 'bulletList',
      content: listItems.map(item => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: item }],
          },
        ],
      })),
    });
  }

  return { type: 'doc', content };
}

/**
 * Create a blockquote.
 * 
 * @example
 * quote('The best way to predict the future is to create it.')
 */
export function quote(text: string): TiptapDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text }],
          },
        ],
      },
    ],
  };
}

/**
 * Create text with bold and italic formatting.
 * Use **text** for bold and *text* for italic.
 * 
 * @example
 * richParagraph('This is **bold** and this is *italic*.')
 */
export function richParagraph(text: string): TiptapDocument {
  const content: TiptapNode[] = [];
  
  // Simple parsing for **bold** and *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  
  const textNodes: TiptapNode[] = [];
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      textNodes.push({
        type: 'text',
        text: part.slice(2, -2),
        marks: [{ type: 'bold' }],
      });
    } else if (part.startsWith('*') && part.endsWith('*')) {
      textNodes.push({
        type: 'text',
        text: part.slice(1, -1),
        marks: [{ type: 'italic' }],
      });
    } else if (part) {
      textNodes.push({
        type: 'text',
        text: part,
      });
    }
  }

  if (textNodes.length > 0) {
    content.push({
      type: 'paragraph',
      content: textNodes,
    });
  }

  return { type: 'doc', content };
}

/**
 * Combine multiple documents into one.
 * Useful for building complex content from simpler parts.
 * 
 * @example
 * combine(
 *   heading('Overview'),
 *   text('Introduction paragraph.'),
 *   bulletList('Point 1', 'Point 2')
 * )
 */
export function combine(...docs: TiptapDocument[]): TiptapDocument {
  const content: TiptapNode[] = [];
  for (const doc of docs) {
    if (doc.content) {
      content.push(...doc.content);
    }
  }
  return { type: 'doc', content };
}

/**
 * Create an empty document.
 * Useful as a placeholder.
 */
export function empty(): TiptapDocument {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }],
  };
}

// ============================================
// Block Helpers - Create full block objects
// ============================================

/**
 * Create a text block with automatic ID.
 * 
 * @example
 * textBlock('Welcome to our site!')
 * textBlock(heading('About', 'We are a great company.'))
 */
export function textBlock(content: string | TiptapDocument, id?: string) {
  return {
    id: id || `text-${Date.now()}`,
    type: 'text' as const,
    data: {
      content: typeof content === 'string' ? text(content) : content,
    },
  };
}

/**
 * Create a hero block.
 * 
 * @example
 * heroBlock({
 *   title: 'Welcome',
 *   subtitle: 'Build something amazing',
 *   primaryButton: { text: 'Get Started', url: '/signup' },
 * })
 */
export function heroBlock(options: {
  title: string;
  subtitle?: string;
  backgroundType?: 'color' | 'image' | 'video';
  imageSrc?: string;
  videoUrl?: string;
  heightMode?: 'viewport' | '60vh' | 'auto';
  primaryButton?: { text: string; url: string };
  secondaryButton?: { text: string; url: string };
}, id?: string) {
  return {
    id: id || `hero-${Date.now()}`,
    type: 'hero' as const,
    data: {
      title: options.title,
      subtitle: options.subtitle,
      backgroundType: options.backgroundType || 'color',
      imageSrc: options.imageSrc,
      videoUrl: options.videoUrl,
      heightMode: options.heightMode || 'auto',
      contentAlignment: 'center' as const,
      overlayOpacity: 70,
      primaryButton: options.primaryButton,
      secondaryButton: options.secondaryButton,
    },
  };
}

/**
 * Create a CTA block.
 * 
 * @example
 * ctaBlock({
 *   title: 'Ready to start?',
 *   buttonText: 'Sign Up',
 *   buttonUrl: '/signup',
 * })
 */
export function ctaBlock(options: {
  title: string;
  subtitle?: string;
  buttonText: string;
  buttonUrl: string;
  gradient?: boolean;
}, id?: string) {
  return {
    id: id || `cta-${Date.now()}`,
    type: 'cta' as const,
    data: {
      title: options.title,
      subtitle: options.subtitle,
      buttonText: options.buttonText,
      buttonUrl: options.buttonUrl,
      gradient: options.gradient ?? true,
    },
  };
}

/**
 * Create a features block.
 * 
 * @example
 * featuresBlock({
 *   title: 'Our Features',
 *   features: [
 *     { icon: 'Zap', title: 'Fast', description: 'Lightning quick.' },
 *     { icon: 'Shield', title: 'Secure', description: 'Enterprise security.' },
 *   ],
 * })
 */
export function featuresBlock(options: {
  title: string;
  subtitle?: string;
  columns?: 2 | 3 | 4;
  features: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
}, id?: string) {
  return {
    id: id || `features-${Date.now()}`,
    type: 'features' as const,
    data: {
      title: options.title,
      subtitle: options.subtitle,
      columns: options.columns || 3,
      layout: 'grid' as const,
      variant: 'cards' as const,
      iconStyle: 'circle' as const,
      features: options.features.map((f, i) => ({
        id: `f${i + 1}`,
        ...f,
      })),
    },
  };
}
