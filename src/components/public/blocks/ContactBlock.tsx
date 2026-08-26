import { ContactBlockData } from '@/types/cms';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

interface ContactBlockProps {
  data: ContactBlockData;
}

export function ContactBlock({ data }: ContactBlockProps) {
  return (
    <section>
      {/* Korten är KOLUMNERNAS, inte sektionens. Den breda tonade panelen
          (#287 gav den radie, ursprunget var ett kantlöst band) lästes på
          optic som 'formulärets bakgrund som går utanför formuläret' — på
          /contact ligger blocket direkt under ett FormBlock. Gles tvåkolumns-
          info i ett ~1150px-kort är fel form; två innehållsnära kort är rätt.
          Sektionen är ren — renderaren äger skalet. */}
      <div className="container mx-auto max-w-6xl">
        {data.title && (
          <h2 className="font-serif text-3xl font-bold mb-8 text-center">{data.title}</h2>
        )}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="space-y-4 rounded-[var(--radius-block,1rem)] bg-muted/30 p-6 md:p-8">
            {data.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-accent-foreground" />
                <a href={`tel:${data.phone}`} className="hover:text-primary transition-colors">
                  {data.phone}
                </a>
              </div>
            )}
            {data.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-accent-foreground" />
                <a href={`mailto:${data.email}`} className="hover:text-primary transition-colors">
                  {data.email}
                </a>
              </div>
            )}
            {data.address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-accent-foreground shrink-0 mt-0.5" />
                <span className="whitespace-pre-line">{data.address}</span>
              </div>
            )}
          </div>
          {data.hours && data.hours.length > 0 && (
            <div className="rounded-[var(--radius-block,1rem)] bg-muted/30 p-6 md:p-8">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-accent-foreground" />
                <span className="font-medium">Opening Hours</span>
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
