import { useState, useEffect } from "react";
import { StarterTemplate, HelpStyle } from "@/data/starter-templates";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getTemplateThumbnail } from "@/lib/template-helpers";
import { 
  Monitor,
  Tablet,
  Smartphone,
  Sparkles,
  FileText,
  LayoutGrid,
  MessageSquare,
  BookOpen,
  Palette,
  Rocket,
  Building2,
  ShieldCheck,
  Layers,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Home
} from "lucide-react";
import { TemplateBlockPreview } from "./TemplateBlockPreview";
import { ContentBlock } from "@/types/cms";

interface TemplatePreviewProps {
  template: StarterTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: StarterTemplate) => void;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const CATEGORY_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  startup: { icon: Rocket, label: "Startup", color: "text-violet-600" },
  enterprise: { icon: Building2, label: "Enterprise", color: "text-blue-600" },
  compliance: { icon: ShieldCheck, label: "Compliance", color: "text-emerald-600" },
  platform: { icon: Layers, label: "Platform", color: "text-amber-600" },
  helpcenter: { icon: BookOpen, label: "Help Center", color: "text-pink-600" },
};

const HELP_STYLE_LABELS: Record<HelpStyle, string> = {
  'kb-classic': 'Knowledge Base',
  'ai-hub': 'AI Support Hub',
  'hybrid': 'Hybrid Help Center',
  'none': ''
};

