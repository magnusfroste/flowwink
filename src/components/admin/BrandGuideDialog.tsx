import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { analyzeBranding, type AnalyzedBranding } from '@/lib/branding-analyzer';
import type { BrandingSettings } from '@/hooks/useSiteSettings';
import { Loader2, Globe, ArrowRight, Check, Sparkles, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BrandGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyBranding: (settings: Partial<BrandingSettings>) => void;
  onSaveAsTheme: (name: string, settings: Partial<BrandingSettings>) => void;
}

export function BrandGuideDialog({ 
  open, 
  onOpenChange, 
  onApplyBranding,
  onSaveAsTheme,
}: BrandGuideDialogProps) {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzedBranding | null>(null);
  const [showSaveTheme, setShowSaveTheme] = useState(false);
  const [themeName, setThemeName] = useState('');

  const handleAnalyze = async () => {
    if (!url.trim()) return;

    setIsAnalyzing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: { url: url.trim() },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Kunde inte analysera webbplatsen');
      }

      const analyzed = analyzeBranding(data.branding);
      setResult(analyzed);
      
      toast({
        title: 'Analys klar',
        description: 'Varumärkesprofilen har extraherats från webbplatsen.',
      });
    } catch (error) {
      console.error('Brand analysis error:', error);
      toast({
        title: 'Fel vid analys',
        description: error instanceof Error ? error.message : 'Kunde inte analysera webbplatsen',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApply = () => {
    if (result?.mapped) {
      onApplyBranding(result.mapped);
      toast({
        title: 'Varumärkesprofil applicerad',
        description: 'De extraherade inställningarna har applicerats.',
      });
    }
  };

  const handleSaveTheme = () => {
    if (result?.mapped && themeName.trim()) {
      onSaveAsTheme(themeName.trim(), result.mapped);
      setShowSaveTheme(false);
      setThemeName('');
      onOpenChange(false);
      toast({
        title: 'Tema sparat',
        description: `"${themeName}" har sparats som ett eget tema.`,
      });
    }
  };

  const handleClose = () => {
    setUrl('');
    setResult(null);
    setShowSaveTheme(false);
    setThemeName('');
    onOpenChange(false);
  };

  // Helper to convert HSL to display color
  const hslToHex = (hsl: string): string => {
    if (!hsl) return '#888888';
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Brand Guide Assistant
          </DialogTitle>
          <DialogDescription>
            Analysera en befintlig webbplats och extrahera dess varumärkesprofil
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* URL Input */}
          <div className="space-y-2">
            <Label>Webbplatsens URL</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="pl-10"
                  disabled={isAnalyzing}
                />
              </div>
              <Button onClick={handleAnalyze} disabled={!url.trim() || isAnalyzing}>
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyserar...
                  </>
                ) : (
                  'Analysera'
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ange URL:en till webbplatsen vars varumärkesprofil du vill extrahera
            </p>
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-6 pt-4 border-t">
              <h3 className="font-medium">Extraherat resultat</h3>
              
              {/* Colors */}
              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground">Färger</Label>
                <div className="grid grid-cols-3 gap-4">
                  {result.mapped.primaryColor && (
                    <div className="space-y-1">
                      <div 
                        className="h-12 rounded-lg border"
                        style={{ backgroundColor: hslToHex(result.mapped.primaryColor) }}
                      />
                      <p className="text-xs text-center">Primär</p>
                    </div>
                  )}
                  {result.mapped.secondaryColor && (
                    <div className="space-y-1">
                      <div 
                        className="h-12 rounded-lg border"
                        style={{ backgroundColor: hslToHex(result.mapped.secondaryColor) }}
                      />
                      <p className="text-xs text-center">Sekundär</p>
                    </div>
                  )}
                  {result.mapped.accentColor && (
                    <div className="space-y-1">
                      <div 
                        className="h-12 rounded-lg border"
                        style={{ backgroundColor: hslToHex(result.mapped.accentColor) }}
                      />
                      <p className="text-xs text-center">Accent</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Typography */}
              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground">Typsnitt</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Rubriker</p>
                    <p className="font-medium">{result.mapped.headingFont || 'Ej identifierat'}</p>
                    {result.extracted.headingFont && result.extracted.headingFont !== result.mapped.headingFont && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Original: {result.extracted.headingFont}
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Brödtext</p>
                    <p className="font-medium">{result.mapped.bodyFont || 'Ej identifierat'}</p>
                    {result.extracted.bodyFont && result.extracted.bodyFont !== result.mapped.bodyFont && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Original: {result.extracted.bodyFont}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Logo & Favicon */}
              {(result.mapped.logo || result.mapped.favicon) && (
                <div className="space-y-3">
                  <Label className="text-sm text-muted-foreground">Bilder</Label>
                  <div className="flex gap-4">
                    {result.mapped.logo && (
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-2">Logo</p>
                        <img 
                          src={result.mapped.logo} 
                          alt="Logo" 
                          className="h-10 max-w-32 object-contain"
                        />
                      </div>
                    )}
                    {result.mapped.favicon && (
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-2">Favicon</p>
                        <img 
                          src={result.mapped.favicon} 
                          alt="Favicon" 
                          className="h-8 w-8 object-contain"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Appearance */}
              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground">Utseende</Label>
                <div className="flex gap-2">
                  {result.mapped.borderRadius && (
                    <span className="text-xs bg-muted px-2 py-1 rounded">
                      Hörnradie: {result.mapped.borderRadius}
                    </span>
                  )}
                  {result.mapped.shadowIntensity && (
                    <span className="text-xs bg-muted px-2 py-1 rounded">
                      Skuggor: {result.mapped.shadowIntensity}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                <Button onClick={handleApply} className="flex-1">
                  <Check className="h-4 w-4 mr-2" />
                  Applicera på nuvarande tema
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowSaveTheme(true)}
                  className="flex-1"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Spara som eget tema
                </Button>
              </div>

              {/* Save as theme */}
              {showSaveTheme && (
                <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                  <Label>Temanamn</Label>
                  <div className="flex gap-2">
                    <Input
                      value={themeName}
                      onChange={(e) => setThemeName(e.target.value)}
                      placeholder="T.ex. Sophiahemmet Original"
                    />
                    <Button onClick={handleSaveTheme} disabled={!themeName.trim()}>
                      Spara
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
