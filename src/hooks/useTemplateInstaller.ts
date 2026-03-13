import { logger } from '@/lib/logger';
import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StarterTemplate } from '@/data/templates';
import { TemplateOverwriteOptions } from '@/components/admin/templates/TemplatePreviewDialog';
import { useCreatePage, usePages, usePermanentDeletePage, useDeletedPages } from '@/hooks/usePages';
import { useUpdateBrandingSettings, useUpdateChatSettings, useUpdateGeneralSettings, useUpdateSeoSettings, useUpdateCookieBannerSettings, useUpdateAeoSettings, useBrandingSettings, useChatSettings, useSeoSettings, useCookieBannerSettings } from '@/hooks/useSiteSettings';
import { useUpdateFooterBlock, useFooterBlock, useUpdateHeaderBlock } from '@/hooks/useGlobalBlocks';
import { useBlogPosts, useCreateBlogPost, useDeleteBlogPost } from '@/hooks/useBlogPosts';
import { useKbCategories, useCreateKbCategory, useCreateKbArticle, useDeleteKbCategory } from '@/hooks/useKnowledgeBase';
import { useModules, useUpdateModules, ModulesSettings, defaultModulesSettings } from '@/hooks/useModules';
import { useProducts, useCreateProduct, useDeleteProduct } from '@/hooks/useProducts';
import { useMediaLibraryCount, useClearMediaLibrary } from '@/hooks/useMediaLibrary';
import { useToast } from '@/hooks/use-toast';
import { extractImagesFromTemplate, updateBlockAtPath } from '@/lib/image-extraction';
import { supabase } from '@/integrations/supabase/client';
import { createDocumentFromText } from '@/lib/tiptap-utils';
import type { ContentBlock } from '@/types/cms';

export type InstallStep = 'idle' | 'creating' | 'done';

export interface InstallProgress {
  currentPage: number;
  totalPages: number;
  currentStep: string;
}