export function TemplatePreview({ template, open, onOpenChange, onSelect }: TemplatePreviewProps) {
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [selectedPage, setSelectedPage] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reset to first page when template changes
  useEffect(() => {
    if (template) {
      setSelectedPage(0);
    }
  }, [template?.id]);

  if (!template) return null;

  const categoryConfig = CATEGORY_CONFIG[template.category] || CATEGORY_CONFIG.startup;
  const CategoryIcon = categoryConfig.icon;
  
  const pageCount = template.pages?.length || 0;
  const blockCount = template.pages?.reduce((acc, page) => acc + (page.blocks?.length || 0), 0) || 0;
  const hasChat = template.chatSettings?.enabled !== false;
  const hasBlog = (template.blogPosts?.length || 0) > 0;
  const hasKb = (template.kbCategories?.length || 0) > 0;
  const primaryColor = template.branding?.primaryColor || '250 91% 64%';
  const accentColor = template.branding?.accentColor || '180 100% 50%';
  const thumbnail = getTemplateThumbnail(template);
  const isDarkTheme = template.branding?.defaultTheme === 'dark';
  
  // Convert HSL string to CSS color value
  const hslToCssColor = (hsl: string) => {
    // If already in format "hsl(...)" or "#..." return as-is
    if (hsl.startsWith('hsl') || hsl.startsWith('#') || hsl.startsWith('rgb')) {
      return hsl;
    }
    // Otherwise assume it's HSL values like "250 91% 64%"
    return `hsl(${hsl})`;
  };
  
  // Generate inline styles for template branding preview
  const previewStyles: React.CSSProperties = {
    '--primary': primaryColor,
    '--primary-foreground': isDarkTheme ? '0 0% 100%' : '0 0% 100%',
    '--background': isDarkTheme ? '222 47% 11%' : '0 0% 100%',
    '--foreground': isDarkTheme ? '0 0% 100%' : '222 47% 11%',
    '--muted': isDarkTheme ? '217 33% 17%' : '210 40% 96%',
    '--muted-foreground': isDarkTheme ? '215 20% 65%' : '215 16% 47%',
    '--accent': accentColor,
  } as React.CSSProperties;

  const currentPage = template.pages?.[selectedPage];

  const getDeviceWidth = () => {
    switch (deviceMode) {
      case 'mobile': return 'max-w-[375px]';
      case 'tablet': return 'max-w-[768px]';
      default: return 'max-w-full';
    }
  };

  const handleSelect = () => {
    onSelect(template);
    onOpenChange(false);
  };

  const navigatePage = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && selectedPage > 0) {
      setSelectedPage(selectedPage - 1);
    } else if (direction === 'next' && selectedPage < pageCount - 1) {
      setSelectedPage(selectedPage + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "p-0 gap-0",
        isFullscreen 
          ? "max-w-[100vw] max-h-[100vh] w-screen h-screen rounded-none" 
          : "max-w-6xl h-[90vh]"
      )}>
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Template preview thumbnail */}
              <div 
                className="h-10 w-10 rounded-lg overflow-hidden shrink-0"
                style={thumbnail.type === 'image' 
                  ? { 
                      backgroundImage: `url(${thumbnail.value})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : { background: thumbnail.value }
                }
              />
              <div>
                <DialogTitle className="text-base flex items-center gap-2">
                  {template.name}
                  <Badge variant="outline" className={cn("text-xs", categoryConfig.color)}>
                    <CategoryIcon className="h-3 w-3 mr-1" />
                    {categoryConfig.label}
                  </Badge>
                </DialogTitle>
                <p className="text-xs text-muted-foreground">{template.tagline}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Page navigation */}
              <div className="flex items-center gap-1 mr-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigatePage('prev')}
                  disabled={selectedPage === 0}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[60px] text-center">
                  {selectedPage + 1} / {pageCount}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigatePage('next')}
                  disabled={selectedPage === pageCount - 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Device switcher */}
              <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
                <Button
                  variant={deviceMode === 'desktop' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setDeviceMode('desktop')}
                  className="h-7 w-7 p-0"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={deviceMode === 'tablet' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setDeviceMode('tablet')}
                  className="h-7 w-7 p-0"
                >
                  <Tablet className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={deviceMode === 'mobile' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setDeviceMode('mobile')}
                  className="h-7 w-7 p-0"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Fullscreen toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="h-8 w-8 p-0"
              >
                {isFullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>

              <Button onClick={handleSelect} size="sm" className="gap-1.5 h-8">
                <Sparkles className="h-3.5 w-3.5" />
                Använd
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - collapsible in fullscreen */}
          {!isFullscreen && (
            <div className="w-56 border-r bg-muted/30 flex flex-col shrink-0">
              {/* Template stats */}
              <div className="p-3 border-b">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    <span>{pageCount} sidor</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>{blockCount} block</span>
                  </div>
                  {hasChat && (
                    <div className="flex items-center gap-1.5 text-cyan-600">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>AI-chatt</span>
                    </div>
                  )}
                  {hasBlog && (
                    <div className="flex items-center gap-1.5 text-amber-600">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Blogg</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Page list */}
              <div className="p-3 border-b flex-1 min-h-0">
                <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Sidor</h4>
                <ScrollArea className="h-full max-h-48">
                  <div className="space-y-0.5 pr-2">
                    {template.pages?.map((page, index) => (
                      <button
                        key={page.slug}
                        onClick={() => setSelectedPage(index)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                          selectedPage === index
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        {page.isHomePage ? (
                          <Home className="h-3 w-3 shrink-0" />
                        ) : (
                          <FileText className="h-3 w-3 shrink-0" />
                        )}
                        <span className="flex-1 truncate">{page.title}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Branding preview */}
              <div className="p-3">
                <h4 className="text-xs font-medium mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <Palette className="h-3 w-3" />
                  Färger
                </h4>
                <div className="flex gap-2">
                  <div className="flex items-center gap-2">
                    <div 
                      className="h-6 w-6 rounded border shadow-sm"
                      style={{ backgroundColor: template.branding?.primaryColor }}
                      title={`Primär: ${template.branding?.primaryColor}`}
                    />
                    <div 
                      className="h-6 w-6 rounded border shadow-sm"
                      style={{ backgroundColor: template.branding?.accentColor }}
                      title={`Accent: ${template.branding?.accentColor}`}
                    />
                  </div>
                  <div className="flex-1 text-[10px] text-muted-foreground">
                    {template.branding?.headingFont && (
                      <p className="truncate">{template.branding.headingFont}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview area */}
          <div className="flex-1 bg-muted/50 p-4 overflow-auto">
            <div 
              className={cn(
                "mx-auto rounded-xl border shadow-xl overflow-hidden transition-all duration-300",
                isDarkTheme ? "bg-slate-900" : "bg-white",
                getDeviceWidth()
              )}
            >
              {/* Browser chrome */}
              <div className="h-8 bg-muted/80 border-b flex items-center gap-1.5 px-3">
                <div className="flex gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="bg-background rounded px-3 py-0.5 text-[10px] text-muted-foreground border">
                    {template.name.toLowerCase().replace(/\s/g, '')}.com/{currentPage?.slug || 'home'}
                  </div>
                </div>
              </div>

              {/* Page content preview - with template branding injected */}
              <ScrollArea className={cn(
                isFullscreen ? "h-[calc(100vh-120px)]" : "h-[calc(90vh-180px)]"
              )}>
                <div 
                  className={cn(
                    "template-preview-content",
                    isDarkTheme && "dark"
                  )}
                  style={previewStyles}
                >
                  {currentPage?.blocks?.map((block, index) => (
                    <TemplateBlockPreview 
                      key={block.id || index}
                      block={block as ContentBlock}
                      compact={deviceMode === 'mobile'}
                      primaryColor={hslToCssColor(primaryColor)}
                    />
                  ))}
                  
                  {(!currentPage?.blocks || currentPage.blocks.length === 0) && (
                    <div className="p-12 text-center text-muted-foreground">
                      <LayoutGrid className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Denna sida har inga block</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}