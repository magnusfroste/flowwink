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
import { BrandGuideDialog } from '@/components/admin/BrandGuideDialog';
import { Loader2, Palette, Type, Image, LayoutGrid, Sparkles, Globe, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

interface CustomTheme {
  id: string;
  name: string;
  settings: Partial<BrandingSettings>;
}

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: savedSettings, isLoading } = useBrandingSettings();
  const updateSettings = useUpdateBrandingSettings();
  const [settings, setSettings] = useState<BrandingSettings>({});
  const [brandGuideOpen, setBrandGuideOpen] = useState(false);

  // Fetch custom themes
  const { data: customThemes = [] } = useQuery({
    queryKey: ['site-settings', 'custom_themes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'custom_themes')
        .maybeSingle();
      if (error) throw error;
      return (data?.value as unknown as CustomTheme[]) || [];
    },
  });

  // Save custom themes mutation
  const saveCustomThemes = useMutation({
    mutationFn: async (themes: CustomTheme[]) => {
      const { data: existing } = await supabase
        .from('site_settings')
        .select('id')
        .eq('key', 'custom_themes')
        .maybeSingle();

      const jsonValue = themes as unknown as Json;

      if (existing) {
        const { error } = await supabase
          .from('site_settings')
          .update({ value: jsonValue, updated_at: new Date().toISOString() })
          .eq('key', 'custom_themes');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('site_settings')
          .insert({ key: 'custom_themes', value: jsonValue });
        if (error) throw error;
      }
      return themes;
    },
    onSuccess: (themes) => {
      queryClient.setQueryData(['site-settings', 'custom_themes'], themes);
    },
  });

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

  const applyCustomTheme = (theme: CustomTheme) => {
    setSettings((prev) => ({
      ...prev,
      ...theme.settings,
    }));
  };

  const handleApplyBranding = (brandingSettings: Partial<BrandingSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...brandingSettings,
    }));
  };

  const handleSaveAsTheme = (name: string, themeSettings: Partial<BrandingSettings>) => {
    const newTheme: CustomTheme = {
      id: `custom-${Date.now()}`,
      name,
      settings: themeSettings,
    };
    saveCustomThemes.mutate([...customThemes, newTheme]);
  };

  const handleDeleteCustomTheme = (themeId: string) => {
    const updated = customThemes.filter((t) => t.id !== themeId);
    saveCustomThemes.mutate(updated);
    toast({
      title: 'Tema borttaget',
      description: 'Det egna temat har tagits bort.',
    });
  };

  // Convert HSL to hex for theme preview
  const getThemePreviewColors = (themeSettings: Partial<BrandingSettings>) => ({
    primary: hslToHex(themeSettings.primaryColor || '220 100% 26%'),
    secondary: hslToHex(themeSettings.secondaryColor || '210 40% 96%'),
    accent: hslToHex(themeSettings.accentColor || '199 89% 48%'),
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
            <div className="space-y-6">
              {/* Brand Guide Assistant */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Brand Guide Assistant
                  </CardTitle>
                  <CardDescription>
                    Analysera en befintlig webbplats och extrahera dess varumärkesprofil automatiskt
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setBrandGuideOpen(true)} variant="outline">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analysera befintlig webbplats
                  </Button>
                </CardContent>
              </Card>

              {/* Custom Themes */}
              {customThemes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Egna teman</CardTitle>
                    <CardDescription>Teman du har sparat från Brand Guide Assistant</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {customThemes.map((theme) => {
                        const colors = getThemePreviewColors(theme.settings);
                        return (
                          <div
                            key={theme.id}
                            className="relative p-4 rounded-lg border-2 hover:border-primary/50 transition-all group"
                          >
                            <button
                              onClick={() => applyCustomTheme(theme)}
                              className="text-left w-full"
                            >
                              <div className="flex items-start gap-4">
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
                                  <div className="flex gap-2 mt-2">
                                    {theme.settings.headingFont && (
                                      <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                        {theme.settings.headingFont}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleDeleteCustomTheme(theme.id)}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Predefined Themes */}
              <Card>
                <CardHeader>
                  <CardTitle>Fördefinierade teman</CardTitle>
                  <CardDescription>Välj ett tema som utgångspunkt, sedan kan du finjustera i de andra flikarna</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {DESIGN_THEMES.map((theme) => {
                      const colors = getThemePreviewColors(theme.settings);
                      return (
                        <button
                          key={theme.id}
                          onClick={() => applyTheme(theme.id)}
                          className="text-left p-4 rounded-lg border-2 hover:border-primary/50 transition-all group"
                        >
                          <div className="flex items-start gap-4">
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
            </div>
          </TabsContent>

          {/* Identity */}
          <TabsContent value="identity">
            <div className="space-y-6">
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
                  
                  <div className="space-y-2">
                    <Label>Slogan / tagline</Label>
                    <Input
                      value={settings.brandTagline || ''}
                      onChange={(e) => updateField('brandTagline', e.target.value)}
                      placeholder="T.ex. Kvalitetsvård med patienten i fokus"
                    />
                    <p className="text-xs text-muted-foreground">Visas i footern under organisationsnamnet</p>
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

              {/* Header Display Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Header-visning</CardTitle>
                  <CardDescription>Kontrollera hur logo och namn visas i den publika headern</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Visa logo i header</Label>
                        <p className="text-xs text-muted-foreground">Visar logotypen om en är uppladdad</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.showLogoInHeader !== false}
                        onChange={(e) => updateField('showLogoInHeader', e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Visa organisationsnamn bredvid logo</Label>
                        <p className="text-xs text-muted-foreground">Visar namnet även när logon visas</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.showNameWithLogo === true}
                        onChange={(e) => updateField('showNameWithLogo', e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Logostorlek</Label>
                    <Select
                      value={settings.headerLogoSize || 'md'}
                      onValueChange={(value) => updateField('headerLogoSize', value as 'sm' | 'md' | 'lg')}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sm">Liten</SelectItem>
                        <SelectItem value="md">Medium</SelectItem>
                        <SelectItem value="lg">Stor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Preview */}
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Förhandsvisning</Label>
                    <div className="border rounded-lg p-4 bg-card">
                      <div className="flex items-center gap-3">
                        {(() => {
                          const showLogo = settings.showLogoInHeader !== false;
                          const showName = settings.showNameWithLogo === true;
                          const logoSize = settings.headerLogoSize || 'md';
                          const hasLogo = !!settings.logo;
                          const orgName = settings.organizationName || 'Organisation';
                          
                          const sizeClasses = {
                            sm: 'h-8 max-w-[160px]',
                            md: 'h-10 max-w-[200px]',
                            lg: 'h-12 max-w-[240px]',
                          };
                          
                          const iconSizes = {
                            sm: 'h-8 w-8 text-lg',
                            md: 'h-10 w-10 text-xl',
                            lg: 'h-12 w-12 text-2xl',
                          };

                          if (showLogo && hasLogo) {
                            return (
                              <>
                                <img 
                                  src={settings.logo} 
                                  alt={orgName} 
                                  className={`${sizeClasses[logoSize]} object-contain`}
                                />
                                {showName && (
                                  <span className="font-serif font-bold text-xl">{orgName}</span>
                                )}
                              </>
                            );
                          }
                          
                          return (
                            <>
                              <div className={`rounded-lg bg-primary flex items-center justify-center ${iconSizes[logoSize]}`}>
                                <span className="text-primary-foreground font-serif font-bold">
                                  {orgName.charAt(0)}
                                </span>
                              </div>
                              <span className="font-serif font-bold text-xl">{orgName}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
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
            <div className="space-y-6">
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

                  <div className="space-y-2">
                    <Label>Hero-bildernas overlay</Label>
                    <Select
                      value={settings.heroOverlayOpacity || 'medium'}
                      onValueChange={(value) => updateField('heroOverlayOpacity', value as BrandingSettings['heroOverlayOpacity'])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ingen dämpning (full bild)</SelectItem>
                        <SelectItem value="light">Lätt dämpning</SelectItem>
                        <SelectItem value="medium">Medium dämpning (standard)</SelectItem>
                        <SelectItem value="strong">Stark dämpning</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Hur mycket bakgrundsbilden i hero-block dämpas av primary-färgen</p>
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

              {/* Theme Toggle Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Tema-växling</CardTitle>
                  <CardDescription>Låt besökare växla mellan ljust och mörkt tema</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Visa tema-toggle</Label>
                      <p className="text-sm text-muted-foreground">
                        Visar en knapp i navigationen där besökare kan växla mellan ljust, mörkt och systemtema
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {settings.allowThemeToggle !== false ? 'På' : 'Av'}
                      </span>
                      <Button
                        variant={settings.allowThemeToggle !== false ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateField('allowThemeToggle', settings.allowThemeToggle !== false ? false : true)}
                      >
                        {settings.allowThemeToggle !== false ? 'Aktiverad' : 'Inaktiverad'}
                      </Button>
                    </div>
                  </div>
                  {settings.allowThemeToggle === false && (
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                      När tema-toggle är inaktiverad visas webbplatsen alltid i ljust tema för besökare.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <BrandGuideDialog
          open={brandGuideOpen}
          onOpenChange={setBrandGuideOpen}
          onApplyBranding={handleApplyBranding}
          onSaveAsTheme={handleSaveAsTheme}
        />
      </div>
    </AdminLayout>
  );
}
