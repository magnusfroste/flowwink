import { useState, useMemo } from 'react';
import { 
  FileText, 
  Palette, 
  MessageSquare, 
  Settings, 
  Cookie, 
  Search, 
  Newspaper, 
  BookOpen, 
  Package,
  ArrowRight,
  Check,
  X,
  AlertTriangle,
  Eye
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { StarterTemplate } from '@/data/starter-templates';
import { cn } from '@/lib/utils';

export interface TemplateOverwriteOptions {
  pages: boolean;
  branding: boolean;
  chatSettings: boolean;
  footerSettings: boolean;
  seoSettings: boolean;
  cookieBannerSettings: boolean;
  blogPosts: boolean;
  kbContent: boolean;
  products: boolean;
  modules: boolean;
}

interface ExistingContent {
  pagesCount: number;
  blogPostsCount: number;
  kbCategoriesCount: number;
  productsCount: number;
  hasBranding: boolean;
  hasChatSettings: boolean;
  hasFooter: boolean;
  hasSeo: boolean;
  hasCookieBanner: boolean;
}

interface TemplatePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: StarterTemplate;
  existingContent: ExistingContent;
  onApply: (options: TemplateOverwriteOptions) => void;
}

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  templateValue: string | number;
  existingValue: string | number;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  hasExisting: boolean;
}

