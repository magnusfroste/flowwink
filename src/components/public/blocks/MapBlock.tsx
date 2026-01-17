import { useState, useEffect } from 'react';
import { MapBlockData } from '@/types/cms';
import { MapPin, Cookie } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MapBlockProps {
  data: MapBlockData;
}

const HEIGHT_CLASSES: Record<string, string> = {
  sm: 'h-48',
  md: 'h-72',
  lg: 'h-96',
  xl: 'h-[500px]',
};

export function MapBlock({ data }: MapBlockProps) {
  const [hasConsent, setHasConsent] = useState(!data.loadOnConsent);
  const [manualConsent, setManualConsent] = useState(false);

  useEffect(() => {
    if (data.loadOnConsent) {
      const consent = localStorage.getItem('cookie-consent');
      setHasConsent(consent === 'accepted' || manualConsent);
    }
  }, [data.loadOnConsent, manualConsent]);

  if (!data.address) {
    return null;
  }

  const getEmbedUrl = () => {
    const query = encodeURIComponent(data.address);
    const mapType = data.mapType === 'satellite' ? 'k' : 'm';
    const zoom = data.zoom || 15;
    return `https://maps.google.com/maps?q=${query}&z=${zoom}&t=${mapType}&ie=UTF8&output=embed`;
  };

  const containerClasses = `
    relative
    ${HEIGHT_CLASSES[data.height]}
    ${data.showBorder ? 'border border-border' : ''}
    ${data.rounded ? 'rounded-lg overflow-hidden' : ''}
  `;

  const showConsentPlaceholder = data.loadOnConsent && !hasConsent;

  return (
    <section className="py-12 px-6">
      <div className="container mx-auto max-w-4xl">
        {data.title && (
          <h2 className="text-2xl md:text-3xl font-serif font-bold mb-4 text-foreground">
            {data.title}
          </h2>
        )}
        
        {data.description && (
          <p className="text-muted-foreground mb-6 max-w-2xl">
            {data.description}
          </p>
        )}

        <div className={containerClasses}>
          {showConsentPlaceholder ? (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <div className="text-center p-6">
                <Cookie className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-medium mb-2 text-foreground">External Content Blocked</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
                  This map is provided by Google Maps. Click to load external content.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setManualConsent(true)}
                >
                  Load Map
                </Button>
              </div>
            </div>
          ) : (
            <iframe
              src={getEmbedUrl()}
              className="w-full h-full"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={data.locationName || data.title || 'Map'}
            />
          )}
        </div>

        {data.locationName && (
          <p className="mt-4 text-sm font-medium flex items-center gap-2 text-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            {data.locationName}
          </p>
        )}
      </div>
    </section>
  );
}
