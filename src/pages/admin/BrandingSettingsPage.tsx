import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImagePickerField } from '@/components/admin/ImagePickerField';
import { useBrandingSettings, useUpdateBrandingSettings, type BrandingSettings } from '@/hooks/useSiteSettings';
import { AVAILABLE_HEADING_FONTS, AVAILABLE_BODY_FONTS } from '@/providers/BrandingProvider';
import { Loader2, Palette, Type, Image, LayoutGrid, Sparkles } from 'lucide-react';

// Predefined design themes
const DESIGN_THEMES: { id: string; name: string; description: string; settings: Partial<BrandingSettings> }[] = [
  {
    id: 'healthcare-classic',
    name: 'Klassisk Sjukvård',
    description: 'Traditionell medicinsk blå med serif-typsnitt',
    settings: {
      primaryColor: '220 100% 26%',
      secondaryColor: '210 25% 95%',
      accentColor: '180 45% 40%',
      headingFont: 'PT Serif',
      bodyFont: 'Inter',
      borderRadius: 'md',
      shadowIntensity: 'subtle',
    },
  },
  {
    id: 'modern-minimalist',
    name: 'Modern Minimalist',
    description: 'Ren, avskalad design med skarpa kanter',
    settings: {
      primaryColor: '220 15% 20%',
      secondaryColor: '0 0% 98%',
      accentColor: '220 90% 55%',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      borderRadius: 'none',
      shadowIntensity: 'none',
    },
  },
  {
    id: 'warm-welcoming',
    name: 'Varm & Välkomnande',
    description: 'Mjuka färger och rundade former',
    settings: {
      primaryColor: '25 75% 47%',
      secondaryColor: '35 30% 96%',
      accentColor: '160 50% 45%',
      headingFont: 'Merriweather',
      bodyFont: 'Open Sans',
      borderRadius: 'lg',
      shadowIntensity: 'medium',
    },
  },
  {
    id: 'professional-trust',
    name: 'Professionell & Pålitlig',
    description: 'Konservativ design som signalerar förtroende',
    settings: {
      primaryColor: '210 70% 35%',
      secondaryColor: '210 20% 96%',
      accentColor: '45 90% 50%',
      headingFont: 'Libre Baskerville',
      bodyFont: 'Source Sans 3',
      borderRadius: 'sm',
      shadowIntensity: 'subtle',
    },
  },
];

