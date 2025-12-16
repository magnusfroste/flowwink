import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, Check, FileText, Palette, MessageSquare, Trash2, AlertTriangle } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StarterTemplateSelector } from '@/components/admin/StarterTemplateSelector';
import { StarterTemplate } from '@/data/starter-templates';
import { useCreatePage, usePages, useDeletePage } from '@/hooks/usePages';
import { useUpdateBrandingSettings, useUpdateChatSettings, useUpdateGeneralSettings } from '@/hooks/useSiteSettings';
import { useToast } from '@/hooks/use-toast';

type CreationStep = 'select' | 'creating' | 'done';

interface CreationProgress {
  currentPage: number;
  totalPages: number;
  currentStep: string;
}

export default function NewSitePage() {
  const [selectedTemplate, setSelectedTemplate] = useState<StarterTemplate | null>(null);
  const [step, setStep] = useState<CreationStep>('select');
  const [progress, setProgress] = useState<CreationProgress>({ currentPage: 0, totalPages: 0, currentStep: '' });
  const [createdPageIds, setCreatedPageIds] = useState<string[]>([]);
  const [clearExistingPages, setClearExistingPages] = useState(false);
  
  const navigate = useNavigate();
  const { data: existingPages } = usePages();
  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const updateBranding = useUpdateBrandingSettings();
  const updateChat = useUpdateChatSettings();
  const updateGeneral = useUpdateGeneralSettings();
  const { toast } = useToast();

  const handleTemplateSelect = (template: StarterTemplate) => {
    setSelectedTemplate(template);
  };

  const handleCreateSite = async () => {
    if (!selectedTemplate) return;

    setStep('creating');
    const pageIds: string[] = [];

    try {
      // Step 0: Delete existing pages if option is selected
      if (clearExistingPages && existingPages && existingPages.length > 0) {
        setProgress({ currentPage: 0, totalPages: existingPages.length, currentStep: 'Clearing existing pages...' });
        
        for (let i = 0; i < existingPages.length; i++) {
          setProgress({ 
            currentPage: i + 1, 
            totalPages: existingPages.length, 
            currentStep: `Removing "${existingPages[i].title}"...` 
          });
          await deletePage.mutateAsync(existingPages[i].id);
        }
      }

      // Step 1: Create all pages
      setProgress({ currentPage: 0, totalPages: selectedTemplate.pages.length, currentStep: 'Creating pages...' });
      
      for (let i = 0; i < selectedTemplate.pages.length; i++) {
        const templatePage = selectedTemplate.pages[i];
        setProgress({ 
          currentPage: i + 1, 
          totalPages: selectedTemplate.pages.length, 
          currentStep: `Creating "${templatePage.title}"...` 
        });

        const page = await createPage.mutateAsync({
          title: templatePage.title,
          slug: templatePage.slug,
          content: templatePage.blocks,
          meta: templatePage.meta,
        });
        
        pageIds.push(page.id);
      }

      // Step 2: Apply branding
      setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Applying branding...' });
      setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Applying branding...' });
      await updateBranding.mutateAsync(selectedTemplate.branding);

      // Step 3: Apply chat settings
      setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Configuring AI chat...' });
      await updateChat.mutateAsync(selectedTemplate.chatSettings as any);

      // Step 4: Set homepage
      setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Finalizing...' });
      await updateGeneral.mutateAsync({ homepageSlug: selectedTemplate.siteSettings.homepageSlug });

      setCreatedPageIds(pageIds);
      setStep('done');
      
      toast({
        title: 'Site created!',
        description: `Created ${selectedTemplate.pages.length} pages with branding and chat configured.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create site. Some pages may have been created.',
        variant: 'destructive',
      });
      setStep('select');
    }
  };

  const progressPercent = progress.totalPages > 0 
    ? (progress.currentPage / (progress.totalPages + 2)) * 100 // +2 for branding and chat steps
    : 0;

  return (
    <AdminLayout>
      <div className="max-w-3xl">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/pages')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to pages
        </Button>

        {step === 'select' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-serif font-bold">Create New Site</h1>
              <p className="text-muted-foreground mt-1">
                Choose a template to create a complete website with multiple pages, branding, and AI chat.
              </p>
            </div>

            {!selectedTemplate ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Sparkles className="h-10 w-10 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="text-lg font-medium mb-2">Select a Template</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Browse our professionally designed templates to get started.
                  </p>
                  <StarterTemplateSelector 
                    onSelectTemplate={handleTemplateSelect}
                    trigger={
                      <Button className="gap-2">
                        <Sparkles className="h-4 w-4" />
                        Browse Templates
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-primary" />
                        {selectedTemplate.name}
                      </CardTitle>
                      <CardDescription>{selectedTemplate.tagline}</CardDescription>
                    </div>
                    <StarterTemplateSelector 
                      onSelectTemplate={handleTemplateSelect}
                      trigger={<Button variant="outline" size="sm">Change</Button>}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedTemplate.pages.length} pages</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-muted-foreground" />
                      <span>Branding included</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span>AI Chat configured</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium mb-2">Pages to be created:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate.pages.map((page) => (
                        <Badge key={page.slug} variant="secondary">
                          {page.title}
                          {page.isHomePage && <span className="ml-1 opacity-60">(Home)</span>}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Clear existing pages option */}
                  {existingPages && existingPages.length > 0 && (
                    <div className="space-y-3 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="clear-pages" className="text-sm font-medium flex items-center gap-2">
                            <Trash2 className="h-4 w-4" />
                            Clear existing pages
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Remove all {existingPages.length} existing pages before creating new ones
                          </p>
                        </div>
                        <Switch
                          id="clear-pages"
                          checked={clearExistingPages}
                          onCheckedChange={setClearExistingPages}
                        />
                      </div>
                      
                      {clearExistingPages && (
                        <Alert variant="destructive" className="py-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            This will permanently delete all existing pages including their content.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" onClick={() => navigate('/admin/pages')}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateSite} className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      {clearExistingPages ? 'Replace Site' : 'Create Site'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {step === 'creating' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Creating Your Site
              </CardTitle>
              <CardDescription>
                Please wait while we set up your website...
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progressPercent} className="h-2" />
              <p className="text-sm text-muted-foreground">{progress.currentStep}</p>
            </CardContent>
          </Card>
        )}

        {step === 'done' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Check className="h-5 w-5" />
                Site Created Successfully!
              </CardTitle>
              <CardDescription>
                Your website has been created with {selectedTemplate?.pages.length} pages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {selectedTemplate?.pages.map((page) => (
                  <Badge key={page.slug} variant="secondary" className="gap-1">
                    <Check className="h-3 w-3" />
                    {page.title}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => navigate('/admin/pages')}>
                  View All Pages
                </Button>
                {createdPageIds[0] && (
                  <Button onClick={() => navigate(`/admin/pages/${createdPageIds[0]}`)}>
                    Edit Homepage
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
