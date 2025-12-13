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
  useCustomScriptsSettings,
  useUpdateCustomScriptsSettings,
  useCookieBannerSettings,
  useUpdateCookieBannerSettings,
  FooterSettings,
  SeoSettings,
  PerformanceSettings,
  CustomScriptsSettings,
  CookieBannerSettings,
  FooterSectionId
} from '@/hooks/useSiteSettings';
import { Loader2, Save, Globe, Zap, Phone, ImageIcon, X, AlertTriangle, GripVertical, Code, CheckCircle2, Circle, Cookie } from 'lucide-react';
import { MediaLibraryPicker } from '@/components/admin/MediaLibraryPicker';
import { CodeEditor } from '@/components/admin/CodeEditor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SECTION_LABELS: Record<FooterSectionId, { label: string; description: string }> = {
  brand: { label: 'Varumärke & logo', description: 'Organisationsnamn och tagline' },
  quickLinks: { label: 'Snabblänkar', description: 'Länkar till publicerade sidor' },
  contact: { label: 'Kontaktuppgifter', description: 'Telefon, e-post och adress' },
  hours: { label: 'Öppettider', description: 'Vardags- och helgtider' },
};

interface SortableSectionItemProps {
  id: FooterSectionId;
  isVisible: boolean;
  onToggle: (checked: boolean) => void;
}

