import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  useFooterSettings, 
  useUpdateFooterSettings, 
  useSeoSettings, 
  useUpdateSeoSettings,
  usePerformanceSettings,
  useUpdatePerformanceSettings,
  FooterSettings,
  SeoSettings,
  PerformanceSettings
} from '@/hooks/useSiteSettings';
import { Loader2, Save, Globe, Zap, Phone, ImageIcon, X } from 'lucide-react';
import { MediaLibraryPicker } from '@/components/admin/MediaLibraryPicker';

function OgImagePicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative">
          <img 
            src={value} 
            alt="OG Image preview" 
            className="w-full h-32 object-cover rounded-lg border"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6"
            onClick={() => onChange('')}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full h-24 flex flex-col gap-2"
          onClick={() => setShowPicker(true)}
        >
          <ImageIcon className="h-6 w-6" />
          <span>Välj bild</span>
        </Button>
      )}
      {value && (
        <Button variant="outline" size="sm" onClick={() => setShowPicker(true)}>
          Byt bild
        </Button>
      )}
      <MediaLibraryPicker
        open={showPicker}
        onOpenChange={setShowPicker}
        onSelect={(url) => {
          onChange(url);
          setShowPicker(false);
        }}
      />
    </div>
  );
}

export default function SiteSettingsPage() {
  const { data: footerSettings, isLoading: footerLoading } = useFooterSettings();
  const { data: seoSettings, isLoading: seoLoading } = useSeoSettings();
  const { data: performanceSettings, isLoading: performanceLoading } = usePerformanceSettings();
  
  const updateFooter = useUpdateFooterSettings();
  const updateSeo = useUpdateSeoSettings();
  const updatePerformance = useUpdatePerformanceSettings();
  
  const [footerData, setFooterData] = useState<FooterSettings>({
    phone: '',
    email: '',
    address: '',
    postalCode: '',
    weekdayHours: '',
    weekendHours: '',
    brandName: '',
    brandTagline: '',
  });

  const [seoData, setSeoData] = useState<SeoSettings>({
    siteTitle: '',
    titleTemplate: '%s',
    defaultDescription: '',
    ogImage: '',
    twitterHandle: '',
    googleSiteVerification: '',
    robotsIndex: true,
    robotsFollow: true,
  });

  const [performanceData, setPerformanceData] = useState<PerformanceSettings>({
    lazyLoadImages: true,
    prefetchLinks: true,
    minifyHtml: false,
    enableServiceWorker: false,
    imageCacheMaxAge: 31536000,
    cacheStaticAssets: true,
  });

  useEffect(() => {
    if (footerSettings) setFooterData(footerSettings);
  }, [footerSettings]);

  useEffect(() => {
    if (seoSettings) setSeoData(seoSettings);
  }, [seoSettings]);

  useEffect(() => {
    if (performanceSettings) setPerformanceData(performanceSettings);
  }, [performanceSettings]);

  const isLoading = footerLoading || seoLoading || performanceLoading;
  const isSaving = updateFooter.isPending || updateSeo.isPending || updatePerformance.isPending;

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
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Webbplatsinställningar</h1>
          <p className="text-muted-foreground mt-1">Hantera SEO, prestanda och kontaktinformation</p>
        </div>

        <Tabs defaultValue="seo" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="seo" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              SEO
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Prestanda
            </TabsTrigger>
            <TabsTrigger value="footer" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Footer
            </TabsTrigger>
          </TabsList>

          {/* SEO Tab */}
          <TabsContent value="seo" className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={() => updateSeo.mutate(seoData)} disabled={isSaving}>
                {updateSeo.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Spara SEO-inställningar
              </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Grundläggande SEO</CardTitle>
                  <CardDescription>Titel och beskrivning för sökmotorer</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="siteTitle">Webbplatsens namn</Label>
                    <Input
                      id="siteTitle"
                      value={seoData.siteTitle}
                      onChange={(e) => setSeoData(prev => ({ ...prev, siteTitle: e.target.value }))}
                      placeholder="Sophiahemmet"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="titleTemplate">Titelmall</Label>
                    <Input
                      id="titleTemplate"
                      value={seoData.titleTemplate}
                      onChange={(e) => setSeoData(prev => ({ ...prev, titleTemplate: e.target.value }))}
                      placeholder="%s | Sophiahemmet"
                    />
                    <p className="text-xs text-muted-foreground">%s ersätts med sidans titel</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultDescription">Standardbeskrivning (meta description)</Label>
                    <Textarea
                      id="defaultDescription"
                      value={seoData.defaultDescription}
                      onChange={(e) => setSeoData(prev => ({ ...prev, defaultDescription: e.target.value }))}
                      placeholder="En kort beskrivning av webbplatsen..."
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">Max 160 tecken rekommenderas</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Sociala medier</CardTitle>
                  <CardDescription>Open Graph och Twitter Cards</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Standardbild för delning (OG Image)</Label>
                    <OgImagePicker
                      value={seoData.ogImage}
                      onChange={(url) => setSeoData(prev => ({ ...prev, ogImage: url }))}
                    />
                    <p className="text-xs text-muted-foreground">Rekommenderad storlek: 1200x630px</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twitterHandle">Twitter-konto</Label>
                    <Input
                      id="twitterHandle"
                      value={seoData.twitterHandle}
                      onChange={(e) => setSeoData(prev => ({ ...prev, twitterHandle: e.target.value }))}
                      placeholder="@sophiahemmet"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Verifiering</CardTitle>
                  <CardDescription>Verifieringskoder för sökmotorer</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="googleSiteVerification">Google Search Console</Label>
                    <Input
                      id="googleSiteVerification"
                      value={seoData.googleSiteVerification}
                      onChange={(e) => setSeoData(prev => ({ ...prev, googleSiteVerification: e.target.value }))}
                      placeholder="Verifieringskod"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Indexering</CardTitle>
                  <CardDescription>Styr hur sökmotorer indexerar webbplatsen</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Tillåt indexering</Label>
                      <p className="text-xs text-muted-foreground">Låt sökmotorer indexera sidor</p>
                    </div>
                    <Switch
                      checked={seoData.robotsIndex}
                      onCheckedChange={(checked) => setSeoData(prev => ({ ...prev, robotsIndex: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Följ länkar</Label>
                      <p className="text-xs text-muted-foreground">Låt sökmotorer följa länkar</p>
                    </div>
                    <Switch
                      checked={seoData.robotsFollow}
                      onCheckedChange={(checked) => setSeoData(prev => ({ ...prev, robotsFollow: checked }))}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={() => updatePerformance.mutate(performanceData)} disabled={isSaving}>
                {updatePerformance.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Spara prestandainställningar
              </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Bildoptimering</CardTitle>
                  <CardDescription>Inställningar för bildladdning och caching</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Lazy loading för bilder</Label>
                      <p className="text-xs text-muted-foreground">Ladda bilder först när de syns</p>
                    </div>
                    <Switch
                      checked={performanceData.lazyLoadImages}
                      onCheckedChange={(checked) => setPerformanceData(prev => ({ ...prev, lazyLoadImages: checked }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imageCacheMaxAge">Bildcache (sekunder)</Label>
                    <Input
                      id="imageCacheMaxAge"
                      type="number"
                      value={performanceData.imageCacheMaxAge}
                      onChange={(e) => setPerformanceData(prev => ({ ...prev, imageCacheMaxAge: parseInt(e.target.value) || 0 }))}
                    />
                    <p className="text-xs text-muted-foreground">31536000 = 1 år</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Laddningsoptimering</CardTitle>
                  <CardDescription>Snabbare sidladdning</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Prefetch länkar</Label>
                      <p className="text-xs text-muted-foreground">Förladda länkar vid hover</p>
                    </div>
                    <Switch
                      checked={performanceData.prefetchLinks}
                      onCheckedChange={(checked) => setPerformanceData(prev => ({ ...prev, prefetchLinks: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Cache statiska resurser</Label>
                      <p className="text-xs text-muted-foreground">Aktivera webbläsarcache</p>
                    </div>
                    <Switch
                      checked={performanceData.cacheStaticAssets}
                      onCheckedChange={(checked) => setPerformanceData(prev => ({ ...prev, cacheStaticAssets: checked }))}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="font-serif">Avancerat</CardTitle>
                  <CardDescription>Avancerade prestandainställningar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Service Worker</Label>
                      <p className="text-xs text-muted-foreground">Möjliggör offline-funktionalitet (experimentellt)</p>
                    </div>
                    <Switch
                      checked={performanceData.enableServiceWorker}
                      onCheckedChange={(checked) => setPerformanceData(prev => ({ ...prev, enableServiceWorker: checked }))}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Footer Tab */}
          <TabsContent value="footer" className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={() => updateFooter.mutate(footerData)} disabled={isSaving}>
                {updateFooter.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Spara footer-inställningar
              </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Varumärke</CardTitle>
                  <CardDescription>Namn och beskrivning som visas i footern</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="brandName">Organisationsnamn</Label>
                    <Input
                      id="brandName"
                      value={footerData.brandName}
                      onChange={(e) => setFooterData(prev => ({ ...prev, brandName: e.target.value }))}
                      placeholder="Sophiahemmet"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brandTagline">Beskrivning</Label>
                    <Textarea
                      id="brandTagline"
                      value={footerData.brandTagline}
                      onChange={(e) => setFooterData(prev => ({ ...prev, brandTagline: e.target.value }))}
                      placeholder="Kvalitetsvård med patienten i fokus..."
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Kontaktuppgifter</CardTitle>
                  <CardDescription>Telefon, e-post och adress</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefonnummer</Label>
                    <Input
                      id="phone"
                      value={footerData.phone}
                      onChange={(e) => setFooterData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="08-688 40 00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-postadress</Label>
                    <Input
                      id="email"
                      type="email"
                      value={footerData.email}
                      onChange={(e) => setFooterData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="info@sophiahemmet.se"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Gatuadress</Label>
                    <Input
                      id="address"
                      value={footerData.address}
                      onChange={(e) => setFooterData(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="Valhallavägen 91"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postnummer och ort</Label>
                    <Input
                      id="postalCode"
                      value={footerData.postalCode}
                      onChange={(e) => setFooterData(prev => ({ ...prev, postalCode: e.target.value }))}
                      placeholder="114 28 Stockholm"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="font-serif">Öppettider</CardTitle>
                  <CardDescription>Tider som visas i footern</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="weekdayHours">Vardagar (mån–fre)</Label>
                    <Input
                      id="weekdayHours"
                      value={footerData.weekdayHours}
                      onChange={(e) => setFooterData(prev => ({ ...prev, weekdayHours: e.target.value }))}
                      placeholder="08:00–17:00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weekendHours">Helger (lör–sön)</Label>
                    <Input
                      id="weekendHours"
                      value={footerData.weekendHours}
                      onChange={(e) => setFooterData(prev => ({ ...prev, weekendHours: e.target.value }))}
                      placeholder="Stängt"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
