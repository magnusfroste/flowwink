import { logger } from '@/lib/logger';
import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, Check, FileText, Palette, MessageSquare, Trash2, AlertTriangle, Send, Newspaper, BookOpen, ShieldCheck, AlertCircle, Package, Puzzle, ImageIcon, HardDrive, Download, Eye } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StarterTemplateSelector } from '@/components/admin/StarterTemplateSelector';
import { TemplatePreviewDialog, TemplateOverwriteOptions } from '@/components/admin/templates/TemplatePreviewDialog';
import { StarterTemplate } from '@/data/starter-templates';
import { validateTemplate, ValidationResult } from '@/lib/template-validator';
import { useCreatePage, usePages, useDeletePage, usePermanentDeletePage, useDeletedPages } from '@/hooks/usePages';
import { useUpdateBrandingSettings, useUpdateChatSettings, useUpdateGeneralSettings, useUpdateSeoSettings, useUpdateCookieBannerSettings, useBrandingSettings, useChatSettings, useSeoSettings, useCookieBannerSettings } from '@/hooks/useSiteSettings';
import { useUpdateFooterBlock, useFooterBlock } from '@/hooks/useGlobalBlocks';
import { useBlogPosts, useCreateBlogPost, useDeleteBlogPost } from '@/hooks/useBlogPosts';
import { useKbCategories, useCreateKbCategory, useCreateKbArticle, useDeleteKbCategory } from '@/hooks/useKnowledgeBase';
import { useModules, useUpdateModules, ModulesSettings, defaultModulesSettings } from '@/hooks/useModules';
import { useProducts, useCreateProduct, useDeleteProduct } from '@/hooks/useProducts';
import { useMediaLibraryCount, useClearMediaLibrary } from '@/hooks/useMediaLibrary';
import { useToast } from '@/hooks/use-toast';
import { extractImagesFromTemplate, updateBlockAtPath } from '@/lib/image-extraction';
import { supabase } from '@/integrations/supabase/client';
import type { ContentBlock } from '@/types/cms';

type CreationStep = 'select' | 'creating' | 'done';

interface CreationProgress {
  currentPage: number;
  totalPages: number;
  currentStep: string;
}

import { createDocumentFromText } from '@/lib/tiptap-utils';

