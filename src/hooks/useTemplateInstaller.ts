import { logger } from '@/lib/logger';
import { toastSilencer } from '@/lib/toast-silencer';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { extractImagesFromTemplate, updateBlockAtPath, isLocalTemplateImage } from '@/lib/image-extraction';
import { supabase } from '@/integrations/supabase/client';
import { topUpLocalePackSeeds } from '@/hooks/useTenantLocalePack';
import { packForCountry } from '@/lib/locale-packs';
import { createDocumentFromText } from '@/lib/tiptap-utils';
import type { ContentBlock } from '@/types/cms';
import type { Json } from '@/integrations/supabase/types';

export type InstallStep = 'idle' | 'creating' | 'done';

/**
 * ── Clearing a table you can only see 1000 rows of ──────────────────────────
 *
 * The no-manifest path ("clean install") used to delete exactly what the page's
 * React Query caches happened to hold — `existingPages`, `existingBlogPosts`,
 * `existingKbCategories`, `existingProducts`. Every one of those reads is an
 * unbounded PostgREST select, which stops at 1000 rows without a word. On a
 * site with 1400 pages the installer removed 1000, left 400 standing, and
 * reported a clean install. The new template then landed on top of the
 * survivors, and the leftovers are indistinguishable afterwards from content
 * someone meant to keep.
 *
 * Cure 1 — delete server-side without reading — is not available: each delete
 * runs through a hook that also writes an audit_logs row, and a bulk
 * `.delete().neq(id, ...)` would erase the trail of what was removed. Cure 2 is
 * meaningless here; the question has no key set, it is "everything".
 *
 * So: drain. Ask for one bounded page of ids, delete them, ask again, and stop
 * when the table answers with nothing. Deleting shrinks the population, so the
 * loop terminates on its own and never needs an offset that rows could slip
 * past. The two ways it can fail to terminate — a delete that RLS silently
 * refuses (200 with no rows, no throw), or a table growing faster than we
 * empty it — are caught by the round ceiling, and then the caller is TOLD
 * rather than congratulated.
 */
const DRAIN_PAGE = 500;
const DRAIN_MAX_ROUNDS = 40; // 20 000 rows; past that, say so instead of spinning.

interface DrainResult {
  removed: number;
  /** True when the table was not empty when we stopped. Never report success. */
  leftovers: boolean;
}

async function drainDelete(
  label: string,
  /** One bounded page of ids. MUST carry its own `.limit()`. */
  fetchPage: () => Promise<string[]>,
  deleteOne: (id: string) => Promise<void>,
  onRemoved: (removed: number) => void,
): Promise<DrainResult> {
  let removed = 0;
  for (let round = 0; round < DRAIN_MAX_ROUNDS; round++) {
    let ids: string[];
    try {
      ids = await fetchPage();
    } catch (e) {
      logger.warn(`[TemplateInstaller] Could not list remaining ${label}:`, e);
      return { removed, leftovers: true };
    }
    if (ids.length === 0) return { removed, leftovers: false };

    let progressed = false;
    for (const id of ids) {
      try {
        await deleteOne(id);
        removed++;
        progressed = true;
        onRemoved(removed);
      } catch (e) {
        logger.warn(`[TemplateInstaller] Could not remove ${label} ${id}:`, e);
      }
    }
    // A whole page that refused to go is a permission wall, not a slow table.
    if (!progressed) {
      logger.warn(`[TemplateInstaller] ${label}: a full page could not be removed — stopping`);
      return { removed, leftovers: true };
    }
  }
  logger.warn(`[TemplateInstaller] ${label}: hit the drain ceiling after ${removed} removed`);
  return { removed, leftovers: true };
}

export interface InstallProgress {
  currentPage: number;
  totalPages: number;
  currentStep: string;
}

export interface TemplateManifest {
  pageIds: string[];
  blogPostIds: string[];
  kbCategoryIds: string[];
  productIds: string[];
  consultantIds: string[];
  bookingServiceIds: string[];
  bookingAvailabilityIds: string[];
}

