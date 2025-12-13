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
  PerformanceSettings,
  FooterSectionId
} from '@/hooks/useSiteSettings';
import { Loader2, Save, Globe, Zap, Phone, ImageIcon, X, AlertTriangle, GripVertical } from 'lucide-react';
import { MediaLibraryPicker } from '@/components/admin/MediaLibraryPicker';
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
    facebook: '',
    instagram: '',
    linkedin: '',
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
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
