import { TextBlockData } from '@/types/cms';
import { renderToHtml } from '@/lib/tiptap-utils';

interface TextBlockProps {
  data: TextBlockData;
}

export function TextBlock({ data }: TextBlockProps) {
  const html = renderToHtml(data.content);
  
  return (
    <section className="py-12 px-6" style={{ backgroundColor: data.backgroundColor }}>
      <div 
        className="container mx-auto max-w-3xl prose prose-lg dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