export function useTemplateInstaller() {
  const [step, setStep] = useState<InstallStep>('idle');
  const [progress, setProgress] = useState<InstallProgress>({ currentPage: 0, totalPages: 0, currentStep: '' });
  const [createdPageIds, setCreatedPageIds] = useState<string[]>([]);
  const [installedTemplate, setInstalledTemplate] = useState<{ template_id: string; template_name: string; manifest: TemplateManifest } | null>(null);

  // Fetch currently installed template on mount
  useEffect(() => {
    supabase.from('installed_template').select('*').order('installed_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setInstalledTemplate({
            template_id: data[0].template_id,
            template_name: data[0].template_name,
            manifest: data[0].manifest as unknown as TemplateManifest,
          });
        }
      });
  }, []);

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

  // The numbers the overwrite dialog quotes back ("1000 pages will be permanently
  // deleted") are the last thing a person reads before an irreversible action, so
  // they are counted server-side rather than by measuring a list that PostgREST
  // may have cut at 1000. `head: true` returns the count and no rows at all.
  const { data: exactCounts } = useQuery({
    queryKey: ['template-installer-content-counts'],
    queryFn: async () => {
      const count = async (table: 'pages' | 'blog_posts' | 'kb_categories' | 'products') => {
        let q = supabase.from(table).select('id', { count: 'exact', head: true });
        if (table === 'pages') q = q.is('deleted_at', null);
        const { count: n, error } = await q;
        // A count we could not take must not read as zero — that is the same
        // silence, one table over. Fall back to "unknown" and let the caller
        // use the cached list length instead.
        if (error) return null;
        return n ?? null;
      };
      const [pages, blogPosts, kbCategories, products] = await Promise.all([
        count('pages'), count('blog_posts'), count('kb_categories'), count('products'),
      ]);
      return { pages, blogPosts, kbCategories, products };
    },
    staleTime: 30_000,
  });

  const existingContent = useMemo(() => ({
    pagesCount: exactCounts?.pages ?? existingPages?.length ?? 0,
    blogPostsCount: exactCounts?.blogPosts ?? existingBlogPosts?.length ?? 0,
    kbCategoriesCount: exactCounts?.kbCategories ?? existingKbCategories?.length ?? 0,
    productsCount: exactCounts?.products ?? existingProducts?.length ?? 0,
    mediaCount: mediaCount || 0,
    hasBranding: !!(existingBranding?.primaryColor || existingBranding?.logo),
    hasChatSettings: !!existingChatSettings?.enabled,
    hasFooter: !!(existingFooter?.data?.email || existingFooter?.data?.phone),
    hasSeo: !!(existingSeo?.siteTitle || existingSeo?.defaultDescription),
    hasCookieBanner: !!existingCookieBanner?.enabled,
  }), [exactCounts, existingPages, existingBlogPosts, existingKbCategories, existingProducts, mediaCount, existingBranding, existingChatSettings, existingFooter, existingSeo, existingCookieBanner]);

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
          if (isLocalTemplateImage(url)) {
            // Local template image: fetch from own origin and upload directly to storage
            const storageUrl = await uploadLocalTemplateImage(url);
            if (storageUrl) {
              urlMap.set(url, storageUrl);
            }
          } else {
            // External URL: use the process-image edge function
            const { data, error } = await supabase.functions.invoke('process-image', {
              body: { imageUrl: url, folder: 'templates' }
            });
            if (error) { logger.warn(`Failed to process image ${url}:`, error); return; }
            if (data.success && data.url) {
              urlMap.set(url, data.url);
            }
          }
        } catch (err) {
          logger.warn(`Error processing image ${url}:`, err);
        }
      }));
    }
    return urlMap;
  };

  const uploadLocalTemplateImage = async (localPath: string): Promise<string | null> => {
    try {
      // Fetch the image from our own origin (public/ folder)
      const response = await fetch(localPath);
      if (!response.ok) {
        logger.warn(`Failed to fetch local image ${localPath}: ${response.status}`);
        return null;
      }
      const blob = await response.blob();
      
      // Generate a storage path
      const fileName = localPath.split('/').pop() || 'image.jpg';
      const storagePath = `templates/${Date.now()}-${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('cms-images')
        .upload(storagePath, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
      
      if (uploadError) {
        logger.warn(`Failed to upload ${localPath} to storage:`, uploadError);
        return null;
      }
      
      const { data: publicUrlData } = supabase.storage
        .from('cms-images')
        .getPublicUrl(storagePath);
      
      return publicUrlData.publicUrl;
    } catch (err) {
      logger.warn(`Error uploading local image ${localPath}:`, err);
      return null;
    }
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
      resetObjectives: false,
      clearMedia: false,
      downloadImages: !!(templateImageInfo && templateImageInfo.uniqueUrls.length > 0),
      publishPages: true,
      publishBlogPosts: true,
      publishKbArticles: true,
    };

    setStep('creating');
    const pageIds: string[] = [];
    /** Content types the clean-install path could not empty. Must reach the user. */
    let cleanInstallLeftovers: string[] = [];

    toastSilencer.silent = true;
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
        // '*' = every module the instance knows. The demo template's list used
        // to name modules one by one, so the demo was silently capped at
        // whatever subset existed when the list was last touched — a template
        // whose point is the full surface must not carry a snapshot of it.
        const wanted = template.requiredModules.includes('*' as never)
          ? (Object.keys(updatedModules) as (keyof ModulesSettings)[])
          : template.requiredModules;
        for (const moduleId of wanted) {
          if (updatedModules[moduleId]) {
            updatedModules[moduleId] = { ...updatedModules[moduleId], enabled: true };
          }
        }
        await updateModules.mutateAsync(updatedModules);
      }

      // Auto-cleanup previous template using manifest
      if (installedTemplate?.manifest) {
        const m = installedTemplate.manifest;
        const totalCleanup = (m.pageIds?.length || 0) + (m.blogPostIds?.length || 0) + (m.kbCategoryIds?.length || 0) + (m.productIds?.length || 0) + (m.consultantIds?.length || 0) + (m.bookingServiceIds?.length || 0) + (m.bookingAvailabilityIds?.length || 0);
        if (totalCleanup > 0) {
          setProgress({ currentPage: 0, totalPages: totalCleanup, currentStep: `Uninstalling "${installedTemplate.template_name}"...` });
          let cleaned = 0;

          // Remove pages created by previous template
          for (const pageId of (m.pageIds || [])) {
            setProgress({ currentPage: ++cleaned, totalPages: totalCleanup, currentStep: 'Removing previous template pages...' });
            try { await permanentDeletePage.mutateAsync(pageId); } catch { /* already deleted */ }
          }

          // Remove blog posts
          for (const postId of (m.blogPostIds || [])) {
            setProgress({ currentPage: ++cleaned, totalPages: totalCleanup, currentStep: 'Removing previous template blog posts...' });
            try { await deleteBlogPost.mutateAsync(postId); } catch { /* already deleted */ }
          }

          // Remove KB categories
          for (const catId of (m.kbCategoryIds || [])) {
            setProgress({ currentPage: ++cleaned, totalPages: totalCleanup, currentStep: 'Removing previous template KB content...' });
            try { await deleteKbCategory.mutateAsync(catId); } catch { /* already deleted */ }
          }

          // Remove products
          for (const prodId of (m.productIds || [])) {
            setProgress({ currentPage: ++cleaned, totalPages: totalCleanup, currentStep: 'Removing previous template products...' });
            try { await deleteProduct.mutateAsync(prodId); } catch { /* already deleted */ }
          }

          // Remove consultants
          for (const conId of (m.consultantIds || [])) {
            setProgress({ currentPage: ++cleaned, totalPages: totalCleanup, currentStep: 'Removing previous template consultants...' });
            try {
              // supabase-js reports failures in `error`, not by throwing, and an
              // RLS-denied delete answers 200 with 0 rows — the bare catch swallowed
              // both, so leftovers looked like a clean uninstall.
              const { data: removed, error: conErr } = await supabase
                .from('consultant_profiles').delete().eq('id', conId).select('id');
              if (conErr) logger.warn(`[TemplateInstaller] Could not remove consultant ${conId}: ${conErr.message}`);
              else if (!removed?.length) logger.warn(`[TemplateInstaller] Consultant ${conId} was not removed — no permission, or already gone`);
            } catch (e) { logger.warn(`[TemplateInstaller] Consultant ${conId} cleanup failed`, e); }
          }

          // Remove booking availability (before services due to FK)
          for (const availId of (m.bookingAvailabilityIds || [])) {
            setProgress({ currentPage: ++cleaned, totalPages: totalCleanup, currentStep: 'Removing previous template booking availability...' });
            try { await supabase.from('booking_availability').delete().eq('id', availId); } catch { /* already deleted */ }
          }

          // Remove booking services
          for (const svcId of (m.bookingServiceIds || [])) {
            setProgress({ currentPage: ++cleaned, totalPages: totalCleanup, currentStep: 'Removing previous template booking services...' });
            try { await supabase.from('booking_services').delete().eq('id', svcId); } catch { /* already deleted */ }
          }

          // Remove old manifest record
          await supabase.from('installed_template').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          logger.log(`[TemplateInstaller] Uninstalled previous template "${installedTemplate.template_name}" (${totalCleanup} resources)`);
        }
      } else {
        // No manifest — clear all existing content (first install or legacy).
        //
        // Sourced from the database each round, not from the page's caches: the
        // caches are the unbounded reads that made "clean" mean "the first 1000".
        // See drainDelete above for why this shape and not a bulk delete.
        const drains: Array<{ label: string; result: DrainResult }> = [];

        if (opts.pages) {
          setProgress({ currentPage: 0, totalPages: existingContent.pagesCount, currentStep: 'Clearing existing pages...' });
          const r = await drainDelete(
            'pages',
            async () => {
              const { data, error } = await supabase
                .from('pages').select('id').is('deleted_at', null).limit(DRAIN_PAGE);
              if (error) throw error;
              return (data ?? []).map((p) => p.id);
            },
            (id) => permanentDeletePage.mutateAsync(id),
            (removed) => setProgress({
              currentPage: removed,
              totalPages: Math.max(existingContent.pagesCount, removed),
              currentStep: `Removing existing pages (${removed})...`,
            }),
          );
          drains.push({ label: 'pages', result: r });
        }
        if (opts.blogPosts) {
          const r = await drainDelete(
            'blog posts',
            async () => {
              const { data, error } = await supabase.from('blog_posts').select('id').limit(DRAIN_PAGE);
              if (error) throw error;
              return (data ?? []).map((p) => p.id);
            },
            (id) => deleteBlogPost.mutateAsync(id),
            () => {},
          );
          drains.push({ label: 'blog posts', result: r });
        }
        if (opts.kbContent) {
          const r = await drainDelete(
            'KB categories',
            async () => {
              const { data, error } = await supabase.from('kb_categories').select('id').limit(DRAIN_PAGE);
              if (error) throw error;
              return (data ?? []).map((c) => c.id);
            },
            (id) => deleteKbCategory.mutateAsync(id),
            () => {},
          );
          drains.push({ label: 'KB categories', result: r });
        }
        if (opts.products) {
          const r = await drainDelete(
            'products',
            async () => {
              const { data, error } = await supabase.from('products').select('id').limit(DRAIN_PAGE);
              if (error) throw error;
              return (data ?? []).map((p) => p.id);
            },
            (id) => deleteProduct.mutateAsync(id),
            () => {},
          );
          drains.push({ label: 'products', result: r });
        }

        // What survived has to reach the person who asked for a clean install —
        // the template is about to be written on top of it, and afterwards there
        // is no way to tell leftovers from content someone kept on purpose.
        cleanInstallLeftovers = drains.filter((d) => d.result.leftovers).map((d) => d.label);
        if (cleanInstallLeftovers.length > 0) {
          logger.warn('[TemplateInstaller] Clean install did not empty:', cleanInstallLeftovers.join(', '));
        }
      }

      // Clean up trashed pages with conflicting slugs
      if (opts.pages && deletedPages && deletedPages.length > 0) {
        const templateSlugs = new Set(template.pages.map(p => p.slug));
        const conflicting = deletedPages.filter(p => templateSlugs.has(p.slug));
        for (const page of conflicting) {
          try { await permanentDeletePage.mutateAsync(page.id); } catch { /* already deleted */ }
        }
      }

      if (opts.branding) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Applying branding...' });
        await updateBranding.mutateAsync(template.branding);
      }

      // Apply chat settings
      if (opts.chatSettings && template.chatSettings) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Configuring AI chat...' });
        const { defaultChatSettings } = await import('@/hooks/useSiteSettings');
        await updateChat.mutateAsync({ ...defaultChatSettings, ...template.chatSettings } as any);
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

      // Apply cookie banner (merge with defaults so partial template settings don't erase text)
      if (opts.cookieBannerSettings && template.cookieBannerSettings) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Configuring cookies...' });
        const cookieDefaults = {
          enabled: true,
          title: 'We use cookies',
          description: 'We use cookies to improve your experience on our website, analyze traffic, and personalize content. By clicking "Accept all", you consent to our use of cookies.',
          policyLinkText: 'Read our Privacy Policy',
          policyLinkUrl: '/privacy-policy',
          acceptButtonText: 'Accept all',
          rejectButtonText: 'Essential only',
        };
        await updateCookieBanner.mutateAsync({ ...cookieDefaults, ...template.cookieBannerSettings } as any);
      }

      // Create pages
      if (opts.pages) {
        const pagesToCreate = templatePages;
        setProgress({ currentPage: 0, totalPages: pagesToCreate.length, currentStep: 'Creating pages...' });
        for (let i = 0; i < pagesToCreate.length; i++) {
          const page = pagesToCreate[i];
          setProgress({ currentPage: i + 1, totalPages: pagesToCreate.length, currentStep: `Creating page "${page.title}"...` });
          const created = await createPage.mutateAsync({
            title: page.title,
            slug: page.slug,
            content: (page.blocks || []) as unknown as ContentBlock[],
            meta: page.meta || {},
            menu_order: page.menu_order || i,
            show_in_menu: page.showInMenu ?? true,
            status: opts.publishPages ? 'published' : 'draft',
          });
          if (created?.id) pageIds.push(created.id);
        }
      }

      // Set homepage
      if (opts.pages) {
        setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Finalizing...' });
        await updateGeneral.mutateAsync({
          homepageSlug: template.siteSettings.homepageSlug,
          selectedTemplate: template.id,
        });
      }

      // Activate an accounting locale — the install is where the default
      // choice lives (the WordPress-installer model), the engine stays
      // empty-until-chosen. Precedence is the Odoo model: existing choice >
      // the BUSINESS's country > the template's default. Content and
      // jurisdiction are different axes — a German customer may want this
      // template but needs German books. INSERT-if-absent only: switching
      // templates must never flip the books of a tenant who already picked.
      {
        const { data: generalRow } = await supabase
          .from('site_settings').select('value').eq('key', 'general').maybeSingle();
        const businessCountry = (generalRow?.value as any)?.country as string | undefined;
        const localeToActivate =
          packForCountry(businessCountry)?.id ?? template.accountingLocale ?? null;

        const { data: existing } = await supabase
          .from('site_settings')
          .select('key')
          .eq('key', 'accounting_locale')
          .maybeSingle();
        if (localeToActivate && !existing) {
          setProgress({ currentPage: 0, totalPages: 1, currentStep: 'Activating accounting locale...' });
          const { error: locErr } = await supabase
            .from('site_settings')
            .insert({ key: 'accounting_locale', value: localeToActivate as unknown as Json });
          if (locErr) {
            logger.error('[template-install] locale activation failed', locErr);
          } else {
            try {
              await topUpLocalePackSeeds(localeToActivate);
            } catch (seedErr) {
              // The choice is recorded; the admin-boot top-up retries seeding.
              logger.error('[template-install] locale seed failed', seedErr);
            }
          }
        }
      }

      // Create products + stock
      const createdProductIds: string[] = [];
      if (opts.products) {
        const productsToCreate = templateProducts || [];
        for (let i = 0; i < productsToCreate.length; i++) {
          const product = productsToCreate[i];
          setProgress({ currentPage: i + 1, totalPages: productsToCreate.length, currentStep: `Creating product "${product.name}"...` });
          const created = await createProduct.mutateAsync({
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
          if (created?.id) {
            createdProductIds.push(created.id);
            // Seed stock if template provides it
            if (product.stock) {
              try {
                await supabase.from('product_stock').insert({
                  product_id: created.id,
                  quantity_on_hand: product.stock.quantity_on_hand,
                  reorder_point: product.stock.reorder_point ?? 0,
                });
                // Mirror to products.stock_quantity + enable tracking so the
                // public storefront shows "In stock" badges and the
                // order_item trigger keeps the mirror in sync on each sale.
                const { data: mirrored, error: mirrorError } = await supabase.from('products').update({
                  track_inventory: true,
                  stock_quantity: product.stock.quantity_on_hand,
                  low_stock_threshold: product.stock.reorder_point ?? 5,
                }).eq('id', created.id).select('id');
                // Best-effort, but never silent: an RLS-denied update returns
                // success with 0 rows and the storefront badge quietly goes missing.
                if (mirrorError) {
                  logger.warn(`Stock mirror update failed for product ${created.id}:`, mirrorError);
                } else if (!mirrored?.length) {
                  logger.warn(`Stock mirror update matched 0 rows for product ${created.id} — no permission, or it is gone`);
                }
              } catch { /* non-fatal — stock seeding is best-effort */ }
            }
          }
        }
      }

      // Seed consultant profiles
      const createdConsultantIds: string[] = [];
      if (template.consultants?.length) {
        const consultants = template.consultants;
        setProgress({ currentPage: 0, totalPages: consultants.length, currentStep: 'Seeding consultant profiles...' });
        for (let i = 0; i < consultants.length; i++) {
          const c = consultants[i];
          setProgress({ currentPage: i + 1, totalPages: consultants.length, currentStep: `Adding consultant "${c.name}"...` });
          const { data, error: consErr } = await supabase.from('consultant_profiles').insert({
            name: c.name, title: c.title, summary: c.summary, bio: c.bio || null,
            skills: c.skills, experience_years: c.experience_years,
            certifications: c.certifications || [], languages: c.languages || ['English'],
            availability: c.availability, hourly_rate_cents: c.hourly_rate_cents || null,
            currency: c.currency || undefined, avatar_url: c.avatar_url || null,
            linkedin_url: c.linkedin_url || null, is_active: c.is_active ?? true,
          }).select('id').single();
          if (consErr) logger.error(`[template-install] consultant "${c.name}" was not created`, consErr);
          if (data?.id) createdConsultantIds.push(data.id);
        }
      }

      // Seed booking services and availability
      const createdBookingServiceIds: string[] = [];
      const createdBookingAvailabilityIds: string[] = [];
      if (template.bookingServices?.length) {
        const services = template.bookingServices;
        setProgress({ currentPage: 0, totalPages: services.length, currentStep: 'Seeding booking services...' });
        for (let i = 0; i < services.length; i++) {
          const s = services[i];
          setProgress({ currentPage: i + 1, totalPages: services.length, currentStep: `Adding booking service "${s.name}"...` });
          const { data, error: svcErr } = await supabase.from('booking_services').insert({
            name: s.name, description: s.description || null,
            duration_minutes: s.duration_minutes, price_cents: s.price_cents,
            currency: s.currency, color: s.color || '#3b82f6',
            is_active: s.is_active ?? true, sort_order: i,
          }).select('id').single();
          if (svcErr) logger.error(`[template-install] booking service "${s.name}" was not created`, svcErr);
          if (data?.id) createdBookingServiceIds.push(data.id);
        }
      }
      if (template.bookingAvailability?.length) {
        const slots = template.bookingAvailability;
        setProgress({ currentPage: 0, totalPages: slots.length, currentStep: 'Seeding booking availability...' });
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          setProgress({ currentPage: i + 1, totalPages: slots.length, currentStep: `Adding availability slot ${i + 1}...` });
          const { data, error: availErr } = await supabase.from('booking_availability').insert({
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_active: slot.is_active ?? true,
          }).select('id').single();
          if (availErr) logger.error('[template-install] availability slot was not created', availErr);
          if (data?.id) createdBookingAvailabilityIds.push(data.id);
        }
      }
      const createdBlogPostIds: string[] = [];
      if (opts.blogPosts) {
        const postsToCreate = templateBlogPosts || [];
        for (let i = 0; i < postsToCreate.length; i++) {
          const post = postsToCreate[i];
          setProgress({ currentPage: i + 1, totalPages: postsToCreate.length, currentStep: `Creating blog post "${post.title}"...` });
          const created = await createBlogPost.mutateAsync({
            title: post.title, slug: post.slug, excerpt: post.excerpt,
            featured_image: post.featured_image, content: post.content,
            meta: post.meta, status: opts.publishBlogPosts ? 'published' : 'draft',
          });
          if (created?.id) createdBlogPostIds.push(created.id);
        }
      }

      // Create KB categories and articles
      const createdKbCategoryIds: string[] = [];
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
          createdKbCategoryIds.push(createdCategory.id);
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

      // FlowPilot is an opt-in module — bootstrapped automatically via useFlowPilotBootstrap when enabled.
      // Templates no longer seed FlowPilot objectives, automations, or workflows.

      // Save installation manifest for future cleanup
      const manifest: TemplateManifest = {
        pageIds,
        blogPostIds: createdBlogPostIds,
        kbCategoryIds: createdKbCategoryIds,
        productIds: createdProductIds,
        consultantIds: createdConsultantIds,
        bookingServiceIds: createdBookingServiceIds,
        bookingAvailabilityIds: createdBookingAvailabilityIds,
      };
      await supabase.from('installed_template').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('installed_template').insert({
        template_id: template.id,
        template_name: template.name,
        manifest: manifest as any,
      });
      setInstalledTemplate({ template_id: template.id, template_name: template.name, manifest });
      logger.log('[TemplateInstaller] Saved manifest:', manifest);

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
      description += '.';

      await queryClient.invalidateQueries({ queryKey: ['pages'] });
      await queryClient.invalidateQueries({ queryKey: ['deleted-pages'] });
      await queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      await queryClient.invalidateQueries({ queryKey: ['kb-categories'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['site-settings'] });

      toastSilencer.silent = false;
      // "Template applied!" over an incomplete wipe is the lie this whole change
      // is about. If anything survived, the headline says so.
      if (cleanInstallLeftovers.length > 0) {
        toast({
          title: 'Template applied — but the site was not emptied first',
          description:
            `${description} Existing ${cleanInstallLeftovers.join(' and ')} could not be fully removed, ` +
            `so the template is layered on top of them. Check for leftovers before publishing.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Template applied!', description });
      }
    } catch (error) {
      toastSilencer.silent = false;
      toast({ title: 'Error', description: 'Failed to apply template. Some changes may have been applied.', variant: 'destructive' });
      setStep('idle');
    }
  }, [existingContent, existingPages, deletedPages, existingBlogPosts, existingKbCategories, existingProducts, mediaCount, currentModules, installedTemplate]);

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
    installedTemplate,
    install,
    reset,
  };
}
