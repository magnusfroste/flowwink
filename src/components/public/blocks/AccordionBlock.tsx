import { AccordionBlockData } from '@/types/cms';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface AccordionBlockProps {
  data: AccordionBlockData;
}

export function AccordionBlock({ data }: AccordionBlockProps) {
  if (!data.items || data.items.length === 0) return null;

  return (
    <section className="py-16 px-6">
      <div className="container mx-auto max-w-3xl">
        {data.title && (
          <h2 className="font-serif text-3xl font-bold mb-8 text-center">{data.title}</h2>
        )}
        <Accordion type="single" collapsible className="space-y-2">
          {data.items.map((item, index) => (
            <AccordionItem 
              key={index} 
              value={`item-${index}`}
              className="bg-card border border-border rounded-lg px-6"
            >
              <AccordionTrigger className="text-left font-medium hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                <p>{item.answer}</p>
                {item.image && (
                  <img 
                    src={item.image} 
                    alt={item.imageAlt || 'Illustration'} 
                    className="mt-4 rounded-lg max-w-full h-auto"
                    loading="lazy"
                  />
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
