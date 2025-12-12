import { ContactBlockData } from '@/types/cms';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

interface ContactBlockProps {
  data: ContactBlockData;
}

export function ContactBlock({ data }: ContactBlockProps) {
  return (
    <section className="py-16 px-6 bg-muted/30">
      <div className="container mx-auto max-w-4xl">
        {data.title && (
          <h2 className="font-serif text-3xl font-bold mb-8 text-center">{data.title}</h2>
        )}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            {data.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-primary" />
                <a href={`tel:${data.phone}`} className="hover:text-primary transition-colors">
                  {data.phone}
                </a>
              </div>
            )}
            {data.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-primary" />
                <a href={`mailto:${data.email}`} className="hover:text-primary transition-colors">
                  {data.email}
                </a>
              </div>
            )}
            {data.address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="whitespace-pre-line">{data.address}</span>
              </div>
            )}
          </div>
          {data.hours && data.hours.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-primary" />
                <span className="font-medium">Öppettider</span>
              </div>
              <div className="space-y-2">
                {data.hours.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span>{item.day}</span>
                    <span className="text-muted-foreground">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
