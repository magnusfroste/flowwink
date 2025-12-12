import { TextBlockData } from '@/types/cms';

interface TextBlockProps {
  data: TextBlockData;
}

export function TextBlock({ data }: TextBlockProps) {
  return (
    <section className="py-12 px-6" style={{ backgroundColor: data.backgroundColor }}>
      <div 
        className="container mx-auto max-w-3xl prose prose-lg"
        dangerouslySetInnerHTML={{ __html: data.content || '' }}
      />
    </section>
  );
}