export default function NewSitePage() {
  const location = useLocation();
  const [selectedTemplate, setSelectedTemplate] = useState<StarterTemplate | null>(
    (location.state as any)?.selectedTemplate || null
  );
  const [step, setStep] = useState<CreationStep>('select');
  const [progress, setProgress] = useState<CreationProgress>({ currentPage: 0, totalPages: 0, currentStep: '' });
  const [createdPageIds, setCreatedPageIds] = useState<string[]>([]);
  const [clearExistingPages, setClearExistingPages] = useState(false);
  const [clearBlogPosts, setClearBlogPosts] = useState(true);
  const [clearKbContent, setClearKbContent] = useState(true);
  const [clearProducts, setClearProducts] = useState(true);
  const [clearMedia, setClearMedia] = useState(false);
  const [downloadImages, setDownloadImages] = useState(false);
  const [publishPages, setPublishPages] = useState(true);
  const [publishBlogPosts, setPublishBlogPosts] = useState(true);
  const [publishKbArticles, setPublishKbArticles] = useState(true);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [overwriteOptions, setOverwriteOptions] = useState<TemplateOverwriteOptions | null>(null);
  
  const navigate = useNavigate();
  const { data: existingPages } = usePages();
  const { data: deletedPages } = useDeletedPages();
  const { data: existingBlogPostsData } = useBlogPosts();
  const existingBlogPosts = existingBlogPostsData?.posts || [];
  const { data: existingKbCategories } = useKbCategories();
  const { data: existingProducts } = useProducts();
  const { count: mediaCount } = useMediaLibraryCount();
  const clearMediaLibrary = useClearMediaLibrary();
  const { data: currentModules } = useModules();
  
  // Fetch existing settings for comparison
  const { data: existingBranding } = useBrandingSettings();
  const { data: existingChatSettings } = useChatSettings();
  const { data: existingFooter } = useFooterBlock();
  const { data: existingSeo } = useSeoSettings();
  const { data: existingCookieBanner } = useCookieBannerSettings();
  
  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const permanentDeletePage = usePermanentDeletePage();
  const deleteBlogPost = useDeleteBlogPost();
  const deleteKbCategory = useDeleteKbCategory();
  const deleteProduct = useDeleteProduct();
  const updateBranding = useUpdateBrandingSettings();
  const updateChat = useUpdateChatSettings();
  const updateGeneral = useUpdateGeneralSettings();
  const updateFooter = useUpdateFooterBlock();
  const updateSeo = useUpdateSeoSettings();
  const updateCookieBanner = useUpdateCookieBannerSettings();
  const updateModules = useUpdateModules();
  
  const createBlogPost = useCreateBlogPost();
  const createKbCategory = useCreateKbCategory();
  const createKbArticle = useCreateKbArticle();
  const createProduct = useCreateProduct();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Build existing content summary for preview dialog
  const existingContent = useMemo(() => ({
    pagesCount: existingPages?.length || 0,
    blogPostsCount: existingBlogPosts?.length || 0,
    kbCategoriesCount: existingKbCategories?.length || 0,
    productsCount: existingProducts?.length || 0,
    mediaCount: mediaCount || 0,
    hasBranding: !!(existingBranding?.primaryColor || existingBranding?.logo),
    hasChatSettings: !!existingChatSettings?.enabled,
    hasFooter: !!(existingFooter?.data?.email || existingFooter?.data?.phone),
    hasSeo: !!(existingSeo?.siteTitle || existingSeo?.defaultDescription),
    hasCookieBanner: !!existingCookieBanner?.enabled,
  }), [existingPages, existingBlogPosts, existingKbCategories, existingProducts, mediaCount, existingBranding, existingChatSettings, existingFooter, existingSeo, existingCookieBanner]);

  // Check if there's any existing content
  const hasExistingContent = useMemo(() => (
    existingContent.pagesCount > 0 ||
    existingContent.hasBranding ||
    existingContent.hasChatSettings ||
    existingContent.hasFooter ||
    existingContent.hasSeo ||
    existingContent.hasCookieBanner ||
    existingContent.blogPostsCount > 0 ||
    existingContent.kbCategoriesCount > 0 ||
    existingContent.productsCount > 0
  ), [existingContent]);

  // Calculate template image count
  const templateImageInfo = useMemo(() => {
    if (!selectedTemplate) return null;
    return extractImagesFromTemplate(selectedTemplate);
  }, [selectedTemplate]);

  const handleTemplateSelect = (template: StarterTemplate) => {
    setSelectedTemplate(template);
    setValidationResult(null);
    setOverwriteOptions(null);
  };

  const handleValidateTemplate = () => {
    if (!selectedTemplate) return;
    const result = validateTemplate(selectedTemplate);
    setValidationResult(result);
    setShowValidationDialog(true);
  };

  // Process images through edge function and return URL mapping
  const processTemplateImages = async (
    uniqueUrls: string[],
    onProgress: (current: number, total: number, url: string) => void
  ): Promise<Map<string, string>> => {
    const urlMap = new Map<string, string>();
    
    // Process max 3 images simultaneously
    const batchSize = 3;
    
    for (let i = 0; i < uniqueUrls.length; i += batchSize) {
      const batch = uniqueUrls.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (url, batchIndex) => {
        const globalIndex = i + batchIndex;
        onProgress(globalIndex, uniqueUrls.length, url);
        
        try {
          const { data, error } = await supabase.functions.invoke('process-image', {
            body: { imageUrl: url, folder: 'templates' }
          });
          
          if (error) {
            logger.warn(`Failed to process image ${url}:`, error);
            return;
          }
          
          if (data.success && data.url) {
            urlMap.set(url, data.url);
            logger.log(`Processed: ${url.substring(0, 50)}... → local`);
          }
        } catch (err) {
          logger.warn(`Error processing image ${url}:`, err);
        }
      }));
    }
    
    return urlMap;
  };

  // Apply URL mapping to template pages
  const applyImageMappingToPages = (
    pages: StarterTemplate['pages'],
    imageInfo: ReturnType<typeof extractImagesFromTemplate>,
    urlMap: Map<string, string>
  ): StarterTemplate['pages'] => {
    // Create a deep copy of pages
    const updatedPages = pages.map(page => ({
      ...page,
      blocks: [...page.blocks.map(block => ({ ...block, data: { ...block.data as object } }))]
    }));

    // Apply URL mappings to blocks
    for (const ref of imageInfo.pages) {
      const newUrl = urlMap.get(ref.url);
      if (newUrl) {
        const page = updatedPages[ref.pageIndex];
        if (page) {
          page.blocks = updateBlockAtPath(page.blocks as ContentBlock[], ref.blockIndex, ref.path, newUrl) as typeof page.blocks;
        }
      }
    }

    return updatedPages;
  };

  // Apply URL mapping to blog posts
  const applyImageMappingToBlogPosts = (
    posts: StarterTemplate['blogPosts'],
    imageInfo: ReturnType<typeof extractImagesFromTemplate>,
    urlMap: Map<string, string>
  ): StarterTemplate['blogPosts'] => {
    if (!posts) return posts;
    
    return posts.map((post, index) => {
      const ref = imageInfo.blogPosts.find(r => r.postIndex === index);
      if (ref) {
        const newUrl = urlMap.get(ref.url);
        if (newUrl) {
          return { ...post, featured_image: newUrl };
        }
      }
      return post;
    });
  };

  // Apply URL mapping to products
  const applyImageMappingToProducts = (
    products: StarterTemplate['products'],
    imageInfo: ReturnType<typeof extractImagesFromTemplate>,
    urlMap: Map<string, string>
  ): StarterTemplate['products'] => {
    if (!products) return products;
    
    return products.map((product, index) => {
      const ref = imageInfo.products.find(r => r.productIndex === index);
      if (ref) {
        const newUrl = urlMap.get(ref.url);
        if (newUrl) {
          return { ...product, image_url: newUrl };
        }
      }
      return product;
    });
  };

  // Handler when user confirms from preview dialog
  const handleApplyWithOptions = (options: TemplateOverwriteOptions) => {
    setOverwriteOptions(options);
    // Map overwrite options to local states
    setClearExistingPages(options.pages && existingContent.pagesCount > 0);
    setClearBlogPosts(options.blogPosts && existingContent.blogPostsCount > 0);
    setClearKbContent(options.kbContent && existingContent.kbCategoriesCount > 0);
    setClearProducts(options.products && existingContent.productsCount > 0);
    setClearMedia(options.clearMedia);
    setDownloadImages(options.downloadImages);
    setPublishPages(options.publishPages);
    setPublishBlogPosts(options.publishBlogPosts);
    setPublishKbArticles(options.publishKbArticles);
    // Trigger creation with options
    handleCreateSiteWithOptions(options);
  };

  const handleCreateSiteWithOptions = async (options?: TemplateOverwriteOptions) => {
    if (!selectedTemplate) return;

    // Use provided options or default to all true
    const opts = options || {
      pages: true,
      branding: true,
      chatSettings: true,
      footerSettings: true,
      seoSettings: true,
      cookieBannerSettings: true,
      blogPosts: !!selectedTemplate.blogPosts?.length,
      kbContent: !!selectedTemplate.kbCategories?.length,
      products: !!selectedTemplate.products?.length,
      modules: !!selectedTemplate.requiredModules?.length,
      clearMedia: false,
      downloadImages: !!(templateImageInfo && templateImageInfo.uniqueUrls.length > 0),
      publishPages: true,
      publishBlogPosts: true,
      publishKbArticles: true,
    };

    setStep('creating');
    const pageIds: string[] = [];

    try {
      // Step 0e: Clear media library if option is selected (safe — doesn't affect pages)
      if (opts.clearMedia && mediaCount > 0) {
        setProgress({ currentPage: 0, totalPages: mediaCount, currentStep: 'Clearing media library...' });
        await clearMediaLibrary.mutateAsync((current, total, step) => {
          setProgress({ currentPage: current, totalPages: total, currentStep: step });
        });
      }

      // Prepare template data (will be modified if downloading images)
      let templatePages = selectedTemplate.pages;
      let templateBlogPosts = selectedTemplate.blogPosts;
      let templateProducts = selectedTemplate.products;

      // Step 0f: Download images if option is selected
      if (opts.downloadImages && templateImageInfo && templateImageInfo.uniqueUrls.length > 0) {
        setProgress({ 
          currentPage: 0, 
          totalPages: templateImageInfo.uniqueUrls.length, 
          currentStep: 'Downloading template images...' 
        });

        const urlMap = await processTemplateImages(
          templateImageInfo.uniqueUrls,
          (current, total, url) => {
            const shortUrl = url.length > 40 ? url.substring(0, 40) + '...' : url;
            setProgress({ 
              currentPage: current + 1, 
              totalPages: total, 
              currentStep: `Downloading image ${current + 1}/${total}: ${shortUrl}` 
            });
          }
        );

        // Apply URL mappings to template data
        if (urlMap.size > 0) {
          templatePages = applyImageMappingToPages(templatePages, templateImageInfo, urlMap);
          templateBlogPosts = applyImageMappingToBlogPosts(templateBlogPosts, templateImageInfo, urlMap);
          templateProducts = applyImageMappingToProducts(templateProducts, templateImageInfo, urlMap);
          
          logger.log(`Downloaded ${urlMap.size} images to media library`);
        }
      }

      // Step 1: Enable required modules
      if (selectedTemplate.requiredModules && selectedTemplate.requiredModules.length > 0) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Enabling modules...' });
        
        const baseModules = currentModules || defaultModulesSettings;
        const updatedModules = { ...baseModules } as ModulesSettings;
        
        for (const moduleId of selectedTemplate.requiredModules) {
          if (updatedModules[moduleId]) {
            updatedModules[moduleId] = { 
              ...updatedModules[moduleId], 
              enabled: true 
            };
          }
        }
        
        await updateModules.mutateAsync(updatedModules);
      }

      // Step 2a: Delete existing pages to free up slugs
      const shouldClearPages = opts.pages && existingPages && existingPages.length > 0;
      if (shouldClearPages) {
        setProgress({ currentPage: 0, totalPages: existingPages!.length, currentStep: 'Clearing existing pages...' });
        
        for (let i = 0; i < existingPages!.length; i++) {
          setProgress({ 
            currentPage: i + 1, 
            totalPages: existingPages!.length, 
            currentStep: `Removing page "${existingPages![i].title}"...` 
          });
          await permanentDeletePage.mutateAsync(existingPages![i].id);
        }
      }

      // Step 2b: Clean up trashed pages with conflicting slugs
      if (opts.pages && deletedPages && deletedPages.length > 0 && selectedTemplate) {
        const templateSlugs = new Set(selectedTemplate.pages.map(p => p.slug));
        const conflicting = deletedPages.filter(p => templateSlugs.has(p.slug));
        if (conflicting.length > 0) {
          for (const page of conflicting) {
            setProgress({ 
              currentPage: 0, 
              totalPages: conflicting.length, 
              currentStep: `Cleaning up trashed page "${page.title}"...` 
            });
            await permanentDeletePage.mutateAsync(page.id);
          }
        }
      }

      // Step 2c: Create all new pages
      if (opts.pages) {
        setProgress({ currentPage: 0, totalPages: templatePages.length, currentStep: 'Creating pages...' });
        
        for (let i = 0; i < templatePages.length; i++) {
          const templatePage = templatePages[i];
          setProgress({ 
            currentPage: i + 1, 
            totalPages: templatePages.length, 
            currentStep: `Creating "${templatePage.title}"...` 
          });

          const page = await createPage.mutateAsync({
            title: templatePage.title,
            slug: templatePage.slug,
            content: templatePage.blocks,
            meta: templatePage.meta,
            menu_order: templatePage.menu_order,
            show_in_menu: templatePage.showInMenu,
            status: opts.publishPages ? 'published' : 'draft',
          });
          
          pageIds.push(page.id);
        }
      }

      // Step 2d: Delete existing blog posts
      const shouldClearBlog = opts.blogPosts && existingBlogPosts && existingBlogPosts.length > 0;
      if (shouldClearBlog) {
        setProgress({ currentPage: 0, totalPages: existingBlogPosts.length, currentStep: 'Clearing existing blog posts...' });
        
        for (let i = 0; i < existingBlogPosts.length; i++) {
          setProgress({ 
            currentPage: i + 1, 
            totalPages: existingBlogPosts.length, 
            currentStep: `Removing blog post "${existingBlogPosts[i].title}"...` 
          });
          await deleteBlogPost.mutateAsync(existingBlogPosts[i].id);
        }
      }

      // Step 2f: Delete existing KB categories
      const shouldClearKb = opts.kbContent && existingKbCategories && existingKbCategories.length > 0;
      if (shouldClearKb) {
        setProgress({ currentPage: 0, totalPages: existingKbCategories.length, currentStep: 'Clearing existing KB content...' });
        
        for (let i = 0; i < existingKbCategories.length; i++) {
          setProgress({ 
            currentPage: i + 1, 
            totalPages: existingKbCategories.length, 
            currentStep: `Removing KB category "${existingKbCategories[i].name}"...` 
          });
          await deleteKbCategory.mutateAsync(existingKbCategories[i].id);
        }
      }

      // Step 2g: Delete existing products
      const shouldClearProducts = opts.products && existingProducts && existingProducts.length > 0;
      if (shouldClearProducts) {
        setProgress({ currentPage: 0, totalPages: existingProducts!.length, currentStep: 'Clearing existing products...' });
        
        for (let i = 0; i < existingProducts!.length; i++) {
          setProgress({ 
            currentPage: i + 1, 
            totalPages: existingProducts!.length, 
            currentStep: `Removing product "${existingProducts![i].name}"...` 
          });
          await deleteProduct.mutateAsync(existingProducts![i].id);
        }
      }

      // Step 3: Apply branding (if branding option enabled)
      if (opts.branding) {
        setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Applying branding...' });
        await updateBranding.mutateAsync(selectedTemplate.branding);
      }

      // Step 4: Apply chat settings (if chatSettings option enabled)
      if (opts.chatSettings) {
        setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Configuring AI chat...' });
        await updateChat.mutateAsync(selectedTemplate.chatSettings as any);
      }

      // Step 5: Apply footer settings (if footerSettings option enabled)
      if (opts.footerSettings) {
        setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Applying footer...' });
        await updateFooter.mutateAsync(selectedTemplate.footerSettings as any);
      }

      // Step 6: Apply SEO settings (if seoSettings option enabled)
      if (opts.seoSettings) {
        setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Configuring SEO...' });
        await updateSeo.mutateAsync(selectedTemplate.seoSettings as any);
      }

      // Step 7: Apply Cookie Banner settings (if cookieBannerSettings option enabled)
      if (opts.cookieBannerSettings) {
        setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Configuring cookies...' });
        await updateCookieBanner.mutateAsync(selectedTemplate.cookieBannerSettings as any);
      }

      // Step 8: Set homepage and selected template (always if pages were created)
      if (opts.pages) {
        setProgress({ currentPage: selectedTemplate.pages.length, totalPages: selectedTemplate.pages.length, currentStep: 'Finalizing...' });
        await updateGeneral.mutateAsync({ 
          homepageSlug: selectedTemplate.siteSettings.homepageSlug,
          selectedTemplate: selectedTemplate.id
        });
      }

      // Step 9: Create products if template has them (and products option enabled)
      if (opts.products) {
        const productsToCreate = templateProducts || [];
        if (productsToCreate.length > 0) {
          for (let i = 0; i < productsToCreate.length; i++) {
            const product = productsToCreate[i];
            setProgress({ 
              currentPage: i + 1, 
              totalPages: productsToCreate.length, 
              currentStep: `Creating product "${product.name}"...` 
            });
            
            await createProduct.mutateAsync({
              name: product.name,
              description: product.description,
              price_cents: product.price_cents,
              currency: product.currency,
              type: product.type,
              image_url: product.image_url || null,
              is_active: product.is_active ?? true,
              sort_order: i,
              stripe_price_id: null,
            });
          }
        }
      }

      // Step 10: Create blog posts if template has them (and blogPosts option enabled)
      if (opts.blogPosts) {
        const postsToCreate = templateBlogPosts || [];
        if (postsToCreate.length > 0) {
          for (let i = 0; i < postsToCreate.length; i++) {
            const post = postsToCreate[i];
            setProgress({ 
              currentPage: i + 1, 
              totalPages: postsToCreate.length, 
              currentStep: `Creating blog post "${post.title}"...` 
            });
            
            await createBlogPost.mutateAsync({
              title: post.title,
              slug: post.slug,
              excerpt: post.excerpt,
              featured_image: post.featured_image,
              content: post.content,
              meta: post.meta,
              status: opts.publishBlogPosts ? 'published' : 'draft',
            });
          }
        }
      }

      // Step 11: Create Knowledge Base categories and articles if template has them (and kbContent option enabled)
      let totalKbArticles = 0;
      if (opts.kbContent) {
        const kbCategories = selectedTemplate.kbCategories || [];
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
              // Generate TiptapDocument from answer_text
              const answerJson = createDocumentFromText(article.answer_text);
              
              await createKbArticle.mutateAsync({
                category_id: createdCategory.id,
                title: article.title,
                slug: article.slug,
                question: article.question,
                answer_json: answerJson as any,
                answer_text: article.answer_text,
                is_published: opts.publishKbArticles,
                is_featured: article.is_featured,
                include_in_chat: article.include_in_chat,
              });
              totalKbArticles++;
            }
          }
        }
      }

      setCreatedPageIds(pageIds);
      setStep('done');
      
      const appliedPagesCount = opts.pages ? selectedTemplate.pages.length : 0;
      const appliedBlogCount = opts.blogPosts ? (templateBlogPosts?.length || 0) : 0;
      const appliedProductCount = opts.products ? (templateProducts?.length || 0) : 0;
      const moduleCount = selectedTemplate.requiredModules?.length || 0;
      
      let description = appliedPagesCount > 0 ? `Created ${appliedPagesCount} pages` : 'Applied settings';
      if (appliedProductCount > 0) description += `, ${appliedProductCount} products`;
      if (appliedBlogCount > 0) description += `, ${appliedBlogCount} blog posts`;
      if (totalKbArticles > 0) description += `, ${totalKbArticles} KB articles`;
      if (moduleCount > 0) description += `. Enabled ${moduleCount} modules`;
      description += '.';
      
      // Force refresh all caches to ensure admin UI shows new data
      await queryClient.invalidateQueries({ queryKey: ['pages'] });
      await queryClient.invalidateQueries({ queryKey: ['deleted-pages'] });
      await queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      await queryClient.invalidateQueries({ queryKey: ['kb-categories'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['site-settings'] });

      toast({
        title: 'Template applied!',
        description,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to apply template. Some changes may have been applied.',
        variant: 'destructive',
      });
      setStep('select');
    }
  };

  // Legacy handler for backward compatibility
  const handleCreateSite = () => handleCreateSiteWithOptions();

  const progressPercent = progress.totalPages > 0 
    ? (progress.currentPage / (progress.totalPages + 2)) * 100 // +2 for branding and chat steps
    : 0;

  const cameFromTemplates = !!(location.state as any)?.selectedTemplate;

  return (
    <AdminLayout>
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 mb-6">
          {cameFromTemplates ? (
            <Button
              variant="ghost"
              onClick={() => navigate('/admin/templates')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tillbaka till Templates
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => navigate('/admin/pages')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to pages
            </Button>
          )}
        </div>

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
                    {selectedTemplate.products && selectedTemplate.products.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedTemplate.products.length} products</span>
                      </div>
                    )}
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
                    {selectedTemplate.requiredModules && selectedTemplate.requiredModules.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Puzzle className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedTemplate.requiredModules.length} modules enabled</span>
                      </div>
                    )}
                    {templateImageInfo && templateImageInfo.uniqueUrls.length > 0 && (
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <span>{templateImageInfo.uniqueUrls.length} images</span>
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


                  <div className="flex gap-3 pt-4 border-t">
                    <Button variant="outline" onClick={() => navigate('/admin/pages')}>
                      Cancel
                    </Button>
                    <Button variant="outline" onClick={handleValidateTemplate} className="gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Validate
                    </Button>
                    {hasExistingContent ? (
                      <Button onClick={() => setShowPreviewDialog(true)} className="gap-2">
                        <Eye className="h-4 w-4" />
                        Review Changes
                      </Button>
                    ) : (
                      <Button onClick={() => handleCreateSiteWithOptions()} className="gap-2">
                        <Sparkles className="h-4 w-4" />
                        Create Site
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Template Preview Dialog */}
            {selectedTemplate && (
              <TemplatePreviewDialog
                open={showPreviewDialog}
                onOpenChange={setShowPreviewDialog}
                template={selectedTemplate}
                existingContent={existingContent}
                templateImageCount={templateImageInfo?.uniqueUrls.length || 0}
                onApply={handleApplyWithOptions}
              />
            )}

            {/* Validation Results Dialog */}
            <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {validationResult?.valid ? (
                      <>
                        <Check className="h-5 w-5 text-primary" />
                        Template Valid
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        Validation Issues Found
                      </>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {validationResult?.valid 
                      ? 'The template structure is correct and ready to import.'
                      : 'Please review the issues below before importing.'}
                  </DialogDescription>
                </DialogHeader>
                
                <ScrollArea className="max-h-96">
                  <div className="space-y-4">
                    {/* Summary Section */}
                    {selectedTemplate && (
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <h4 className="text-sm font-medium">Template Summary</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Pages</span>
                            <Badge variant="secondary">{selectedTemplate.pages.length}</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Total Blocks</span>
                            <Badge variant="secondary">
                              {selectedTemplate.pages.reduce((acc, page) => acc + page.blocks.length, 0)}
                            </Badge>
                          </div>
                          {selectedTemplate.blogPosts && selectedTemplate.blogPosts.length > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Blog Posts</span>
                              <Badge variant="secondary">{selectedTemplate.blogPosts.length}</Badge>
                            </div>
                          )}
                          {selectedTemplate.kbCategories && selectedTemplate.kbCategories.length > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">KB Articles</span>
                              <Badge variant="secondary">
                                {selectedTemplate.kbCategories.reduce((acc, cat) => acc + cat.articles.length, 0)}
                              </Badge>
                            </div>
                          )}
                        </div>
                        <div className="pt-2 border-t">
                          <span className="text-xs text-muted-foreground">Block Types Used:</span>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {[...new Set(selectedTemplate.pages.flatMap(p => p.blocks.map(b => b.type)))].map(type => (
                              <Badge key={type} variant="outline" className="text-xs">
                                {type}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {validationResult?.errors && validationResult.errors.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-2 text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          Errors ({validationResult.errors.length})
                        </h4>
                        <ul className="space-y-1.5">
                          {validationResult.errors.map((error, i) => (
                            <li key={i} className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                              <strong>{error.path}:</strong> {error.message}
                              {error.suggestion && (
                                <span className="block text-xs mt-1 opacity-80">💡 {error.suggestion}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {validationResult?.warnings && validationResult.warnings.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
                          <AlertTriangle className="h-4 w-4" />
                          Warnings ({validationResult.warnings.length})
                        </h4>
                        <ul className="space-y-1.5">
                          {validationResult.warnings.map((warning, i) => (
                            <li key={i} className="text-sm text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded px-3 py-2">
                              <strong>{warning.path}:</strong> {warning.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {validationResult?.valid && validationResult.errors.length === 0 && validationResult.warnings.length === 0 && (
                      <div className="text-center py-4 text-muted-foreground">
                        <Check className="h-10 w-10 mx-auto mb-2 text-primary" />
                        <p className="text-sm">No issues found. Template is ready to import!</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
                
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setShowValidationDialog(false)}>
                    Close
                  </Button>
                  {validationResult?.valid && (
                    <Button onClick={() => { setShowValidationDialog(false); handleCreateSiteWithOptions(); }} className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      Create Site
                    </Button>
                  )}
                </div>
              </DialogContent>
            </Dialog>
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