function SettingRow({ icon, label, templateValue, existingValue, enabled, onToggle, hasExisting }: SettingRowProps) {
  const willOverwrite = hasExisting && enabled;
  
  return (
    <div className={cn(
      "flex items-center justify-between py-3 px-4 rounded-lg transition-colors",
      enabled ? "bg-primary/5" : "bg-muted/30"
    )}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={cn(
          "p-2 rounded-lg",
          enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Label className="font-medium">{label}</Label>
            {willOverwrite && (
              <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                Replaces existing
              </Badge>
            )}
            {!hasExisting && enabled && (
              <Badge variant="outline" className="text-xs border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                New
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm">
            {hasExisting ? (
              <>
                <span className="text-muted-foreground truncate">{existingValue}</span>
                {enabled && (
                  <>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-primary font-medium truncate">{templateValue}</span>
                  </>
                )}
              </>
            ) : (
              <span className={cn(
                "truncate",
                enabled ? "text-primary font-medium" : "text-muted-foreground"
              )}>{templateValue}</span>
            )}
          </div>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        className="shrink-0 ml-4"
      />
    </div>
  );
}

export function TemplatePreviewDialog({
  open,
  onOpenChange,
  template,
  existingContent,
  onApply
}: TemplatePreviewDialogProps) {
  const [options, setOptions] = useState<TemplateOverwriteOptions>({
    pages: true,
    branding: true,
    chatSettings: true,
    footerSettings: true,
    seoSettings: true,
    cookieBannerSettings: true,
    blogPosts: !!template.blogPosts?.length,
    kbContent: !!template.kbCategories?.length,
    products: !!template.products?.length,
    modules: !!template.requiredModules?.length,
  });

  const updateOption = (key: keyof TemplateOverwriteOptions, value: boolean) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  // Count what will be overwritten
  const stats = useMemo(() => {
    let overwriteCount = 0;
    let newCount = 0;
    
    if (options.pages) {
      if (existingContent.pagesCount > 0) overwriteCount++;
      else newCount++;
    }
    if (options.branding) {
      if (existingContent.hasBranding) overwriteCount++;
      else newCount++;
    }
    if (options.chatSettings) {
      if (existingContent.hasChatSettings) overwriteCount++;
      else newCount++;
    }
    if (options.footerSettings) {
      if (existingContent.hasFooter) overwriteCount++;
      else newCount++;
    }
    if (options.seoSettings) {
      if (existingContent.hasSeo) overwriteCount++;
      else newCount++;
    }
    if (options.cookieBannerSettings) {
      if (existingContent.hasCookieBanner) overwriteCount++;
      else newCount++;
    }
    if (options.blogPosts && template.blogPosts?.length) {
      if (existingContent.blogPostsCount > 0) overwriteCount++;
      else newCount++;
    }
    if (options.kbContent && template.kbCategories?.length) {
      if (existingContent.kbCategoriesCount > 0) overwriteCount++;
      else newCount++;
    }
    if (options.products && template.products?.length) {
      if (existingContent.productsCount > 0) overwriteCount++;
      else newCount++;
    }
    
    return { overwriteCount, newCount };
  }, [options, existingContent, template]);

  const handleApply = () => {
    onApply(options);
    onOpenChange(false);
  };

  const handleSelectAll = () => {
    setOptions({
      pages: true,
      branding: true,
      chatSettings: true,
      footerSettings: true,
      seoSettings: true,
      cookieBannerSettings: true,
      blogPosts: !!template.blogPosts?.length,
      kbContent: !!template.kbCategories?.length,
      products: !!template.products?.length,
      modules: !!template.requiredModules?.length,
    });
  };

  const handleSelectNone = () => {
    setOptions({
      pages: false,
      branding: false,
      chatSettings: false,
      footerSettings: false,
      seoSettings: false,
      cookieBannerSettings: false,
      blogPosts: false,
      kbContent: false,
      products: false,
      modules: false,
    });
  };

  // Check if anything is selected
  const hasSelection = Object.values(options).some(v => v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Review Changes: {template.name}
          </DialogTitle>
          <DialogDescription>
            Choose which settings to apply. Toggle off any settings you want to keep as-is.
          </DialogDescription>
        </DialogHeader>

        {/* Quick actions */}
        <div className="flex items-center gap-2 pb-2">
          <Button variant="outline" size="sm" onClick={handleSelectAll} className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={handleSelectNone} className="gap-1.5">
            <X className="h-3.5 w-3.5" />
            Deselect All
          </Button>
          
          {/* Stats badges */}
          <div className="flex-1" />
          {stats.newCount > 0 && (
            <Badge variant="outline" className="text-xs border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              {stats.newCount} new
            </Badge>
          )}
          {stats.overwriteCount > 0 && (
            <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
              {stats.overwriteCount} replacing
            </Badge>
          )}
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-2">
            {/* Pages */}
            <SettingRow
              icon={<FileText className="h-4 w-4" />}
              label="Pages"
              templateValue={`${template.pages.length} pages`}
              existingValue={`${existingContent.pagesCount} pages`}
              enabled={options.pages}
              onToggle={(v) => updateOption('pages', v)}
              hasExisting={existingContent.pagesCount > 0}
            />

            {/* Branding */}
            <SettingRow
              icon={<Palette className="h-4 w-4" />}
              label="Branding & Colors"
              templateValue={`${template.branding.headingFont || 'Default'} / ${template.branding.bodyFont || 'Default'}`}
              existingValue="Custom branding"
              enabled={options.branding}
              onToggle={(v) => updateOption('branding', v)}
              hasExisting={existingContent.hasBranding}
            />

            {/* Chat Settings */}
            <SettingRow
              icon={<MessageSquare className="h-4 w-4" />}
              label="AI Chat Settings"
              templateValue={template.chatSettings?.enabled ? 'Enabled' : 'Disabled'}
              existingValue="Custom settings"
              enabled={options.chatSettings}
              onToggle={(v) => updateOption('chatSettings', v)}
              hasExisting={existingContent.hasChatSettings}
            />

            {/* Footer */}
            <SettingRow
              icon={<Settings className="h-4 w-4" />}
              label="Footer"
              templateValue="Template footer"
              existingValue="Custom footer"
              enabled={options.footerSettings}
              onToggle={(v) => updateOption('footerSettings', v)}
              hasExisting={existingContent.hasFooter}
            />

            {/* SEO */}
            <SettingRow
              icon={<Search className="h-4 w-4" />}
              label="SEO Settings"
              templateValue="Template SEO"
              existingValue="Custom SEO"
              enabled={options.seoSettings}
              onToggle={(v) => updateOption('seoSettings', v)}
              hasExisting={existingContent.hasSeo}
            />

            {/* Cookie Banner */}
            <SettingRow
              icon={<Cookie className="h-4 w-4" />}
              label="Cookie Banner"
              templateValue="Template settings"
              existingValue="Custom settings"
              enabled={options.cookieBannerSettings}
              onToggle={(v) => updateOption('cookieBannerSettings', v)}
              hasExisting={existingContent.hasCookieBanner}
            />

            {/* Blog Posts - only show if template has them */}
            {template.blogPosts && template.blogPosts.length > 0 && (
              <SettingRow
                icon={<Newspaper className="h-4 w-4" />}
                label="Blog Posts"
                templateValue={`${template.blogPosts.length} posts`}
                existingValue={`${existingContent.blogPostsCount} posts`}
                enabled={options.blogPosts}
                onToggle={(v) => updateOption('blogPosts', v)}
                hasExisting={existingContent.blogPostsCount > 0}
              />
            )}

            {/* KB Content - only show if template has it */}
            {template.kbCategories && template.kbCategories.length > 0 && (
              <SettingRow
                icon={<BookOpen className="h-4 w-4" />}
                label="Knowledge Base"
                templateValue={`${template.kbCategories.length} categories`}
                existingValue={`${existingContent.kbCategoriesCount} categories`}
                enabled={options.kbContent}
                onToggle={(v) => updateOption('kbContent', v)}
                hasExisting={existingContent.kbCategoriesCount > 0}
              />
            )}

            {/* Products - only show if template has them */}
            {template.products && template.products.length > 0 && (
              <SettingRow
                icon={<Package className="h-4 w-4" />}
                label="Products"
                templateValue={`${template.products.length} products`}
                existingValue={`${existingContent.productsCount} products`}
                enabled={options.products}
                onToggle={(v) => updateOption('products', v)}
                hasExisting={existingContent.productsCount > 0}
              />
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Warning if overwriting */}
        {stats.overwriteCount > 0 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm">
              {stats.overwriteCount} existing {stats.overwriteCount === 1 ? 'setting' : 'settings'} will be replaced. This cannot be undone.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!hasSelection} className="gap-2">
            <Check className="h-4 w-4" />
            Apply {hasSelection ? `${stats.newCount + stats.overwriteCount} Settings` : 'Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
