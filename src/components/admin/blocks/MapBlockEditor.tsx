import { useState, useEffect } from 'react';
import { MapBlockData } from '@/types/cms';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MapPin, Loader2 } from 'lucide-react';

interface GeocodedLocation {
  lat: number;
  lon: number;
}

interface MapBlockEditorProps {
  data: MapBlockData;
  onChange: (data: MapBlockData) => void;
  isEditing: boolean;
}

const HEIGHT_OPTIONS = [
  { value: 'sm', label: 'Small (192px)' },
  { value: 'md', label: 'Medium (288px)' },
  { value: 'lg', label: 'Large (384px)' },
  { value: 'xl', label: 'Extra Large (500px)' },
];

const MAP_TYPE_OPTIONS = [
  { value: 'roadmap', label: 'Roadmap' },
  { value: 'satellite', label: 'Satellite' },
];

export function MapBlockEditor({ data, onChange, isEditing }: MapBlockEditorProps) {
  const [location, setLocation] = useState<GeocodedLocation | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateField = <K extends keyof MapBlockData>(field: K, value: MapBlockData[K]) => {
    onChange({ ...data, [field]: value });
  };

  // Geocode address using Nominatim
  useEffect(() => {
    if (!data.address || data.address.length < 5) {
      setLocation(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const query = encodeURIComponent(data.address);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`
        );
        const results = await response.json();
        if (results && results.length > 0) {
          setLocation({
            lat: parseFloat(results[0].lat),
            lon: parseFloat(results[0].lon),
          });
        } else {
          setLocation(null);
        }
      } catch {
        setLocation(null);
      } finally {
        setIsLoading(false);
      }
    }, 500); // Debounce

    return () => clearTimeout(timeoutId);
  }, [data.address]);

  // Generate OpenStreetMap embed URL
  const getEmbedUrl = () => {
    if (!location) return '';
    const zoom = data.zoom || 16;
    const delta = 0.01 / (zoom / 10);
    const bbox = [
      location.lon - delta,
      location.lat - delta,
      location.lon + delta,
      location.lat + delta,
    ].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${location.lat},${location.lon}`;
  };

  const heightClasses: Record<string, string> = {
    sm: 'h-48',
    md: 'h-72',
    lg: 'h-96',
    xl: 'h-[500px]',
  };

  if (!isEditing) {
    // Preview mode
    return (
      <div className="space-y-4">
        {data.title && (
          <h3 className="text-lg font-semibold">{data.title}</h3>
        )}
        {data.description && (
          <p className="text-muted-foreground text-sm">{data.description}</p>
        )}
        <div
          className={`relative ${heightClasses[data.height || 'md']} ${
            data.showBorder ? 'border border-border' : ''
          } ${data.rounded ? 'rounded-lg overflow-hidden' : ''}`}
        >
          {isLoading ? (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : location ? (
            <iframe
              src={getEmbedUrl()}
              className="w-full h-full"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              title={data.locationName || 'Map'}
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MapPin className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">{data.address ? 'Address not found' : 'No address specified'}</p>
              </div>
            </div>
          )}
        </div>
        {data.locationName && (
          <p className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            {data.locationName}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Location Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Location
        </h4>
        
        <div className="space-y-2">
          <Label htmlFor="address">Address *</Label>
          <Input
            id="address"
            value={data.address}
            onChange={(e) => updateField('address', e.target.value)}
            placeholder="Storgatan 1, 123 45 Stockholm"
          />
          <p className="text-xs text-muted-foreground">
            Full address for the map marker
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="locationName">Location Name</Label>
          <Input
            id="locationName"
            value={data.locationName || ''}
            onChange={(e) => updateField('locationName', e.target.value)}
            placeholder="Main Office"
          />
          <p className="text-xs text-muted-foreground">
            Display name shown below the map
          </p>
        </div>
      </div>

      {/* Display Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Display Options
        </h4>
        
        <div className="space-y-2">
          <Label htmlFor="title">Title (optional)</Label>
          <Input
            id="title"
            value={data.title || ''}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="Find Us"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            value={data.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Visit our clinic located in central Stockholm..."
            rows={2}
          />
        </div>
      </div>

      {/* Map Settings */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Map Settings
        </h4>

        <div className="space-y-2">
          <Label>Zoom Level: {data.zoom}</Label>
          <Slider
            value={[data.zoom]}
            onValueChange={([value]) => updateField('zoom', value)}
            min={1}
            max={20}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            1 = World view, 20 = Street level
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Map Type</Label>
            <Select
              value={data.mapType}
              onValueChange={(value: 'roadmap' | 'satellite') => updateField('mapType', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAP_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Height</Label>
            <Select
              value={data.height}
              onValueChange={(value: 'sm' | 'md' | 'lg' | 'xl') => updateField('height', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEIGHT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Styling Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Styling
        </h4>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="showBorder">Show Border</Label>
              <p className="text-xs text-muted-foreground">Add a border around the map</p>
            </div>
            <Switch
              id="showBorder"
              checked={data.showBorder}
              onCheckedChange={(checked) => updateField('showBorder', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="rounded">Rounded Corners</Label>
              <p className="text-xs text-muted-foreground">Apply rounded corners to map</p>
            </div>
            <Switch
              id="rounded"
              checked={data.rounded}
              onCheckedChange={(checked) => updateField('rounded', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="loadOnConsent">GDPR: Load on Consent</Label>
              <p className="text-xs text-muted-foreground">Only show map after cookie consent</p>
            </div>
            <Switch
              id="loadOnConsent"
              checked={data.loadOnConsent || false}
              onCheckedChange={(checked) => updateField('loadOnConsent', checked)}
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      {data.address && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Preview
          </h4>
          <div
            className={`relative h-48 ${
              data.showBorder ? 'border border-border' : ''
            } ${data.rounded ? 'rounded-lg overflow-hidden' : ''}`}
          >
            {isLoading ? (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : location ? (
              <iframe
                src={getEmbedUrl()}
                className="w-full h-full"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                title="Map preview"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MapPin className="h-6 w-6 mx-auto mb-1" />
                  <p className="text-xs">Address not found</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
