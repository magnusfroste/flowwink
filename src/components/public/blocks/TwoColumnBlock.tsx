import { TwoColumnBlockData } from '@/types/cms';

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
          <div className={`prose prose-lg max-w-none ${imageFirst ? '' : 'md:[direction:ltr]'}`}>
            <div dangerouslySetInnerHTML={{ __html: data.content || '' }} />
          </div>
        </div>
      </div>
    </section>
  );
}
