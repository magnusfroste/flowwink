import { TwoColumnBlockData, TiptapDocument } from '@/types/cms';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

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

  return (
    <section className="py-16 px-6">
      <div className="container mx-auto max-w-6xl">
        <div className={`grid md:grid-cols-2 gap-12 items-center ${imageFirst ? '' : 'md:[direction:rtl]'}`}>
          {data.imageSrc && (
            <div className={imageFirst ? '' : 'md:[direction:ltr]'}>
              <img
                src={data.imageSrc}
                alt={data.imageAlt || ''}
                className="w-full h-auto rounded-lg shadow-md"
              />
            </div>
          )}
          <div className={`prose prose-lg dark:prose-invert max-w-none ${imageFirst ? '' : 'md:[direction:ltr]'}`}>
            <div dangerouslySetInnerHTML={{ __html: renderContent(data.content) }} />
          </div>
        </div>
      </div>
    </section>
  );
}
