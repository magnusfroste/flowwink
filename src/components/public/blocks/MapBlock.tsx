import { useState, useEffect } from 'react';
import { MapBlockData } from '@/types/cms';
import { MapPin, Cookie, Loader2, MapPinOff } from 'lucide-react';
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

interface GeocodedLocation {
  lat: number;
  lon: number;
}

export function MapBlock({ data }: MapBlockProps) {
  const [hasConsent, setHasConsent] = useState(!data.loadOnConsent);
  const [manualConsent, setManualConsent] = useState(false);
  const [location, setLocation] = useState<GeocodedLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (data.loadOnConsent) {
      const consent = localStorage.getItem('cookie-consent');
      setHasConsent(consent === 'accepted' || manualConsent);
    }
  }, [data.loadOnConsent, manualConsent]);

  // Geocode address using Nominatim (free, no API key needed)
  useEffect(() => {
    if (!data.address) return;

    const geocodeAddress = async () => {
      setIsLoading(true);
      setError(false);
      
      try {
        const query = encodeURIComponent(data.address);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );
        
        if (!response.ok) throw new Error('Geocoding failed');
        
        const results = await response.json();
        
        if (results && results.length > 0) {
          setLocation({
            lat: parseFloat(results[0].lat),
            lon: parseFloat(results[0].lon),
          });
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Geocoding error:', err);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    geocodeAddress();
  }, [data.address]);

  if (!data.address) {
    return null;
  }

  const getEmbedUrl = () => {
    if (!location) return '';
    
    const zoom = data.zoom || 16;
    const delta = 0.01 / (zoom / 10); // Adjust bbox based on zoom
    
    const bbox = [
      location.lon - delta,
      location.lat - delta,
      location.lon + delta,
      location.lat + delta,
    ].join(',');
    
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${location.lat},${location.lon}`;
  };

  const containerClasses = `
    relative
    ${HEIGHT_CLASSES[data.height || 'md']}
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
                  This map uses OpenStreetMap. Click to load external content.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setManualConsent(true)}
                >
                  Load Map
                </Button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
          ) : error ? (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <div className="text-center p-6">
                <MapPinOff className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-medium mb-2 text-foreground">Address Not Found</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Could not locate: {data.address}
                </p>
              </div>
            </div>
          ) : location ? (
            <iframe
              src={getEmbedUrl()}
              className="w-full h-full"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              title={data.locationName || data.title || 'Map'}
            />
          ) : null}
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
