import { TwoColumnBlockData, TiptapDocument } from '@/types/cms';
import { renderToHtml } from '@/lib/tiptap-utils';
import { cn } from '@/lib/utils';

interface TwoColumnBlockProps {
  data: TwoColumnBlockData;
}

export function TwoColumnBlock({ data }: TwoColumnBlockProps) {
  const imageFirst = data.imagePosition === 'left';
  const stickyColumn = data.stickyColumn || 'none';

  const stickyStyles = 'md:sticky md:top-24 md:self-start';
  
  // Use the shared tiptap-utils for consistent rendering
  const htmlContent = renderToHtml(data.content);

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
            // Reset inherited direction for text column
            imageFirst ? '' : 'md:[direction:ltr]',
            stickyColumn === 'text' && stickyStyles
          )}>
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        </div>
      </div>
    </section>
  );
}
