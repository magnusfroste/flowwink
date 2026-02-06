/**
 * Hook for exporting current site as a template
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  exportSiteAsTemplate, 
  generateTemplateCode, 
  exportTemplateAsJson,
  validateTemplate,
  SiteExportData,
  TemplateMetadata 
} from '@/lib/template-exporter';
import { 
  exportTemplateAsZip, 
  downloadZipBlob,
  ZipExportProgress,
} from '@/lib/template-zip';
import { StarterTemplate } from '@/data/starter-templates';
import { ContentBlock, PageMeta } from '@/types/cms';
import { toast } from 'sonner';

interface ExportResult {
  template: StarterTemplate;
  code: string;
  json: string;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

interface ZipExportState {
  isExporting: boolean;
  progress: ZipExportProgress | null;
}

export function useTemplateExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [zipState, setZipState] = useState<ZipExportState>({
    isExporting: false,
    progress: null,
  });

  const fetchSiteData = async (): Promise<SiteExportData | null> => {
    try {
      // Fetch pages
      const { data: pages, error: pagesError } = await supabase
        .from('pages')
        .select('title, slug, content_json, meta_json, menu_order, show_in_menu, status')
        .eq('status', 'published')
        .order('menu_order');

      if (pagesError) throw pagesError;

      // Fetch site settings
      const { data: settingsRows, error: settingsError } = await supabase
        .from('site_settings')
        .select('key, value');

      if (settingsError) throw settingsError;

      // Parse settings into structured object  
      const settings: SiteExportData['settings'] = {};
      settingsRows?.forEach(row => {
        const key = row.key as string;
        const value = row.value;
        
        switch (key) {
          case 'branding':
            settings.branding = value as unknown as SiteExportData['settings']['branding'];
            break;
          case 'chat':
            settings.chat = value as unknown as SiteExportData['settings']['chat'];
            break;
          case 'footer':
            settings.footer = value as unknown as SiteExportData['settings']['footer'];
            break;
          case 'header':
            settings.header = value as unknown as SiteExportData['settings']['header'];
            break;
          case 'seo':
            settings.seo = value as unknown as SiteExportData['settings']['seo'];
            break;
          case 'cookie_banner':
            settings.cookie_banner = value as unknown as SiteExportData['settings']['cookie_banner'];
            break;
          case 'general':
            settings.general = value as unknown as { homepageSlug: string };
            break;
          case 'modules':
            settings.modules = value as unknown as SiteExportData['settings']['modules'];
            break;
        }
      });

      // Fetch blog posts (optional)
      const { data: blogPosts } = await supabase
        .from('blog_posts')
        .select('title, slug, excerpt, featured_image, featured_image_alt, content_json')
        .eq('status', 'published');

      return {
        pages: (pages || []).map(p => ({
          title: p.title,
          slug: p.slug,
          content_json: (p.content_json as unknown as ContentBlock[]) || [],
          meta_json: (p.meta_json as unknown as PageMeta) || {},
          menu_order: p.menu_order,
          show_in_menu: p.show_in_menu,
          status: p.status,
        })),
        settings,
        blogPosts: blogPosts?.map(bp => ({
          title: bp.title,
          slug: bp.slug,
          excerpt: bp.excerpt || '',
          featured_image: bp.featured_image || undefined,
          featured_image_alt: bp.featured_image_alt || undefined,
          content_json: (bp.content_json as unknown as ContentBlock[]) || [],
        })),
      };
    } catch (error) {
      console.error('Failed to fetch site data:', error);
      toast.error('Failed to fetch site data');
      return null;
    }
  };

  const exportTemplate = async (metadata: TemplateMetadata): Promise<ExportResult | null> => {
    setIsExporting(true);
    try {
      const siteData = await fetchSiteData();
      if (!siteData) {
        setIsExporting(false);
        return null;
      }

      // Generate template
      const template = exportSiteAsTemplate(siteData, metadata);
      
      // Validate
      const validation = validateTemplate(template);
      
      // Generate outputs
      const code = generateTemplateCode(template);
      const json = exportTemplateAsJson(template);

      const result: ExportResult = {
        template,
        code,
        json,
        validation,
      };

      setExportResult(result);
      
      if (validation.valid) {
        toast.success('Template exported successfully!');
      } else {
        toast.warning(`Template exported with ${validation.errors.length} errors`);
      }

      return result;
    } catch (error) {
      console.error('Template export failed:', error);
      toast.error('Failed to export template');
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  const downloadJson = (template: StarterTemplate) => {
    const json = exportTemplateAsJson(template);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.id}-template.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Template JSON downloaded');
  };

  const downloadCode = (template: StarterTemplate) => {
    const code = generateTemplateCode(template);
    const blob = new Blob([code], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.id}-template.ts`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Template TypeScript code downloaded');
  };

  const copyToClipboard = async (content: string, type: 'json' | 'code') => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(`${type === 'json' ? 'JSON' : 'TypeScript code'} copied to clipboard`);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  /**
   * Export template as ZIP file with all referenced images
   */
  const exportAsZip = async (template: StarterTemplate): Promise<void> => {
    setZipState({ isExporting: true, progress: null });
    
    try {
      const result = await exportTemplateAsZip(template, (progress) => {
        setZipState({ isExporting: true, progress });
      });
      
      if (result.success && result.blob) {
        downloadZipBlob(result.blob, `${template.id}-template.zip`);
        toast.success(`Template exported with ${result.imageCount} images`);
      } else {
        toast.error(result.error || 'Failed to create ZIP');
      }
    } catch (error) {
      console.error('ZIP export failed:', error);
      toast.error('Failed to export as ZIP');
    } finally {
      setZipState({ isExporting: false, progress: null });
    }
  };

  return {
    isExporting,
    exportResult,
    exportTemplate,
    downloadJson,
    downloadCode,
    copyToClipboard,
    fetchSiteData,
    // ZIP export
    exportAsZip,
    isZipExporting: zipState.isExporting,
    zipProgress: zipState.progress,
  };
}