export function useTemplateInstaller() {
  const [step, setStep] = useState<InstallStep>('idle');
  const [progress, setProgress] = useState<InstallProgress>({ currentPage: 0, totalPages: 0, currentStep: '' });
  const [createdPageIds, setCreatedPageIds] = useState<string[]>([]);

  const { data: existingPages } = usePages();
  const { data: deletedPages } = useDeletedPages();
  const { data: existingBlogPostsData } = useBlogPosts();
  const existingBlogPosts = existingBlogPostsData?.posts || [];
  const { data: existingKbCategories } = useKbCategories();
  const { data: existingProducts } = useProducts();
  const { count: mediaCount } = useMediaLibraryCount();
  const clearMediaLibrary = useClearMediaLibrary();
  const { data: currentModules } = useModules();

  const { data: existingBranding } = useBrandingSettings();
  const { data: existingChatSettings } = useChatSettings();
  const { data: existingFooter } = useFooterBlock();
  const { data: existingSeo } = useSeoSettings();
  const { data: existingCookieBanner } = useCookieBannerSettings();

  const createPage = useCreatePage();
  const permanentDeletePage = usePermanentDeletePage();
  const deleteBlogPost = useDeleteBlogPost();
  const deleteKbCategory = useDeleteKbCategory();
  const deleteProduct = useDeleteProduct();
  const updateBranding = useUpdateBrandingSettings();
  const updateChat = useUpdateChatSettings();
  const updateGeneral = useUpdateGeneralSettings();
  const updateFooter = useUpdateFooterBlock();
  const updateHeader = useUpdateHeaderBlock();
  const updateSeo = useUpdateSeoSettings();
  const updateCookieBanner = useUpdateCookieBannerSettings();
  const updateAeo = useUpdateAeoSettings();
  const updateModules = useUpdateModules();
  const createBlogPost = useCreateBlogPost();
  const createKbCategory = useCreateKbCategory();
  const createKbArticle = useCreateKbArticle();
  const createProduct = useCreateProduct();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Image processing helpers
  const processTemplateImages = async (
    uniqueUrls: string[],
    onProgress: (current: number, total: number, url: string) => void
  ): Promise<Map<string, string>> => {
    const urlMap = new Map<string, string>();
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
          if (error) { logger.warn(`Failed to process image ${url}:`, error); return; }
          if (data.success && data.url) {
            urlMap.set(url, data.url);
          }
        } catch (err) {
          logger.warn(`Error processing image ${url}:`, err);
        }
      }));
    }
    return urlMap;
  };

  const applyImageMappingToPages = (
    pages: StarterTemplate['pages'],
    imageInfo: ReturnType<typeof extractImagesFromTemplate>,
    urlMap: Map<string, string>
  ): StarterTemplate['pages'] => {
    const updatedPages = pages.map(page => ({
      ...page,
      blocks: [...page.blocks.map(block => ({ ...block, data: { ...block.data as object } }))]
    }));
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
        if (newUrl) return { ...post, featured_image: newUrl };
      }
      return post;
    });
  };

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
        if (newUrl) return { ...product, image_url: newUrl };
      }
      return product;
    });
  };

  const install = useCallback(async (template: StarterTemplate, options?: TemplateOverwriteOptions) => {
    const templateImageInfo = extractImagesFromTemplate(template);

    const opts = options || {
      pages: true,
      branding: true,
      chatSettings: true,
      headerSettings: true,
      footerSettings: true,
      seoSettings: true,
      cookieBannerSettings: true,
      blogPosts: !!template.blogPosts?.length,
      kbContent: !!template.kbCategories?.length,
      products: !!template.products?.length,
      consultants: !!template.consultants?.length,
      modules: !!template.requiredModules?.length,
      resetObjectives: !!template.flowpilot?.objectives?.length,
      clearMedia: false,
      downloadImages: !!(templateImageInfo && templateImageInfo.uniqueUrls.length > 0),
      publishPages: true,
      publishBlogPosts: true,
      publishKbArticles: true,
    };

    setStep('creating');
    const pageIds: string[] = [];

    try {
      // Clear media
      if (opts.clearMedia && mediaCount && mediaCount > 0) {
        setProgress({ currentPage: 0, totalPages: mediaCount, currentStep: 'Clearing media library...' });
        await clearMediaLibrary.mutateAsync((current: number, total: number, step: string) => {
          setProgress({ currentPage: current, totalPages: total, currentStep: step });
        });
      }

      let templatePages = template.pages;
      let templateBlogPosts = template.blogPosts;
      let templateProducts = template.products;

      // Download images
      if (opts.downloadImages && templateImageInfo && templateImageInfo.uniqueUrls.length > 0) {
        setProgress({ currentPage: 0, totalPages: templateImageInfo.uniqueUrls.length, currentStep: 'Downloading template images...' });
        const urlMap = await processTemplateImages(
          templateImageInfo.uniqueUrls,
          (current, total, url) => {
            const shortUrl = url.length > 40 ? url.substring(0, 40) + '...' : url;
            setProgress({ currentPage: current + 1, totalPages: total, currentStep: `Downloading image ${current + 1}/${total}: ${shortUrl}` });
          }
        );
        if (urlMap.size > 0) {
          templatePages = applyImageMappingToPages(templatePages, templateImageInfo, urlMap);
          templateBlogPosts = applyImageMappingToBlogPosts(templateBlogPosts, templateImageInfo, urlMap);
          templateProducts = applyImageMappingToProducts(templateProducts, templateImageInfo, urlMap);
          logger.log(`Downloaded ${urlMap.size} images to media library`);
        }
      }

      // Enable modules
      if (template.requiredModules && template.requiredModules.length > 0) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Enabling modules...' });
        const baseModules = currentModules || defaultModulesSettings;
        const updatedModules = { ...baseModules } as ModulesSettings;
        for (const moduleId of template.requiredModules) {
          if (updatedModules[moduleId]) {
            updatedModules[moduleId] = { ...updatedModules[moduleId], enabled: true };
          }
        }
        await updateModules.mutateAsync(updatedModules);
      }

      // Delete existing pages
      if (opts.pages && existingPages && existingPages.length > 0) {
        setProgress({ currentPage: 0, totalPages: existingPages.length, currentStep: 'Clearing existing pages...' });
        for (let i = 0; i < existingPages.length; i++) {
          setProgress({ currentPage: i + 1, totalPages: existingPages.length, currentStep: `Removing page "${existingPages[i].title}"...` });
          await permanentDeletePage.mutateAsync(existingPages[i].id);
        }
      }

      // Clean up trashed pages with conflicting slugs
      if (opts.pages && deletedPages && deletedPages.length > 0) {
        const templateSlugs = new Set(template.pages.map(p => p.slug));
        const conflicting = deletedPages.filter(p => templateSlugs.has(p.slug));
        for (const page of conflicting) {
          setProgress({ currentPage: 0, totalPages: conflicting.length, currentStep: `Cleaning up trashed page "${page.title}"...` });
          await permanentDeletePage.mutateAsync(page.id);
        }
      }

      // Create pages
      if (opts.pages) {
        setProgress({ currentPage: 0, totalPages: templatePages.length, currentStep: 'Creating pages...' });
        for (let i = 0; i < templatePages.length; i++) {
          const templatePage = templatePages[i];
          setProgress({ currentPage: i + 1, totalPages: templatePages.length, currentStep: `Creating "${templatePage.title}"...` });
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

      // Delete existing blog posts
      if (opts.blogPosts && existingBlogPosts && existingBlogPosts.length > 0) {
        setProgress({ currentPage: 0, totalPages: existingBlogPosts.length, currentStep: 'Clearing existing blog posts...' });
        for (let i = 0; i < existingBlogPosts.length; i++) {
          setProgress({ currentPage: i + 1, totalPages: existingBlogPosts.length, currentStep: `Removing blog post "${existingBlogPosts[i].title}"...` });
          await deleteBlogPost.mutateAsync(existingBlogPosts[i].id);
        }
      }

      // Delete existing KB categories
      if (opts.kbContent && existingKbCategories && existingKbCategories.length > 0) {
        setProgress({ currentPage: 0, totalPages: existingKbCategories.length, currentStep: 'Clearing existing KB content...' });
        for (let i = 0; i < existingKbCategories.length; i++) {
          setProgress({ currentPage: i + 1, totalPages: existingKbCategories.length, currentStep: `Removing KB category "${existingKbCategories[i].name}"...` });
          await deleteKbCategory.mutateAsync(existingKbCategories[i].id);
        }
      }

      // Delete existing products
      if (opts.products && existingProducts && existingProducts.length > 0) {
        setProgress({ currentPage: 0, totalPages: existingProducts.length, currentStep: 'Clearing existing products...' });
        for (let i = 0; i < existingProducts.length; i++) {
          setProgress({ currentPage: i + 1, totalPages: existingProducts.length, currentStep: `Removing product "${existingProducts[i].name}"...` });
          await deleteProduct.mutateAsync(existingProducts[i].id);
        }
      }

      // Apply branding
      if (opts.branding) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Applying branding...' });
        await updateBranding.mutateAsync(template.branding);
      }

      // Apply chat settings
      if (opts.chatSettings) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Configuring AI chat...' });
        await updateChat.mutateAsync(template.chatSettings as any);
      }

      // Apply header settings
      if (opts.headerSettings && template.headerSettings) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Applying header...' });
        await updateHeader.mutateAsync(template.headerSettings as any);
      }

      // Apply footer settings
      if (opts.footerSettings) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Applying footer...' });
        await updateFooter.mutateAsync(template.footerSettings as any);
      }

      // Apply SEO settings
      if (opts.seoSettings) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Configuring SEO...' });
        await updateSeo.mutateAsync(template.seoSettings as any);
      }

      // Apply AEO settings
      if (opts.seoSettings && template.aeoSettings) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Configuring AEO...' });
        await updateAeo.mutateAsync(template.aeoSettings as any);
      }

      // Apply cookie banner
      if (opts.cookieBannerSettings) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Configuring cookies...' });
        await updateCookieBanner.mutateAsync(template.cookieBannerSettings as any);
      }

      // Set homepage
      if (opts.pages) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Finalizing...' });
        await updateGeneral.mutateAsync({
          homepageSlug: template.siteSettings.homepageSlug,
          selectedTemplate: template.id,
        });
      }

      // Create products
      if (opts.products) {
        const productsToCreate = templateProducts || [];
        for (let i = 0; i < productsToCreate.length; i++) {
          const product = productsToCreate[i];
          setProgress({ currentPage: i + 1, totalPages: productsToCreate.length, currentStep: `Creating product "${product.name}"...` });
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

      // Seed consultant profiles
      if (template.consultants?.length) {
        const consultants = template.consultants;
        setProgress({ currentPage: 0, totalPages: consultants.length, currentStep: 'Seeding consultant profiles...' });
        for (let i = 0; i < consultants.length; i++) {
          const c = consultants[i];
          setProgress({ currentPage: i + 1, totalPages: consultants.length, currentStep: `Adding consultant "${c.name}"...` });
          await supabase.from('consultant_profiles').insert({
            name: c.name, title: c.title, summary: c.summary, bio: c.bio || null,
            skills: c.skills, experience_years: c.experience_years,
            certifications: c.certifications || [], languages: c.languages || ['English'],
            availability: c.availability, hourly_rate_cents: c.hourly_rate_cents || null,
            currency: c.currency || 'USD', avatar_url: c.avatar_url || null,
            linkedin_url: c.linkedin_url || null, is_active: c.is_active ?? true,
          });
        }
      }

      // Create blog posts
      if (opts.blogPosts) {
        const postsToCreate = templateBlogPosts || [];
        for (let i = 0; i < postsToCreate.length; i++) {
          const post = postsToCreate[i];
          setProgress({ currentPage: i + 1, totalPages: postsToCreate.length, currentStep: `Creating blog post "${post.title}"...` });
          await createBlogPost.mutateAsync({
            title: post.title, slug: post.slug, excerpt: post.excerpt,
            featured_image: post.featured_image, content: post.content,
            meta: post.meta, status: opts.publishBlogPosts ? 'published' : 'draft',
          });
        }
      }

      // Create KB categories and articles
      let totalKbArticles = 0;
      if (opts.kbContent) {
        const kbCategories = template.kbCategories || [];
        for (let i = 0; i < kbCategories.length; i++) {
          const category = kbCategories[i];
          setProgress({ currentPage: i + 1, totalPages: kbCategories.length, currentStep: `Creating KB category "${category.name}"...` });
          const createdCategory = await createKbCategory.mutateAsync({
            name: category.name, slug: category.slug, description: category.description,
            icon: category.icon, is_active: true,
          });
          for (const article of category.articles) {
            const answerJson = createDocumentFromText(article.answer_text);
            await createKbArticle.mutateAsync({
              category_id: createdCategory.id, title: article.title, slug: article.slug,
              question: article.question, answer_json: answerJson as any,
              answer_text: article.answer_text, is_published: opts.publishKbArticles,
              is_featured: article.is_featured, include_in_chat: article.include_in_chat,
            });
            totalKbArticles++;
          }
        }
      }

      // Bootstrap FlowPilot
      try {
        setProgress({ currentPage: 1, totalPages: 1, currentStep: 'Bootstrapping FlowPilot...' });
        if (opts.resetObjectives) {
          await supabase.from('agent_objectives').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }
        await supabase.functions.invoke('setup-flowpilot', {
          body: {
            template_flowpilot: opts.resetObjectives ? (template.flowpilot || {}) : { ...template.flowpilot, objectives: [] },
            template_id: template.id,
            template_name: template.name,
          },
        });
        logger.log('[TemplateInstaller] FlowPilot bootstrapped for template:', template.id);
      } catch (fpError) {
        logger.warn('[TemplateInstaller] FlowPilot bootstrap failed (non-fatal):', fpError);
      }

      setCreatedPageIds(pageIds);
      setStep('done');

      const appliedPagesCount = opts.pages ? template.pages.length : 0;
      const appliedBlogCount = opts.blogPosts ? (templateBlogPosts?.length || 0) : 0;
      const appliedProductCount = opts.products ? (templateProducts?.length || 0) : 0;
      const moduleCount = template.requiredModules?.length || 0;

      let description = appliedPagesCount > 0 ? `Created ${appliedPagesCount} pages` : 'Applied settings';
      if (appliedProductCount > 0) description += `, ${appliedProductCount} products`;
      if (appliedBlogCount > 0) description += `, ${appliedBlogCount} blog posts`;
      if (totalKbArticles > 0) description += `, ${totalKbArticles} KB articles`;
      if (moduleCount > 0) description += `. Enabled ${moduleCount} modules`;
      description += '. FlowPilot initialized.';

      await queryClient.invalidateQueries({ queryKey: ['pages'] });
      await queryClient.invalidateQueries({ queryKey: ['deleted-pages'] });
      await queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      await queryClient.invalidateQueries({ queryKey: ['kb-categories'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['site-settings'] });

      toast({ title: 'Template applied!', description });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to apply template. Some changes may have been applied.', variant: 'destructive' });
      setStep('idle');
    }
  }, [existingPages, deletedPages, existingBlogPosts, existingKbCategories, existingProducts, mediaCount, currentModules]);

  const reset = useCallback(() => {
    setStep('idle');
    setProgress({ currentPage: 0, totalPages: 0, currentStep: '' });
    setCreatedPageIds([]);
  }, []);

  const progressPercent = progress.totalPages > 0
    ? (progress.currentPage / (progress.totalPages + 2)) * 100
    : 0;

  return {
    step,
    progress,
    progressPercent,
    createdPageIds,
    existingContent,
    hasExistingContent,
    install,
    reset,
  };
}
