import { TwoColumnBlockData, TiptapDocument } from '@/types/cms';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { cn } from '@/lib/utils';

// Helper to check if content is Tiptap JSON
function isTiptapDocument(content: unknown): content is TiptapDocument {
  return typeof content === 'object' && content !== null && (content as TiptapDocument).type === 'doc';
}

// Render content as HTML (handles both legacy HTML strings and Tiptap JSON)
function renderContent(content: string | TiptapDocument | undefined): string {
  if (!content) return '';
  if (isTiptapDocument(content)) {
    return generateHTML(content, [StarterKit, Link]);
  }
  return content;
}

interface TwoColumnBlockProps {
  data: TwoColumnBlockData;
}

export function TwoColumnBlock({ data }: TwoColumnBlockProps) {
  const imageFirst = data.imagePosition === 'left';
  const stickyColumn = data.stickyColumn || 'none';

  const stickyStyles = 'md:sticky md:top-24 md:self-start';

  return (
    <section className="py-16 px-6">
      <div className="container mx-auto max-w-6xl">
        <div className={cn(
          'grid md:grid-cols-2 gap-12',
          stickyColumn === 'none' && 'items-center',
          stickyColumn !== 'none' && 'items-start',
          imageFirst ? '' : 'md:[direction:rtl]'
        )}>
          {data.imageSrc && (
            <div className={cn(
              imageFirst ? '' : 'md:[direction:ltr]',
              stickyColumn === 'image' && stickyStyles
            )}>
              <img
                src={data.imageSrc}
                alt={data.imageAlt || ''}
                className="w-full h-auto rounded-lg shadow-md"
              />
            </div>
          )}
          <div className={cn(
            'prose prose-lg dark:prose-invert max-w-none',
            imageFirst ? '' : 'md:[direction:ltr]',
            stickyColumn === 'text' && stickyStyles
          )}>
            <div dangerouslySetInnerHTML={{ __html: renderContent(data.content) }} />
          </div>
        </div>
      </div>
    </section>
  );
}
