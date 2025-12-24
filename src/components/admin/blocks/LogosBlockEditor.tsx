import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, GripVertical, Image as ImageIcon } from 'lucide-react';
import { LogosBlockData, LogoItem } from '@/types/cms';
import { ImagePickerField } from '../ImagePickerField';

interface LogosBlockEditorProps {
  data: LogosBlockData;
  onChange: (data: LogosBlockData) => void;
  isEditing: boolean;
}

export function LogosBlockEditor({ data, onChange, isEditing }: LogosBlockEditorProps) {
  const [expandedLogo, setExpandedLogo] = useState<string | null>(null);

  const logos = data.logos || [];
  const columns = data.columns || 5;
  const layout = data.layout || 'grid';
  const variant = data.variant || 'default';
  const logoSize = data.logoSize || 'md';
  const autoplay = data.autoplay ?? true;
  const autoplaySpeed = data.autoplaySpeed || 3;

  const addLogo = () => {
    const newLogo: LogoItem = {
      id: `logo-${Date.now()}`,
      name: 'Partner Name',
      logo: '',
      url: '',
    };
    onChange({ ...data, logos: [...logos, newLogo] });
    setExpandedLogo(newLogo.id);
  };

  const updateLogo = (id: string, updates: Partial<LogoItem>) => {
    onChange({
      ...data,
      logos: logos.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    });
  };

  const removeLogo = (id: string) => {
    onChange({ ...data, logos: logos.filter((l) => l.id !== id) });
  };

  if (!isEditing) {
    return (
      <div className="p-6 bg-muted/30 rounded-lg">
        <div className="text-center mb-6">
          {data.title && <h3 className="text-xl font-semibold">{data.title}</h3>}
          {data.subtitle && <p className="text-muted-foreground mt-1">{data.subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6">
          {logos.length === 0 ? (
            <p className="text-muted-foreground py-8">No logos added yet</p>
          ) : (
            logos.map((logo) => (
              <div key={logo.id} className="p-3 bg-card rounded-lg border">
                {logo.logo ? (
                  <img src={logo.logo} alt={logo.name} className="h-10 object-contain" />
                ) : (
                  <div className="h-10 w-24 bg-muted rounded flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Trusted By"
          />
        </div>
        <div className="space-y-2">
          <Label>Subtitle</Label>
          <Input
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="Companies we work with"
          />
        </div>
      </div>

      {/* Layout Settings */}
      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>Columns</Label>
          <Select value={String(columns)} onValueChange={(v) => onChange({ ...data, columns: Number(v) as 3 | 4 | 5 | 6 })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 Columns</SelectItem>
              <SelectItem value="4">4 Columns</SelectItem>
              <SelectItem value="5">5 Columns</SelectItem>
              <SelectItem value="6">6 Columns</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Layout</Label>
          <Select value={layout} onValueChange={(v) => onChange({ ...data, layout: v as 'grid' | 'carousel' | 'scroll' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">Grid</SelectItem>
              <SelectItem value="carousel">Carousel</SelectItem>
              <SelectItem value="scroll">Auto Scroll</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Variant</Label>
          <Select value={variant} onValueChange={(v) => onChange({ ...data, variant: v as 'default' | 'grayscale' | 'bordered' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="grayscale">Grayscale</SelectItem>
              <SelectItem value="bordered">Bordered</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Logo Size</Label>
          <Select value={logoSize} onValueChange={(v) => onChange({ ...data, logoSize: v as 'sm' | 'md' | 'lg' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Carousel/Scroll Settings */}
      {(layout === 'carousel' || layout === 'scroll') && (
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch checked={autoplay} onCheckedChange={(v) => onChange({ ...data, autoplay: v })} />
            <Label>Auto-play</Label>
          </div>
          {autoplay && (
            <div className="flex items-center gap-2">
              <Label>Speed (seconds)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={autoplaySpeed}
                onChange={(e) => onChange({ ...data, autoplaySpeed: Number(e.target.value) })}
                className="w-20"
              />
            </div>
          )}
        </div>
      )}

      {/* Logos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Logos</Label>
          <Button variant="outline" size="sm" onClick={addLogo}>
            <Plus className="h-4 w-4 mr-1" />
            Add Logo
          </Button>
        </div>

        {logos.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/30">
            No logos yet. Click "Add Logo" to get started.
          </p>
        )}

        <div className="space-y-2">
          {logos.map((logo) => (
            <Card key={logo.id} className="overflow-hidden">
              <CardHeader
                className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedLogo(expandedLogo === logo.id ? null : logo.id)}
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div className="w-12 h-8 rounded bg-muted flex items-center justify-center overflow-hidden">
                    {logo.logo ? (
                      <img src={logo.logo} alt={logo.name} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-medium truncate">{logo.name}</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLogo(logo.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              {expandedLogo === logo.id && (
                <CardContent className="p-4 pt-0 space-y-4 border-t">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Partner Name</Label>
                      <Input
                        value={logo.name}
                        onChange={(e) => updateLogo(logo.id, { name: e.target.value })}
                        placeholder="Company Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Link URL (optional)</Label>
                      <Input
                        value={logo.url || ''}
                        onChange={(e) => updateLogo(logo.id, { url: e.target.value })}
                        placeholder="https://partner.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Logo Image</Label>
                    <ImagePickerField
                      value={logo.logo}
                      onChange={(url) => updateLogo(logo.id, { logo: url })}
                      placeholder="Logo image URL"
                    />
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
