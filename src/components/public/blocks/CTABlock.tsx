import { CTABlockData } from '@/types/cms';

interface CTABlockProps {
  data: CTABlockData;
}

export function CTABlock({ data }: CTABlockProps) {
  if (!data.title || !data.buttonText || !data.buttonUrl) return null;
  
  return (
    <section className={`py-16 px-6 ${data.gradient ? 'bg-gradient-to-r from-primary to-primary/80' : 'bg-primary'} text-primary-foreground`}>
      <div className="container mx-auto text-center max-w-2xl">
        <h2 className="font-serif text-3xl font-bold mb-4">{data.title}</h2>
        {data.subtitle && <p className="text-lg opacity-90 mb-6">{data.subtitle}</p>}
        <a 
          href={data.buttonUrl} 
          className="inline-block bg-background text-foreground px-8 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          {data.buttonText}
        </a>
      </div>
    </section>
  );
}