export default function BrandingSettingsPage() {
  const { data: savedSettings, isLoading } = useBrandingSettings();
  const updateSettings = useUpdateBrandingSettings();
  const [settings, setSettings] = useState<BrandingSettings>({});

  useEffect(() => {
    if (savedSettings) {
      setSettings(savedSettings);
    }
  }, [savedSettings]);

  const handleSave = () => {
    updateSettings.mutate(settings);
  };

  const updateField = <K extends keyof BrandingSettings>(field: K, value: BrandingSettings[K]) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  // Convert HSL string to hex for color picker
  const hslToHex = (hsl: string): string => {
    if (!hsl) return '#003087';
    const [h, s, l] = hsl.split(' ').map((v) => parseFloat(v));
    const sDecimal = s / 100;
    const lDecimal = l / 100;
    const c = (1 - Math.abs(2 * lDecimal - 1)) * sDecimal;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lDecimal - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Convert hex to HSL string
  const hexToHsl = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '220 100% 26%';
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
        case g: h = ((b - r) / d + 2) * 60; break;
        case b: h = ((r - g) / d + 4) * 60; break;
      }
    }
    return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  const applyTheme = (themeId: string) => {
    const theme = DESIGN_THEMES.find((t) => t.id === themeId);
    if (theme) {
      setSettings((prev) => ({
        ...prev,
        ...theme.settings,
      }));
    }
  };

  // Convert HSL to hex for theme preview
  const getThemePreviewColors = (theme: typeof DESIGN_THEMES[0]) => ({
    primary: hslToHex(theme.settings.primaryColor || '220 100% 26%'),
    secondary: hslToHex(theme.settings.secondaryColor || '210 40% 96%'),
    accent: hslToHex(theme.settings.accentColor || '199 89% 48%'),
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif font-bold">Varumärke & Design</h1>
            <p className="text-muted-foreground mt-1">
              Anpassa utseendet på den publika webbplatsen
            </p>
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Spara ändringar
          </Button>
        </div>

        <Tabs defaultValue="themes" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 max-w-2xl">
            <TabsTrigger value="themes" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Teman</span>
            </TabsTrigger>
            <TabsTrigger value="identity" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              <span className="hidden sm:inline">Identitet</span>
            </TabsTrigger>
            <TabsTrigger value="colors" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Färger</span>
            </TabsTrigger>
            <TabsTrigger value="typography" className="flex items-center gap-2">
              <Type className="h-4 w-4" />
              <span className="hidden sm:inline">Typsnitt</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Utseende</span>
            </TabsTrigger>
          </TabsList>

          {/* Themes */}
          <TabsContent value="themes">
            <Card>
              <CardHeader>
                <CardTitle>Designteman</CardTitle>
                <CardDescription>Välj ett fördefinierat tema som utgångspunkt, sedan kan du finjustera i de andra flikarna</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {DESIGN_THEMES.map((theme) => {
                    const colors = getThemePreviewColors(theme);
                    return (
                      <button
                        key={theme.id}
                        onClick={() => applyTheme(theme.id)}
                        className="text-left p-4 rounded-lg border-2 hover:border-primary/50 transition-all group"
                      >
                        <div className="flex items-start gap-4">
                          {/* Color preview */}
                          <div className="flex flex-col gap-1">
                            <div
                              className="h-8 w-8 rounded-md"
                              style={{ backgroundColor: colors.primary }}
                            />
                            <div className="flex gap-1">
                              <div
                                className="h-3 w-3 rounded-sm"
                                style={{ backgroundColor: colors.secondary }}
                              />
                              <div
                                className="h-3 w-3 rounded-sm"
                                style={{ backgroundColor: colors.accent }}
                              />
                            </div>
                          </div>
                          
                          <div className="flex-1">
                            <h3 className="font-semibold group-hover:text-primary transition-colors">
                              {theme.name}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {theme.description}
                            </p>
                            <div className="flex gap-2 mt-2">
                              <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                {theme.settings.headingFont}
                              </span>
                              <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                {theme.settings.borderRadius === 'none' ? 'Skarpa' : 
                                 theme.settings.borderRadius === 'lg' ? 'Rundade' : 'Standard'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Identity */}
          <TabsContent value="identity">
            <Card>
              <CardHeader>
                <CardTitle>Identitet</CardTitle>
                <CardDescription>Logo och organisationsnamn som visas på webbplatsen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Organisationsnamn</Label>
                  <Input
                    value={settings.organizationName || ''}
                    onChange={(e) => updateField('organizationName', e.target.value)}
                    placeholder="T.ex. Sophiahemmet"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Logo (ljus bakgrund)</Label>
                    <ImagePickerField
                      value={settings.logo || ''}
                      onChange={(url) => updateField('logo', url)}
                      placeholder="Logo-URL"
                    />
                    <p className="text-xs text-muted-foreground">Rekommenderad storlek: 200x60px</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Logo (mörk bakgrund)</Label>
                    <ImagePickerField
                      value={settings.logoDark || ''}
                      onChange={(url) => updateField('logoDark', url)}
                      placeholder="Logo-URL (mörk)"
                    />
                    <p className="text-xs text-muted-foreground">Används i footer och dark mode</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Favicon</Label>
                  <ImagePickerField
                    value={settings.favicon || ''}
                    onChange={(url) => updateField('favicon', url)}
                    placeholder="Favicon-URL"
                  />
                  <p className="text-xs text-muted-foreground">Liten ikon som visas i webbläsarfliken (32x32px)</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Colors */}
          <TabsContent value="colors">
            <Card>
              <CardHeader>
                <CardTitle>Färgpalett</CardTitle>
                <CardDescription>Välj färger som representerar ert varumärke</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-3">
                    <Label>Primärfärg</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={hslToHex(settings.primaryColor || '220 100% 26%')}
                        onChange={(e) => updateField('primaryColor', hexToHsl(e.target.value))}
                        className="h-12 w-12 rounded-lg border cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Huvudfärg</p>
                        <p className="text-xs text-muted-foreground">Knappar, länkar, header</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <Label>Sekundärfärg</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={hslToHex(settings.secondaryColor || '210 40% 96%')}
                        onChange={(e) => updateField('secondaryColor', hexToHsl(e.target.value))}
                        className="h-12 w-12 rounded-lg border cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Bakgrundsfärg</p>
                        <p className="text-xs text-muted-foreground">Sektioner, kort</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <Label>Accentfärg</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={hslToHex(settings.accentColor || '199 89% 48%')}
                        onChange={(e) => updateField('accentColor', hexToHsl(e.target.value))}
                        className="h-12 w-12 rounded-lg border cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Högdagrar</p>
                        <p className="text-xs text-muted-foreground">Hover, fokus-tillstånd</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-8 p-6 rounded-lg border bg-muted/30">
                  <p className="text-sm font-medium mb-4">Förhandsvisning</p>
                  <div className="flex flex-wrap gap-3">
                    <div 
                      className="h-16 w-24 rounded-lg flex items-center justify-center text-xs font-medium text-white"
                      style={{ backgroundColor: hslToHex(settings.primaryColor || '220 100% 26%') }}
                    >
                      Primär
                    </div>
                    <div 
                      className="h-16 w-24 rounded-lg flex items-center justify-center text-xs font-medium border"
                      style={{ backgroundColor: hslToHex(settings.secondaryColor || '210 40% 96%') }}
                    >
                      Sekundär
                    </div>
                    <div 
                      className="h-16 w-24 rounded-lg flex items-center justify-center text-xs font-medium text-white"
                      style={{ backgroundColor: hslToHex(settings.accentColor || '199 89% 48%') }}
                    >
                      Accent
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Typography */}
          <TabsContent value="typography">
            <Card>
              <CardHeader>
                <CardTitle>Typsnitt</CardTitle>
                <CardDescription>Välj typsnitt för rubriker och brödtext</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Rubriktypsnitt</Label>
                    <Select
                      value={settings.headingFont || 'PT Serif'}
                      onValueChange={(value) => updateField('headingFont', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_HEADING_FONTS.map((font) => (
                          <SelectItem key={font} value={font}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Används för H1–H6 och logotyp</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Brödtypsnitt</Label>
                    <Select
                      value={settings.bodyFont || 'Inter'}
                      onValueChange={(value) => updateField('bodyFont', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_BODY_FONTS.map((font) => (
                          <SelectItem key={font} value={font}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Används för brödtext och knappar</p>
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-8 p-6 rounded-lg border bg-muted/30 space-y-4">
                  <p className="text-sm font-medium mb-4">Förhandsvisning</p>
                  <h2 
                    className="text-2xl font-bold"
                    style={{ fontFamily: `'${settings.headingFont || 'PT Serif'}', serif` }}
                  >
                    Exempelrubrik med valt typsnitt
                  </h2>
                  <p 
                    className="text-base text-muted-foreground"
                    style={{ fontFamily: `'${settings.bodyFont || 'Inter'}', sans-serif` }}
                  >
                    Detta är en exempeltext som visar hur brödtexten kommer att se ut på webbplatsen. 
                    Valet av typsnitt påverkar läsbarheten och känslan på hela sidan.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance */}
          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Utseende</CardTitle>
                <CardDescription>Anpassa det visuella uttrycket</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Hörnradie</Label>
                    <Select
                      value={settings.borderRadius || 'md'}
                      onValueChange={(value) => updateField('borderRadius', value as BrandingSettings['borderRadius'])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Inga rundade hörn</SelectItem>
                        <SelectItem value="sm">Subtilt rundade</SelectItem>
                        <SelectItem value="md">Medelrundade</SelectItem>
                        <SelectItem value="lg">Kraftigt rundade</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Påverkar knappar, kort och bilder</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Skuggor</Label>
                    <Select
                      value={settings.shadowIntensity || 'subtle'}
                      onValueChange={(value) => updateField('shadowIntensity', value as BrandingSettings['shadowIntensity'])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Inga skuggor</SelectItem>
                        <SelectItem value="subtle">Subtila skuggor</SelectItem>
                        <SelectItem value="medium">Tydliga skuggor</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Ger djup och dimension åt element</p>
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-8 p-6 rounded-lg border bg-muted/30">
                  <p className="text-sm font-medium mb-4">Förhandsvisning</p>
                  <div className="flex flex-wrap gap-4">
                    {(['none', 'sm', 'md', 'lg'] as const).map((radius) => (
                      <div
                        key={radius}
                        className={`h-20 w-20 bg-card border flex items-center justify-center text-xs ${
                          settings.borderRadius === radius ? 'ring-2 ring-primary' : ''
                        }`}
                        style={{
                          borderRadius: radius === 'none' ? 0 : radius === 'sm' ? 4 : radius === 'md' ? 8 : 12,
                          boxShadow: settings.shadowIntensity === 'none' 
                            ? 'none' 
                            : settings.shadowIntensity === 'subtle' 
                              ? '0 1px 3px rgba(0,0,0,0.1)' 
                              : '0 4px 12px rgba(0,0,0,0.15)'
                        }}
                      >
                        {radius}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
