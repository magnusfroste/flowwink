import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, Check, FileText, Palette, MessageSquare, Trash2, AlertTriangle, Send, Newspaper, BookOpen } from 'lucide-react';
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
import { useUpdateBrandingSettings, useUpdateChatSettings, useUpdateGeneralSettings, useUpdateSeoSettings, useUpdateCookieBannerSettings, useUpdateKbSettings } from '@/hooks/useSiteSettings';
import { useUpdateFooterBlock } from '@/hooks/useGlobalBlocks';
import { useCreateBlogPost } from '@/hooks/useBlogPosts';
import { useCreateKbCategory, useCreateKbArticle } from '@/hooks/useKnowledgeBase';
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
  const [publishPages, setPublishPages] = useState(true);
  const [publishBlogPosts, setPublishBlogPosts] = useState(true);
  const [publishKbArticles, setPublishKbArticles] = useState(true);
  
  const navigate = useNavigate();
  const { data: existingPages } = usePages();
  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const updateBranding = useUpdateBrandingSettings();
  const updateChat = useUpdateChatSettings();
  const updateGeneral = useUpdateGeneralSettings();
  const updateFooter = useUpdateFooterBlock();
  const updateSeo = useUpdateSeoSettings();
  const updateCookieBanner = useUpdateCookieBannerSettings();
  const updateKbSettings = useUpdateKbSettings();
  const createBlogPost = useCreateBlogPost();
  const createKbCategory = useCreateKbCategory();
  const createKbArticle = useCreateKbArticle();
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
          menu_order: templatePage.menu_order,
          show_in_menu: templatePage.showInMenu,
          status: publishPages ? 'published' : 'draft',
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

      // Step 4: Apply footer settings
      setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Applying footer...' });
      await updateFooter.mutateAsync(selectedTemplate.footerSettings as any);

      // Step 5: Apply SEO settings
      setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Configuring SEO...' });
      await updateSeo.mutateAsync(selectedTemplate.seoSettings as any);

      // Step 6: Apply Cookie Banner settings
      setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Configuring cookies...' });
      await updateCookieBanner.mutateAsync(selectedTemplate.cookieBannerSettings as any);

      // Step 7: Apply Knowledge Base settings if present
      if (selectedTemplate.kbSettings) {
        setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Configuring Knowledge Base...' });
        await updateKbSettings.mutateAsync(selectedTemplate.kbSettings as any);
      }

      // Step 8: Set homepage
      setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Finalizing...' });
      await updateGeneral.mutateAsync({ homepageSlug: selectedTemplate.siteSettings.homepageSlug });

      // Step 8: Create blog posts if template has them
      const blogPosts = selectedTemplate.blogPosts || [];
      if (blogPosts.length > 0) {
        for (let i = 0; i < blogPosts.length; i++) {
          const post = blogPosts[i];
          setProgress({ 
            currentPage: i + 1, 
            totalPages: blogPosts.length, 
            currentStep: `Creating blog post "${post.title}"...` 
          });
          
          await createBlogPost.mutateAsync({
            title: post.title,
            slug: post.slug,
            excerpt: post.excerpt,
            featured_image: post.featured_image,
            content: post.content,
            meta: post.meta,
            status: publishBlogPosts ? 'published' : 'draft',
          });
        }
      }

      // Step 10: Create Knowledge Base categories and articles if template has them
      const kbCategories = selectedTemplate.kbCategories || [];
      let totalKbArticles = 0;
      if (kbCategories.length > 0) {
        for (let i = 0; i < kbCategories.length; i++) {
          const category = kbCategories[i];
          setProgress({ 
            currentPage: i + 1, 
            totalPages: kbCategories.length, 
            currentStep: `Creating KB category "${category.name}"...` 
          });
          
          // Create the category
          const createdCategory = await createKbCategory.mutateAsync({
            name: category.name,
            slug: category.slug,
            description: category.description,
            icon: category.icon,
            is_active: true,
          });

          // Create articles for this category
          for (const article of category.articles) {
            await createKbArticle.mutateAsync({
              category_id: createdCategory.id,
              title: article.title,
              slug: article.slug,
              question: article.question,
              answer_json: article.answer_json as any,
              answer_text: article.answer_text,
              is_published: publishKbArticles,
              is_featured: article.is_featured,
              include_in_chat: article.include_in_chat,
            });
            totalKbArticles++;
          }
        }
      }

      setCreatedPageIds(pageIds);
      setStep('done');
      
      const blogCount = blogPosts.length;
      const kbCount = totalKbArticles;
      let description = `Created ${selectedTemplate.pages.length} pages`;
      if (blogCount > 0) description += `, ${blogCount} blog posts`;
      if (kbCount > 0) description += `, ${kbCount} KB articles`;
      description += ' with branding and chat configured.';
      
      toast({
        title: 'Site created!',
        description,
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
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedTemplate.pages.length} pages</span>
                    </div>
                    {selectedTemplate.blogPosts && selectedTemplate.blogPosts.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Newspaper className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedTemplate.blogPosts.length} blog posts</span>
                      </div>
                    )}
                    {selectedTemplate.kbCategories && selectedTemplate.kbCategories.length > 0 && (
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedTemplate.kbCategories.reduce((acc, cat) => acc + cat.articles.length, 0)} KB articles</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-muted-foreground" />
                      <span>Branding</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span>AI Chat</span>
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

                  {/* Publish pages option */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="space-y-0.5">
                      <Label htmlFor="publish-pages" className="text-sm font-medium flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        Publish pages immediately
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Publish all {selectedTemplate.pages.length} pages when creating the site
                      </p>
                    </div>
                    <Switch
                      id="publish-pages"
                      checked={publishPages}
                      onCheckedChange={setPublishPages}
                    />
                  </div>

                  {/* Publish blog posts option */}
                  {selectedTemplate.blogPosts && selectedTemplate.blogPosts.length > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="publish-blogs" className="text-sm font-medium flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          Publish blog posts immediately
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Publish all {selectedTemplate.blogPosts.length} blog posts when creating the site
                        </p>
                      </div>
                      <Switch
                        id="publish-blogs"
                        checked={publishBlogPosts}
                        onCheckedChange={setPublishBlogPosts}
                      />
                    </div>
                  )}

                  {/* Publish KB articles option */}
                  {selectedTemplate.kbCategories && selectedTemplate.kbCategories.length > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="publish-kb" className="text-sm font-medium flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          Publish KB articles immediately
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Publish all {selectedTemplate.kbCategories.reduce((acc, cat) => acc + cat.articles.length, 0)} knowledge base articles when creating the site
                        </p>
                      </div>
                      <Switch
                        id="publish-kb"
                        checked={publishKbArticles}
                        onCheckedChange={setPublishKbArticles}
                      />
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
