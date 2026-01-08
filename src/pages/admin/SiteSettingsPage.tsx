import { useState, useEffect, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  useSeoSettings, 
  useUpdateSeoSettings,
  usePerformanceSettings,
  useUpdatePerformanceSettings,
  useCustomScriptsSettings,
  useUpdateCustomScriptsSettings,
  useCookieBannerSettings,
  useUpdateCookieBannerSettings,
  useMaintenanceSettings,
  useUpdateMaintenanceSettings,
  useGeneralSettings,
  useUpdateGeneralSettings,
  useAeoSettings,
  useUpdateAeoSettings,
  SeoSettings,
  PerformanceSettings,
  CustomScriptsSettings,
  CookieBannerSettings,
  MaintenanceSettings,
  GeneralSettings,
  AeoSettings,
  SchemaOrgType,
} from '@/hooks/useSiteSettings';
import { usePages } from '@/hooks/usePages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Globe, Zap, ImageIcon, X, AlertTriangle, Code, Cookie, Info, Wrench, Home, Search, Lock, Clock, CheckCircle2, Circle, Bot, FileText, Building2, ExternalLink } from 'lucide-react';
import { MediaLibraryPicker } from '@/components/admin/MediaLibraryPicker';
import { CodeEditor } from '@/components/admin/CodeEditor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useUnsavedChanges, UnsavedChangesDialog } from '@/hooks/useUnsavedChanges';


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
          <span>Select image</span>
        </Button>
      )}
      {value && (
        <Button variant="outline" size="sm" onClick={() => setShowPicker(true)}>
          Change image
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
  const { data: seoSettings, isLoading: seoLoading } = useSeoSettings();
  const { data: performanceSettings, isLoading: performanceLoading } = usePerformanceSettings();
  const { data: customScriptsSettings, isLoading: scriptsLoading } = useCustomScriptsSettings();
  const { data: cookieBannerSettings, isLoading: cookieLoading } = useCookieBannerSettings();
  const { data: maintenanceSettings, isLoading: maintenanceLoading } = useMaintenanceSettings();
  const { data: generalSettings, isLoading: generalLoading } = useGeneralSettings();
  const { data: aeoSettings, isLoading: aeoLoading } = useAeoSettings();
  const { data: allPages } = usePages();
  
  const updateSeo = useUpdateSeoSettings();
  const updatePerformance = useUpdatePerformanceSettings();
  const updateScripts = useUpdateCustomScriptsSettings();
  const updateCookieBanner = useUpdateCookieBannerSettings();
  const updateMaintenance = useUpdateMaintenanceSettings();
  const updateGeneral = useUpdateGeneralSettings();
  const updateAeo = useUpdateAeoSettings();

  const [generalData, setGeneralData] = useState<GeneralSettings>({
    homepageSlug: 'hem',
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
    developmentMode: false,
    requireAuthInDevMode: false,
  });

  const [performanceData, setPerformanceData] = useState<PerformanceSettings>({
    lazyLoadImages: true,
    prefetchLinks: true,
    minifyHtml: false,
    enableServiceWorker: false,
    imageCacheMaxAge: 31536000,
    cacheStaticAssets: true,
    enableEdgeCaching: false,
    edgeCacheTtlMinutes: 5,
  });

  const [scriptsData, setScriptsData] = useState<CustomScriptsSettings>({
    headStart: '',
    headEnd: '',
    bodyStart: '',
    bodyEnd: '',
  });

  const [cookieData, setCookieData] = useState<CookieBannerSettings>({
    enabled: true,
    title: 'We use cookies',
    description: 'We use cookies to improve your experience on the website, analyze traffic and personalize content.',
    policyLinkText: 'Read more about our privacy policy',
    policyLinkUrl: '/privacy-policy',
    acceptButtonText: 'Accept all',
    rejectButtonText: 'Essential only',
  });

  const [maintenanceData, setMaintenanceData] = useState<MaintenanceSettings>({
    enabled: false,
    title: 'Website under maintenance',
    message: 'We are performing scheduled maintenance. The website will be available again shortly.',
    expectedEndTime: '',
  });

  const [aeoData, setAeoData] = useState<AeoSettings>({
    enabled: false,
    organizationName: '',
    shortDescription: '',
    contactEmail: '',
    primaryLanguage: 'sv',
    llmsTxtEnabled: true,
    llmsTxtExcludedSlugs: [],
    llmsFullTxtEnabled: true,
    maxWordsPerPage: 2000,
    schemaOrgEnabled: true,
    schemaOrgType: 'Organization',
    schemaOrgLogo: '',
    socialProfiles: [],
    businessHours: [],
    priceRange: '',
    faqSchemaEnabled: true,
    articleSchemaEnabled: true,
    sitemapEnabled: true,
    sitemapChangefreq: 'weekly',
    sitemapPriority: 0.5,
  });

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

  useEffect(() => {
    if (maintenanceSettings) setMaintenanceData(maintenanceSettings);
  }, [maintenanceSettings]);

  useEffect(() => {
    if (generalSettings) setGeneralData(generalSettings);
  }, [generalSettings]);

  useEffect(() => {
    if (aeoSettings) setAeoData(aeoSettings);
  }, [aeoSettings]);

  const isLoading = seoLoading || performanceLoading || scriptsLoading || cookieLoading || maintenanceLoading || generalLoading || aeoLoading;
  const isSaving = updateSeo.isPending || updatePerformance.isPending || updateScripts.isPending || updateCookieBanner.isPending || updateMaintenance.isPending || updateGeneral.isPending || updateAeo.isPending;

  // Track unsaved changes
  const hasChanges = useMemo(() => {
    if (!seoSettings || !performanceSettings || !customScriptsSettings || !cookieBannerSettings || !maintenanceSettings || !generalSettings || !aeoSettings) return false;
    return (
      JSON.stringify(seoData) !== JSON.stringify(seoSettings) ||
      JSON.stringify(performanceData) !== JSON.stringify(performanceSettings) ||
      JSON.stringify(scriptsData) !== JSON.stringify(customScriptsSettings) ||
      JSON.stringify(cookieData) !== JSON.stringify(cookieBannerSettings) ||
      JSON.stringify(maintenanceData) !== JSON.stringify(maintenanceSettings) ||
      JSON.stringify(generalData) !== JSON.stringify(generalSettings) ||
      JSON.stringify(aeoData) !== JSON.stringify(aeoSettings)
    );
  }, [seoData, performanceData, scriptsData, cookieData, maintenanceData, generalData, aeoData, seoSettings, performanceSettings, customScriptsSettings, cookieBannerSettings, maintenanceSettings, generalSettings, aeoSettings]);

  const { blocker } = useUnsavedChanges({ hasChanges });

  const handleSaveAll = async () => {
    await Promise.all([
      updateGeneral.mutateAsync(generalData),
      updateSeo.mutateAsync(seoData),
      updateMaintenance.mutateAsync(maintenanceData),
      updateScripts.mutateAsync(scriptsData),
      updateCookieBanner.mutateAsync(cookieData),
      updatePerformance.mutateAsync(performanceData),
      updateAeo.mutateAsync(aeoData),
    ]);
  };

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
        <AdminPageHeader 
          title="Site Settings"
          description="Manage SEO, performance and contact information"
        >
          <Button onClick={handleSaveAll} disabled={isSaving} className="relative">
            {hasChanges && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive" />}
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save changes
          </Button>
        </AdminPageHeader>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7 max-w-5xl">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="seo" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">SEO</span>
            </TabsTrigger>
            <TabsTrigger value="aeo" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">AEO</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              <span className="hidden sm:inline">Maintenance</span>
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
              <span className="hidden sm:inline">Performance</span>
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Homepage</CardTitle>
                <CardDescription>Choose which page is displayed when visitors go to the site's root URL (/)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="homepageSlug">Homepage</Label>
                  <Select
                    value={generalData.homepageSlug}
                    onValueChange={(value) => setGeneralData(prev => ({ ...prev, homepageSlug: value }))}
                  >
                    <SelectTrigger id="homepageSlug" className="w-full max-w-md">
                      <SelectValue placeholder="Select homepage" />
                    </SelectTrigger>
                    <SelectContent>
                      {allPages?.map((page) => (
                        <SelectItem key={page.id} value={page.slug}>
                          {page.title} ({page.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The selected page is displayed when visitors open the website. The page must be published.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SEO Tab */}
          <TabsContent value="seo" className="space-y-6">
            {seoData.developmentMode && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Development mode active</AlertTitle>
                <AlertDescription>
                  All pages are hidden from search engines (noindex, nofollow). Remember to disable this before launch.
                </AlertDescription>
              </Alert>
            )}
            

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Basic SEO</CardTitle>
                  <CardDescription>Title and description for search engines</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="siteTitle">Site name</Label>
                    <Input
                      id="siteTitle"
                      value={seoData.siteTitle}
                      onChange={(e) => setSeoData(prev => ({ ...prev, siteTitle: e.target.value }))}
                      placeholder="My Organization"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="titleTemplate">Title template</Label>
                    <Input
                      id="titleTemplate"
                      value={seoData.titleTemplate}
                      onChange={(e) => setSeoData(prev => ({ ...prev, titleTemplate: e.target.value }))}
                      placeholder="%s | My Organization"
                    />
                    <p className="text-xs text-muted-foreground">%s is replaced with the page title</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultDescription">Default description (meta description)</Label>
                    <Textarea
                      id="defaultDescription"
                      value={seoData.defaultDescription}
                      onChange={(e) => setSeoData(prev => ({ ...prev, defaultDescription: e.target.value }))}
                      placeholder="A short description of the website..."
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">Max 160 characters recommended</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Social Media</CardTitle>
                  <CardDescription>Open Graph and Twitter Cards</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Default sharing image (OG Image)</Label>
                    <OgImagePicker
                      value={seoData.ogImage}
                      onChange={(url) => setSeoData(prev => ({ ...prev, ogImage: url }))}
                    />
                    <p className="text-xs text-muted-foreground">Recommended size: 1200x630px</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twitterHandle">Twitter handle</Label>
                    <Input
                      id="twitterHandle"
                      value={seoData.twitterHandle}
                      onChange={(e) => setSeoData(prev => ({ ...prev, twitterHandle: e.target.value }))}
                      placeholder="@myorganization"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Verification</CardTitle>
                  <CardDescription>Verification codes for search engines</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="googleSiteVerification">Google Search Console</Label>
                    <Input
                      id="googleSiteVerification"
                      value={seoData.googleSiteVerification}
                      onChange={(e) => setSeoData(prev => ({ ...prev, googleSiteVerification: e.target.value }))}
                      placeholder="Verification code"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className={seoData.developmentMode ? 'border-destructive/50 bg-destructive/5' : ''}>
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    {seoData.developmentMode && <AlertTriangle className="h-4 w-4 text-destructive" />}
                    Development Mode
                  </CardTitle>
                  <CardDescription>Block search engines and/or restrict access during development</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Info box explaining the difference */}
                  <Alert className="bg-muted/50 border-muted-foreground/20">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>Two levels of protection:</strong>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <Search className="h-3 w-3 shrink-0" />
                          <span><strong>Block search engines</strong> – Page is visible but not indexed</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Lock className="h-3 w-3 shrink-0" />
                          <span><strong>Require login</strong> – Complete block for non-logged in users</span>
                        </li>
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <Search className={`h-5 w-5 ${seoData.developmentMode ? 'text-destructive' : 'text-muted-foreground'}`} />
                      <div>
                        <Label className={seoData.developmentMode ? 'text-destructive' : ''}>
                          Block search engines (noindex)
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Sets noindex and nofollow on all pages
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={seoData.developmentMode}
                      onCheckedChange={(checked) => setSeoData(prev => ({ ...prev, developmentMode: checked }))}
                    />
                  </div>

                  <div className={`flex items-center justify-between p-3 rounded-lg border ${!seoData.developmentMode ? 'opacity-50 bg-muted/30' : 'bg-card'}`}>
                    <div className="flex items-center gap-3">
                      <Lock className={`h-5 w-5 ${seoData.requireAuthInDevMode && seoData.developmentMode ? 'text-destructive' : 'text-muted-foreground'}`} />
                      <div>
                        <Label className={seoData.requireAuthInDevMode && seoData.developmentMode ? 'text-destructive' : (!seoData.developmentMode ? 'text-muted-foreground' : '')}>
                          Require login to view site
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Only logged in users can see the website
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={seoData.requireAuthInDevMode}
                      onCheckedChange={(checked) => setSeoData(prev => ({ ...prev, requireAuthInDevMode: checked }))}
                      disabled={!seoData.developmentMode}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Indexing</CardTitle>
                  <CardDescription>Control how search engines index the website (ignored in development mode)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Allow indexing</Label>
                      <p className="text-xs text-muted-foreground">Let search engines index pages</p>
                    </div>
                    <Switch
                      checked={seoData.robotsIndex}
                      onCheckedChange={(checked) => setSeoData(prev => ({ ...prev, robotsIndex: checked }))}
                      disabled={seoData.developmentMode}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Follow links</Label>
                      <p className="text-xs text-muted-foreground">Let search engines follow links</p>
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

          {/* AEO Tab */}
          <TabsContent value="aeo" className="space-y-6">
            {!aeoData.enabled && (
              <Alert className="border-muted-foreground/20 bg-muted/50">
                <Bot className="h-4 w-4" />
                <AlertTitle>Answer Engine Optimization</AlertTitle>
                <AlertDescription>
                  AEO optimizes your content for AI-powered search engines like Perplexity, ChatGPT, Google AI Overviews and Bing Copilot.
                  Enable AEO to generate llms.txt, Schema.org/JSON-LD and sitemap.xml.
                </AlertDescription>
              </Alert>
            )}

            {aeoData.enabled && (
              <Alert className="border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertTitle className="text-emerald-800 dark:text-emerald-200">AEO is enabled</AlertTitle>
                <AlertDescription className="text-emerald-700 dark:text-emerald-300">
                  Your website is now optimized for AI search engines. The following endpoints are available:
                  <div className="flex flex-wrap gap-2 mt-2">
                    {aeoData.llmsTxtEnabled && (
                      <Badge variant="secondary" className="gap-1">
                        <FileText className="h-3 w-3" />
                        /llms.txt
                      </Badge>
                    )}
                    {aeoData.llmsFullTxtEnabled && (
                      <Badge variant="secondary" className="gap-1">
                        <FileText className="h-3 w-3" />
                        /llms-full.txt
                      </Badge>
                    )}
                    {aeoData.sitemapEnabled && (
                      <Badge variant="secondary" className="gap-1">
                        <Globe className="h-3 w-3" />
                        /sitemap.xml
                      </Badge>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <Card className={aeoData.enabled ? 'border-emerald-500/30' : ''}>
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    AEO-inställningar
                  </CardTitle>
                  <CardDescription>Grundläggande inställningar för AI-optimering</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <Bot className={`h-5 w-5 ${aeoData.enabled ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                      <div>
                        <Label className={aeoData.enabled ? 'text-emerald-700 dark:text-emerald-300' : ''}>
                          Aktivera AEO
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Generera llms.txt och strukturerad data
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={aeoData.enabled}
                      onCheckedChange={(checked) => setAeoData(prev => ({ ...prev, enabled: checked }))}
                    />
                  </div>

                  {aeoData.enabled && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="aeoOrgName">Organisationsnamn</Label>
                        <Input
                          id="aeoOrgName"
                          value={aeoData.organizationName}
                          onChange={(e) => setAeoData(prev => ({ ...prev, organizationName: e.target.value }))}
                          placeholder="Min Organisation AB"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="aeoDescription">Kort beskrivning (för AI-agenter)</Label>
                        <Textarea
                          id="aeoDescription"
                          value={aeoData.shortDescription}
                          onChange={(e) => setAeoData(prev => ({ ...prev, shortDescription: e.target.value }))}
                          placeholder="En kort beskrivning av verksamheten som AI-agenter kan använda..."
                          rows={3}
                        />
                        <p className="text-xs text-muted-foreground">Max 200 tecken rekommenderas</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="aeoEmail">Kontakt-email</Label>
                        <Input
                          id="aeoEmail"
                          type="email"
                          value={aeoData.contactEmail}
                          onChange={(e) => setAeoData(prev => ({ ...prev, contactEmail: e.target.value }))}
                          placeholder="info@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="aeoLang">Primärt språk</Label>
                        <Select
                          value={aeoData.primaryLanguage}
                          onValueChange={(value) => setAeoData(prev => ({ ...prev, primaryLanguage: value }))}
                        >
                          <SelectTrigger id="aeoLang">
                            <SelectValue placeholder="Välj språk" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sv">Svenska</SelectItem>
                            <SelectItem value="en">Engelska</SelectItem>
                            <SelectItem value="no">Norska</SelectItem>
                            <SelectItem value="da">Danska</SelectItem>
                            <SelectItem value="fi">Finska</SelectItem>
                            <SelectItem value="de">Tyska</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {aeoData.enabled && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-serif flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        llms.txt
                      </CardTitle>
                      <CardDescription>
                        Standard for AI agents to understand your website
                        <a 
                          href="https://llmstxt.org" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 ml-2 text-primary hover:underline"
                        >
                          Läs mer <ExternalLink className="h-3 w-3" />
                        </a>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Generera /llms.txt</Label>
                          <p className="text-xs text-muted-foreground">Brief overview for AI agents</p>
                        </div>
                        <Switch
                          checked={aeoData.llmsTxtEnabled}
                          onCheckedChange={(checked) => setAeoData(prev => ({ ...prev, llmsTxtEnabled: checked }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Generera /llms-full.txt</Label>
                          <p className="text-xs text-muted-foreground">Full content in markdown</p>
                        </div>
                        <Switch
                          checked={aeoData.llmsFullTxtEnabled}
                          onCheckedChange={(checked) => setAeoData(prev => ({ ...prev, llmsFullTxtEnabled: checked }))}
                        />
                      </div>
                      {aeoData.llmsFullTxtEnabled && (
                        <div className="space-y-2 pt-2 border-t">
                          <Label htmlFor="maxWords">Max words per page</Label>
                          <Input
                            id="maxWords"
                            type="number"
                            min={500}
                            max={10000}
                            value={aeoData.maxWordsPerPage}
                            onChange={(e) => setAeoData(prev => ({ 
                              ...prev, 
                              maxWordsPerPage: Math.max(500, parseInt(e.target.value) || 2000) 
                            }))}
                          />
                          <p className="text-xs text-muted-foreground">Limits content amount per page in llms-full.txt</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="font-serif flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Schema.org / JSON-LD
                      </CardTitle>
                      <CardDescription>Strukturerad data för rich snippets och AI</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Aktivera Schema.org</Label>
                          <p className="text-xs text-muted-foreground">Lägg till JSON-LD på alla sidor</p>
                        </div>
                        <Switch
                          checked={aeoData.schemaOrgEnabled}
                          onCheckedChange={(checked) => setAeoData(prev => ({ ...prev, schemaOrgEnabled: checked }))}
                        />
                      </div>
                      
                      {aeoData.schemaOrgEnabled && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="schemaType">Organisationstyp</Label>
                            <Select
                              value={aeoData.schemaOrgType}
                              onValueChange={(value: SchemaOrgType) => setAeoData(prev => ({ ...prev, schemaOrgType: value }))}
                            >
                              <SelectTrigger id="schemaType">
                                <SelectValue placeholder="Välj typ" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Organization">Organisation</SelectItem>
                                <SelectItem value="LocalBusiness">Lokalt företag</SelectItem>
                                <SelectItem value="MedicalOrganization">Vårdorganisation</SelectItem>
                                <SelectItem value="EducationalOrganization">Utbildningsorganisation</SelectItem>
                                <SelectItem value="GovernmentOrganization">Myndighet</SelectItem>
                                <SelectItem value="Corporation">Aktiebolag</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>FAQ Schema</Label>
                              <p className="text-xs text-muted-foreground">Auto-generera från accordion-block</p>
                            </div>
                            <Switch
                              checked={aeoData.faqSchemaEnabled}
                              onCheckedChange={(checked) => setAeoData(prev => ({ ...prev, faqSchemaEnabled: checked }))}
                            />
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Article Schema</Label>
                              <p className="text-xs text-muted-foreground">För bloggposter</p>
                            </div>
                            <Switch
                              checked={aeoData.articleSchemaEnabled}
                              onCheckedChange={(checked) => setAeoData(prev => ({ ...prev, articleSchemaEnabled: checked }))}
                            />
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="font-serif flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        Sitemap
                      </CardTitle>
                      <CardDescription>Dynamisk sitemap.xml för sökmotorer</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Generera /sitemap.xml</Label>
                          <p className="text-xs text-muted-foreground">Automatisk sitemap från publicerade sidor</p>
                        </div>
                        <Switch
                          checked={aeoData.sitemapEnabled}
                          onCheckedChange={(checked) => setAeoData(prev => ({ ...prev, sitemapEnabled: checked }))}
                        />
                      </div>
                      
                      {aeoData.sitemapEnabled && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="changefreq">Ändringsfrekvens</Label>
                            <Select
                              value={aeoData.sitemapChangefreq}
                              onValueChange={(value: AeoSettings['sitemapChangefreq']) => setAeoData(prev => ({ ...prev, sitemapChangefreq: value }))}
                            >
                              <SelectTrigger id="changefreq">
                                <SelectValue placeholder="Välj frekvens" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="daily">Dagligen</SelectItem>
                                <SelectItem value="weekly">Veckovis</SelectItem>
                                <SelectItem value="monthly">Månadsvis</SelectItem>
                                <SelectItem value="yearly">Årligen</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="priority">Standardprioritet</Label>
                            <Input
                              id="priority"
                              type="number"
                              min={0}
                              max={1}
                              step={0.1}
                              value={aeoData.sitemapPriority}
                              onChange={(e) => setAeoData(prev => ({ 
                                ...prev, 
                                sitemapPriority: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.5)) 
                              }))}
                            />
                            <p className="text-xs text-muted-foreground">0.0-1.0, startsidan får alltid 1.0</p>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="font-serif text-base">Vad är AEO?</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-medium mb-2">SEO vs AEO</h4>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• <strong>SEO:</strong> Ranking i sökresultat</li>
                            <li>• <strong>AEO:</strong> Bli citerad som källa av AI</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">AI-sökmotorer som stöds</h4>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• Perplexity AI</li>
                            <li>• ChatGPT (med Browse)</li>
                            <li>• Google AI Overviews</li>
                            <li>• Bing Copilot</li>
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </TabsContent>

          {/* Maintenance Tab */}
          <TabsContent value="maintenance" className="space-y-6">
            {maintenanceData.enabled && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <Wrench className="h-4 w-4" />
                <AlertTitle>Maintenance mode active</AlertTitle>
                <AlertDescription>
                  The website displays a maintenance message for all visitors. Logged in administrators can still see the website.
                </AlertDescription>
              </Alert>
            )}


            <div className="grid gap-6 md:grid-cols-2">
              <Card className={maintenanceData.enabled ? 'border-destructive/50 bg-destructive/5' : ''}>
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    {maintenanceData.enabled && <Wrench className="h-4 w-4 text-destructive" />}
                    Maintenance Mode
                  </CardTitle>
                  <CardDescription>Display a maintenance message for all visitors</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert className="bg-muted/50 border-muted-foreground/20">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      When maintenance mode is active, a customizable message is displayed instead of the website content. 
                      Logged in users can still see the website normally.
                    </AlertDescription>
                  </Alert>

                  <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <Wrench className={`h-5 w-5 ${maintenanceData.enabled ? 'text-destructive' : 'text-muted-foreground'}`} />
                      <div>
                        <Label className={maintenanceData.enabled ? 'text-destructive' : ''}>
                          Enable maintenance mode
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Blocks access for all non-logged in visitors
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={maintenanceData.enabled}
                      onCheckedChange={(checked) => setMaintenanceData(prev => ({ ...prev, enabled: checked }))}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Message</CardTitle>
                  <CardDescription>Customize the text displayed to visitors</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="maintenanceTitle">Title</Label>
                    <Input
                      id="maintenanceTitle"
                      value={maintenanceData.title}
                      onChange={(e) => setMaintenanceData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Website under maintenance"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maintenanceMessage">Message</Label>
                    <Textarea
                      id="maintenanceMessage"
                      value={maintenanceData.message}
                      onChange={(e) => setMaintenanceData(prev => ({ ...prev, message: e.target.value }))}
                      placeholder="We are performing scheduled maintenance..."
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expectedEndTime" className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Expected end time (optional)
                    </Label>
                    <Input
                      id="expectedEndTime"
                      type="datetime-local"
                      value={maintenanceData.expectedEndTime || ''}
                      onChange={(e) => setMaintenanceData(prev => ({ ...prev, expectedEndTime: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Displayed to visitors if filled in
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="font-serif">Preview</CardTitle>
                  <CardDescription>This is how the maintenance page looks to visitors</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-background border rounded-lg p-8 text-center max-w-md mx-auto">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
                      <Wrench className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h2 className="font-serif text-2xl font-bold mb-4">{maintenanceData.title || 'Website under maintenance'}</h2>
                    <p className="text-muted-foreground mb-4">
                      {maintenanceData.message || 'We are performing scheduled maintenance.'}
                    </p>
                    {maintenanceData.expectedEndTime && (
                      <p className="text-sm text-muted-foreground">
                        Expected end time: {new Date(maintenanceData.expectedEndTime).toLocaleString('en-US')}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Scripts Tab */}
          <TabsContent value="scripts" className="space-y-6">
            <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">Warning</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                Scripts added here run on all public pages. Incorrect scripts can affect website functionality and performance.
              </AlertDescription>
            </Alert>

            {/* Active Scripts Preview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-serif text-base">Active scripts</CardTitle>
                <CardDescription>Overview of script injections on public pages</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: 'headStart', label: 'Head (start)', value: scriptsData.headStart },
                    { key: 'headEnd', label: 'Head (end)', value: scriptsData.headEnd },
                    { key: 'bodyStart', label: 'Body (start)', value: scriptsData.bodyStart },
                    { key: 'bodyEnd', label: 'Body (end)', value: scriptsData.bodyEnd },
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
                          {isActive ? `${charCount} characters` : 'No scripts'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>


            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Head Scripts</CardTitle>
                  <CardDescription>Scripts inserted in the &lt;head&gt; tag</CardDescription>
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
                      Inserted right after &lt;head&gt;. Use for critical scripts that must load first.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Head (end)</Label>
                    <CodeEditor
                      value={scriptsData.headEnd}
                      onChange={(value) => setScriptsData(prev => ({ ...prev, headEnd: value }))}
                      placeholder="<!-- Analytics, fonts -->&#10;<script>...</script>"
                    />
                    <p className="text-xs text-muted-foreground">
                      Inserted before &lt;/head&gt;. Perfect for analytics and external fonts.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Body Scripts</CardTitle>
                  <CardDescription>Scripts inserted in the &lt;body&gt; tag</CardDescription>
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
                      Inserted right after &lt;body&gt;. Use for noscript fallbacks and early loaders.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Body (end)</Label>
                    <CodeEditor
                      value={scriptsData.bodyEnd}
                      onChange={(value) => setScriptsData(prev => ({ ...prev, bodyEnd: value }))}
                      placeholder="<!-- Chat widgets, deferred scripts -->&#10;<script>...</script>"
                    />
                    <p className="text-xs text-muted-foreground">
                      Inserted before &lt;/body&gt;. Perfect for chat widgets, tracking and deferred scripts.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif text-sm">Common use cases</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <strong>Google Analytics / Tag Manager</strong> – Head (start)</li>
                    <li>• <strong>Cookie consent</strong> (CookieBot, OneTrust) – Head (start)</li>
                    <li>• <strong>Facebook Pixel</strong> – Head (end)</li>
                    <li>• <strong>Chat widgets</strong> (Intercom, Crisp, Zendesk) – Body (end)</li>
                    <li>• <strong>GTM noscript</strong> – Body (start)</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Cookies Tab */}
          <TabsContent value="cookies" className="space-y-6">

            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Cookie Banner</CardTitle>
                <CardDescription>Customize the cookie consent banner for GDPR compliance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                  <div>
                    <Label>Show cookie banner</Label>
                    <p className="text-sm text-muted-foreground">
                      Shows a banner for visitors to accept or reject cookies
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
                      <Label>Title</Label>
                      <Input
                        value={cookieData.title}
                        onChange={(e) => setCookieData(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="We use cookies"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={cookieData.description}
                        onChange={(e) => setCookieData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe how you use cookies..."
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Link text (privacy policy)</Label>
                        <Input
                          value={cookieData.policyLinkText}
                          onChange={(e) => setCookieData(prev => ({ ...prev, policyLinkText: e.target.value }))}
                          placeholder="Read more about our privacy policy"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Link URL</Label>
                        <Input
                          value={cookieData.policyLinkUrl}
                          onChange={(e) => setCookieData(prev => ({ ...prev, policyLinkUrl: e.target.value }))}
                          placeholder="/privacy-policy"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Accept button</Label>
                        <Input
                          value={cookieData.acceptButtonText}
                          onChange={(e) => setCookieData(prev => ({ ...prev, acceptButtonText: e.target.value }))}
                          placeholder="Accept all"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Reject button</Label>
                        <Input
                          value={cookieData.rejectButtonText}
                          onChange={(e) => setCookieData(prev => ({ ...prev, rejectButtonText: e.target.value }))}
                          placeholder="Essential only"
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
                  <CardTitle className="font-serif text-base">Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 rounded-lg border bg-card">
                    <div className="space-y-2">
                      <h3 className="font-serif font-semibold">{cookieData.title || 'We use cookies'}</h3>
                      <p className="text-sm text-muted-foreground">
                        {cookieData.description || 'Description of how cookies are used...'}
                      </p>
                      <a href="#" className="text-sm text-primary hover:underline inline-block">
                        {cookieData.policyLinkText || 'Read more'}
                      </a>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm">
                        {cookieData.rejectButtonText || 'Essential only'}
                      </Button>
                      <Button size="sm">
                        {cookieData.acceptButtonText || 'Accept all'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Image Optimization</CardTitle>
                  <CardDescription>Settings for image loading and caching</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Lazy loading for images</Label>
                      <p className="text-xs text-muted-foreground">Load images only when visible</p>
                    </div>
                    <Switch
                      checked={performanceData.lazyLoadImages}
                      onCheckedChange={(checked) => setPerformanceData(prev => ({ ...prev, lazyLoadImages: checked }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imageCacheMaxAge">Image cache (seconds)</Label>
                    <Input
                      id="imageCacheMaxAge"
                      type="number"
                      value={performanceData.imageCacheMaxAge}
                      onChange={(e) => setPerformanceData(prev => ({ ...prev, imageCacheMaxAge: parseInt(e.target.value) || 0 }))}
                    />
                    <p className="text-xs text-muted-foreground">31536000 = 1 year</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif">Loading Optimization</CardTitle>
                  <CardDescription>Faster page loading</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Prefetch links</Label>
                      <p className="text-xs text-muted-foreground">Preload links on hover</p>
                    </div>
                    <Switch
                      checked={performanceData.prefetchLinks}
                      onCheckedChange={(checked) => setPerformanceData(prev => ({ ...prev, prefetchLinks: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Cache static assets</Label>
                      <p className="text-xs text-muted-foreground">Enable browser caching</p>
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
                  <CardTitle className="font-serif">Edge Caching</CardTitle>
                  <CardDescription>Cache published pages for faster loading (recommended for production only)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                    <div>
                      <Label>Enable edge caching</Label>
                      <p className="text-xs text-muted-foreground">
                        Published pages are cached for faster delivery. Disable during development.
                      </p>
                    </div>
                    <Switch
                      checked={performanceData.enableEdgeCaching}
                      onCheckedChange={(checked) => setPerformanceData(prev => ({ ...prev, enableEdgeCaching: checked }))}
                    />
                  </div>
                  
                  {performanceData.enableEdgeCaching && (
                    <div className="space-y-2 pt-4 border-t">
                      <Label htmlFor="edgeCacheTtl">Cache duration (minutes)</Label>
                      <Input
                        id="edgeCacheTtl"
                        type="number"
                        min={1}
                        max={60}
                        value={performanceData.edgeCacheTtlMinutes}
                        onChange={(e) => setPerformanceData(prev => ({ 
                          ...prev, 
                          edgeCacheTtlMinutes: Math.max(1, Math.min(60, parseInt(e.target.value) || 5)) 
                        }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        How long pages are cached before fetching from the database again (1-60 minutes)
                      </p>
                    </div>
                  )}
                  
                  {!performanceData.enableEdgeCaching && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Edge caching is disabled. All page views fetch data directly from the database.
                        Enable for production to reduce latency by up to 90%.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="font-serif">Advanced</CardTitle>
                  <CardDescription>Advanced performance settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Service Worker</Label>
                      <p className="text-xs text-muted-foreground">Enables offline functionality (experimental)</p>
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
        </Tabs>

        <UnsavedChangesDialog blocker={blocker} />
      </div>
    </AdminLayout>
  );
}