function SortableSectionItem({ id, isVisible, onToggle }: SortableSectionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const section = SECTION_LABELS[id];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 rounded-lg border bg-card ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div>
          <Label>{section.label}</Label>
          <p className="text-xs text-muted-foreground">{section.description}</p>
        </div>
      </div>
      <Switch
        checked={isVisible}
        onCheckedChange={onToggle}
      />
    </div>
  );
}

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
  const { data: customScriptsSettings, isLoading: scriptsLoading } = useCustomScriptsSettings();
  const { data: cookieBannerSettings, isLoading: cookieLoading } = useCookieBannerSettings();
  
  const updateFooter = useUpdateFooterSettings();
  const updateSeo = useUpdateSeoSettings();
  const updatePerformance = useUpdatePerformanceSettings();
  const updateScripts = useUpdateCustomScriptsSettings();
  const updateCookieBanner = useUpdateCookieBannerSettings();
  
  const [footerData, setFooterData] = useState<FooterSettings>({
    phone: '',
    email: '',
    address: '',
    postalCode: '',
    weekdayHours: '',
    weekendHours: '',
    facebook: '',
    instagram: '',
    linkedin: '',
    twitter: '',
    youtube: '',
    showBrand: true,
    showQuickLinks: true,
    showContact: true,
    showHours: true,
    sectionOrder: ['brand', 'quickLinks', 'contact', 'hours'],
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [seoData, setSeoData] = useState<SeoSettings>({
    siteTitle: '',
    titleTemplate: '%s',
    defaultDescription: '',
    ogImage: '',
    twitterHandle: '',
    googleSiteVerification: '',
    robotsIndex: true,
    robotsFollow: true,
    developmentMode: false,
  });

  const [performanceData, setPerformanceData] = useState<PerformanceSettings>({
    lazyLoadImages: true,
    prefetchLinks: true,
    minifyHtml: false,
    enableServiceWorker: false,
    imageCacheMaxAge: 31536000,
    cacheStaticAssets: true,
  });

  const [scriptsData, setScriptsData] = useState<CustomScriptsSettings>({
    headStart: '',
    headEnd: '',
    bodyStart: '',
    bodyEnd: '',
  });

  const [cookieData, setCookieData] = useState<CookieBannerSettings>({
    enabled: true,
    title: 'Vi använder cookies',
    description: 'Vi använder cookies för att förbättra din upplevelse på webbplatsen, analysera trafik och anpassa innehåll.',
    policyLinkText: 'Läs mer om vår integritetspolicy',
    policyLinkUrl: '/integritetspolicy',
    acceptButtonText: 'Acceptera alla',
    rejectButtonText: 'Endast nödvändiga',
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

  useEffect(() => {
    if (customScriptsSettings) setScriptsData(customScriptsSettings);
  }, [customScriptsSettings]);

  useEffect(() => {
    if (cookieBannerSettings) setCookieData(cookieBannerSettings);
  }, [cookieBannerSettings]);

  const isLoading = footerLoading || seoLoading || performanceLoading || scriptsLoading || cookieLoading;
  const isSaving = updateFooter.isPending || updateSeo.isPending || updatePerformance.isPending || updateScripts.isPending || updateCookieBanner.isPending;

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
          <TabsList className="grid w-full grid-cols-5 max-w-2xl">
            <TabsTrigger value="seo" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">SEO</span>
            </TabsTrigger>
            <TabsTrigger value="scripts" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              <span className="hidden sm:inline">Scripts</span>
            </TabsTrigger>
            <TabsTrigger value="cookies" className="flex items-center gap-2">
              <Cookie className="h-4 w-4" />
              <span className="hidden sm:inline">Cookies</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Prestanda</span>
            </TabsTrigger>
            <TabsTrigger value="footer" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span className="hidden sm:inline">Footer</span>
            </TabsTrigger>
          </TabsList>

          {/* SEO Tab */}
          <TabsContent value="seo" className="space-y-6">
            {seoData.developmentMode && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Utvecklingsläge aktivt</AlertTitle>
                <AlertDescription>
                  Alla sidor är dolda från sökmotorer (noindex, nofollow). Kom ihåg att inaktivera detta innan lansering.
                </AlertDescription>
              </Alert>
            )}
            
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

              <Card className={seoData.developmentMode ? 'border-destructive/50 bg-destructive/5' : ''}>
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    {seoData.developmentMode && <AlertTriangle className="h-4 w-4 text-destructive" />}
                    Utvecklingsläge
                  </CardTitle>
                  <CardDescription>Blockera alla sökmotorer under utveckling</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className={seoData.developmentMode ? 'text-destructive' : ''}>
                        Utvecklingsläge (blockera sökmotorer)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Sätter noindex och nofollow på ALLA sidor globalt
                      </p>
                    </div>
                    <Switch
                      checked={seoData.developmentMode}
                      onCheckedChange={(checked) => setSeoData(prev => ({ ...prev, developmentMode: checked }))}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Indexering</CardTitle>
                  <CardDescription>Styr hur sökmotorer indexerar webbplatsen (ignoreras i utvecklingsläge)</CardDescription>
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
                      disabled={seoData.developmentMode}
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
                      disabled={seoData.developmentMode}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Scripts Tab */}
          <TabsContent value="scripts" className="space-y-6">
            <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">Varning</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                Scripts som läggs till här körs på alla publika sidor. Felaktiga scripts kan påverka webbplatsens funktion och prestanda.
              </AlertDescription>
            </Alert>

            {/* Active Scripts Preview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-serif text-base">Aktiva scripts</CardTitle>
                <CardDescription>Översikt över script-injektioner på publika sidor</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: 'headStart', label: 'Head (start)', value: scriptsData.headStart },
                    { key: 'headEnd', label: 'Head (slut)', value: scriptsData.headEnd },
                    { key: 'bodyStart', label: 'Body (start)', value: scriptsData.bodyStart },
                    { key: 'bodyEnd', label: 'Body (slut)', value: scriptsData.bodyEnd },
                  ].map(({ key, label, value }) => {
                    const isActive = value && value.trim().length > 0;
                    const charCount = value?.length || 0;
                    return (
                      <div 
                        key={key}
                        className={`p-3 rounded-lg border ${isActive ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800' : 'bg-muted/30 border-border'}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {isActive ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className={`text-sm font-medium ${isActive ? 'text-emerald-800 dark:text-emerald-200' : 'text-muted-foreground'}`}>
                            {label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground ml-6">
                          {isActive ? `${charCount} tecken` : 'Inga scripts'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => updateScripts.mutate(scriptsData)} disabled={isSaving}>
                {updateScripts.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Spara script-inställningar
              </Button>
            </div>

            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Head Scripts</CardTitle>
                  <CardDescription>Scripts som läggs in i &lt;head&gt;-taggen</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Head (start)</Label>
                    <CodeEditor
                      value={scriptsData.headStart}
                      onChange={(value) => setScriptsData(prev => ({ ...prev, headStart: value }))}
                      placeholder="<!-- Google Tag Manager -->&#10;<script>...</script>"
                    />
                    <p className="text-xs text-muted-foreground">
                      Läggs in direkt efter &lt;head&gt;. Använd för kritiska scripts som måste laddas först.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Head (slut)</Label>
                    <CodeEditor
                      value={scriptsData.headEnd}
                      onChange={(value) => setScriptsData(prev => ({ ...prev, headEnd: value }))}
                      placeholder="<!-- Analytics, fonts -->&#10;<script>...</script>"
                    />
                    <p className="text-xs text-muted-foreground">
                      Läggs in före &lt;/head&gt;. Perfekt för analytics och externa fonts.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Body Scripts</CardTitle>
                  <CardDescription>Scripts som läggs in i &lt;body&gt;-taggen</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Body (start)</Label>
                    <CodeEditor
                      value={scriptsData.bodyStart}
                      onChange={(value) => setScriptsData(prev => ({ ...prev, bodyStart: value }))}
                      placeholder="<!-- GTM noscript, early loaders -->&#10;<noscript>...</noscript>"
                    />
                    <p className="text-xs text-muted-foreground">
                      Läggs in direkt efter &lt;body&gt;. Använd för noscript-fallbacks och tidiga laddare.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Body (slut)</Label>
                    <CodeEditor
                      value={scriptsData.bodyEnd}
                      onChange={(value) => setScriptsData(prev => ({ ...prev, bodyEnd: value }))}
                      placeholder="<!-- Chat widgets, deferred scripts -->&#10;<script>...</script>"
                    />
                    <p className="text-xs text-muted-foreground">
                      Läggs in före &lt;/body&gt;. Perfekt för chat-widgets, tracking och deferred scripts.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif text-sm">Vanliga användningsfall</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <strong>Google Analytics / Tag Manager</strong> – Head (start)</li>
                    <li>• <strong>Cookie-consent</strong> (CookieBot, OneTrust) – Head (start)</li>
                    <li>• <strong>Facebook Pixel</strong> – Head (slut)</li>
                    <li>• <strong>Chat-widgets</strong> (Intercom, Crisp, Zendesk) – Body (slut)</li>
                    <li>• <strong>GTM noscript</strong> – Body (start)</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Cookies Tab */}
          <TabsContent value="cookies" className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={() => updateCookieBanner.mutate(cookieData)} disabled={isSaving}>
                {updateCookieBanner.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Spara cookie-inställningar
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Cookie-banner</CardTitle>
                <CardDescription>Anpassa cookie-samtyckesbannern för GDPR-efterlevnad</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                  <div>
                    <Label>Visa cookie-banner</Label>
                    <p className="text-sm text-muted-foreground">
                      Visar en banner för besökare att godkänna eller avvisa cookies
                    </p>
                  </div>
                  <Switch
                    checked={cookieData.enabled}
                    onCheckedChange={(checked) => setCookieData(prev => ({ ...prev, enabled: checked }))}
                  />
                </div>

                {cookieData.enabled && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="space-y-2">
                      <Label>Rubrik</Label>
                      <Input
                        value={cookieData.title}
                        onChange={(e) => setCookieData(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Vi använder cookies"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Beskrivning</Label>
                      <Textarea
                        value={cookieData.description}
                        onChange={(e) => setCookieData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Beskriv hur ni använder cookies..."
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Länktext (integritetspolicy)</Label>
                        <Input
                          value={cookieData.policyLinkText}
                          onChange={(e) => setCookieData(prev => ({ ...prev, policyLinkText: e.target.value }))}
                          placeholder="Läs mer om vår integritetspolicy"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Länk-URL</Label>
                        <Input
                          value={cookieData.policyLinkUrl}
                          onChange={(e) => setCookieData(prev => ({ ...prev, policyLinkUrl: e.target.value }))}
                          placeholder="/integritetspolicy"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Acceptera-knapp</Label>
                        <Input
                          value={cookieData.acceptButtonText}
                          onChange={(e) => setCookieData(prev => ({ ...prev, acceptButtonText: e.target.value }))}
                          placeholder="Acceptera alla"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Avvisa-knapp</Label>
                        <Input
                          value={cookieData.rejectButtonText}
                          onChange={(e) => setCookieData(prev => ({ ...prev, rejectButtonText: e.target.value }))}
                          placeholder="Endast nödvändiga"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preview */}
            {cookieData.enabled && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif text-base">Förhandsvisning</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 rounded-lg border bg-card">
                    <div className="space-y-2">
                      <h3 className="font-serif font-semibold">{cookieData.title || 'Vi använder cookies'}</h3>
                      <p className="text-sm text-muted-foreground">
                        {cookieData.description || 'Beskrivning av hur cookies används...'}
                      </p>
                      <a href="#" className="text-sm text-primary hover:underline inline-block">
                        {cookieData.policyLinkText || 'Läs mer'}
                      </a>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm">
                        {cookieData.rejectButtonText || 'Endast nödvändiga'}
                      </Button>
                      <Button size="sm">
                        {cookieData.acceptButtonText || 'Acceptera alla'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
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

            {/* Layout Section */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Layout & ordning</CardTitle>
                <CardDescription>Dra för att ändra ordning, växla för att visa/dölja</CardDescription>
              </CardHeader>
              <CardContent>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event: DragEndEvent) => {
                    const { active, over } = event;
                    if (over && active.id !== over.id) {
                      const currentOrder = footerData.sectionOrder || ['brand', 'quickLinks', 'contact', 'hours'];
                      const oldIndex = currentOrder.indexOf(active.id as FooterSectionId);
                      const newIndex = currentOrder.indexOf(over.id as FooterSectionId);
                      setFooterData(prev => ({
                        ...prev,
                        sectionOrder: arrayMove(currentOrder, oldIndex, newIndex),
                      }));
                    }
                  }}
                >
                  <SortableContext
                    items={footerData.sectionOrder || ['brand', 'quickLinks', 'contact', 'hours']}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {(footerData.sectionOrder || ['brand', 'quickLinks', 'contact', 'hours']).map((sectionId) => {
                        const visibilityKey = {
                          brand: 'showBrand',
                          quickLinks: 'showQuickLinks',
                          contact: 'showContact',
                          hours: 'showHours',
                        }[sectionId] as keyof FooterSettings;
                        
                        return (
                          <SortableSectionItem
                            key={sectionId}
                            id={sectionId}
                            isVisible={footerData[visibilityKey] !== false}
                            onToggle={(checked) => setFooterData(prev => ({ ...prev, [visibilityKey]: checked }))}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
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

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Öppettider</CardTitle>
                  <CardDescription>Tider som visas i footern</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Sociala medier</CardTitle>
                  <CardDescription>Länkar till sociala medier-profiler</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="facebook">Facebook</Label>
                      <Input
                        id="facebook"
                        value={footerData.facebook || ''}
                        onChange={(e) => setFooterData(prev => ({ ...prev, facebook: e.target.value }))}
                        placeholder="https://facebook.com/..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="instagram">Instagram</Label>
                      <Input
                        id="instagram"
                        value={footerData.instagram || ''}
                        onChange={(e) => setFooterData(prev => ({ ...prev, instagram: e.target.value }))}
                        placeholder="https://instagram.com/..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="linkedin">LinkedIn</Label>
                      <Input
                        id="linkedin"
                        value={footerData.linkedin || ''}
                        onChange={(e) => setFooterData(prev => ({ ...prev, linkedin: e.target.value }))}
                        placeholder="https://linkedin.com/company/..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="twitter">Twitter / X</Label>
                      <Input
                        id="twitter"
                        value={footerData.twitter || ''}
                        onChange={(e) => setFooterData(prev => ({ ...prev, twitter: e.target.value }))}
                        placeholder="https://x.com/..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="youtube">YouTube</Label>
                      <Input
                        id="youtube"
                        value={footerData.youtube || ''}
                        onChange={(e) => setFooterData(prev => ({ ...prev, youtube: e.target.value }))}
                        placeholder="https://youtube.com/@..."
                      />
                    </div>
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
