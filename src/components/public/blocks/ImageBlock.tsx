import { ImageBlockData } from '@/types/cms';

interface ImageBlockProps {
  data: ImageBlockData;
}

export function ImageBlock({ data }: ImageBlockProps) {
  if (!data.src) return null;
  
  return (
    <section className="py-12 px-6">
      <figure className="container mx-auto max-w-4xl">
        <img 
          src={data.src} 
          alt={data.alt || ''} 
          className="w-full h-auto rounded-lg shadow-md"
        />
        {data.caption && (
          <figcaption className="mt-3 text-center text-sm text-muted-foreground">
            {data.caption}
          </figcaption>
        )}
      </figure>
    </section>
  );
}
