import { useState } from "react";
import { StarterTemplate, HelpStyle } from "@/data/starter-templates";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { 
  X,
  Monitor,
  Tablet,
  Smartphone,
  Sparkles,
  FileText,
  LayoutGrid,
  MessageSquare,
  BookOpen,
  Palette,
  ChevronRight,
  Rocket,
  Building2,
  ShieldCheck,
  Layers
} from "lucide-react";

interface TemplatePreviewProps {
  template: StarterTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: StarterTemplate) => void;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const CATEGORY_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  startup: { icon: Rocket, label: "Startup" },
  enterprise: { icon: Building2, label: "Enterprise" },
  compliance: { icon: ShieldCheck, label: "Compliance" },
  platform: { icon: Layers, label: "Platform" },
  helpcenter: { icon: BookOpen, label: "Help Center" },
};

const HELP_STYLE_LABELS: Record<HelpStyle, string> = {
  'kb-classic': 'KB Classic (SEO-fokus)',
  'ai-hub': 'AI Support Hub (Chatt-fokus)',
  'hybrid': 'Hybrid Help Center',
  'none': 'Ingen dedikerad hjälp'
};

export function TemplatePreview({ template, open, onOpenChange, onSelect }: TemplatePreviewProps) {
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [selectedPage, setSelectedPage] = useState(0);

  if (!template) return null;

  const categoryConfig = CATEGORY_CONFIG[template.category] || CATEGORY_CONFIG.startup;
  const CategoryIcon = categoryConfig.icon;
  
  const pageCount = template.pages?.length || 0;
  const blockCount = template.pages?.reduce((acc, page) => acc + (page.blocks?.length || 0), 0) || 0;
  const hasChat = template.chatSettings?.enabled !== false;
  const hasBlog = (template.blogPosts?.length || 0) > 0;
  const hasKb = (template.kbCategories?.length || 0) > 0;
  const primaryColor = template.branding?.primaryColor || '#6366f1';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div 
                className="p-3 rounded-xl"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <CategoryIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">{template.name}</DialogTitle>
                <p className="text-sm text-muted-foreground">{template.tagline}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Device switcher */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={deviceMode === 'desktop' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setDeviceMode('desktop')}
                  className="h-8 w-8 p-0"
                >
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button
                  variant={deviceMode === 'tablet' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setDeviceMode('tablet')}
                  className="h-8 w-8 p-0"
                >
                  <Tablet className="h-4 w-4" />
                </Button>
                <Button
                  variant={deviceMode === 'mobile' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setDeviceMode('mobile')}
                  className="h-8 w-8 p-0"
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>

              <Button onClick={handleSelect} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Använd denna template
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 border-r bg-muted/30 flex flex-col">
            {/* Template info */}
            <div className="p-4 border-b">
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="secondary">{categoryConfig.label}</Badge>
                {template.helpStyle && template.helpStyle !== 'none' && (
                  <Badge variant="outline">{HELP_STYLE_LABELS[template.helpStyle]}</Badge>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{pageCount} sidor</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <LayoutGrid className="h-4 w-4" />
                  <span>{blockCount} block</span>
                </div>
                {hasChat && (
                  <div className="flex items-center gap-2 text-cyan-600">
                    <MessageSquare className="h-4 w-4" />
                    <span>AI-chatt</span>
                  </div>
                )}
                {hasBlog && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <BookOpen className="h-4 w-4" />
                    <span>Blogg</span>
                  </div>
                )}
              </div>
            </div>

            {/* Page list */}
            <div className="p-4 border-b">
              <h4 className="text-sm font-medium mb-2">Sidor</h4>
              <ScrollArea className="h-48">
                <div className="space-y-1">
                  {template.pages?.map((page, index) => (
                    <button
                      key={page.slug}
                      onClick={() => setSelectedPage(index)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                        selectedPage === index
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{page.title}</span>
                      {page.isHomePage && (
                        <Badge variant="secondary" className="text-xs">Hem</Badge>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Branding preview */}
            <div className="p-4 flex-1">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Branding
              </h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div 
                    className="h-8 w-8 rounded-lg border"
                    style={{ backgroundColor: template.branding?.primaryColor }}
                  />
                  <div className="text-sm">
                    <p className="font-medium">Primär</p>
                    <p className="text-muted-foreground text-xs">{template.branding?.primaryColor}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div 
                    className="h-8 w-8 rounded-lg border"
                    style={{ backgroundColor: template.branding?.accentColor }}
                  />
                  <div className="text-sm">
                    <p className="font-medium">Accent</p>
                    <p className="text-muted-foreground text-xs">{template.branding?.accentColor}</p>
                  </div>
                </div>
                {template.branding?.headingFont && (
                  <div className="text-sm">
                    <p className="font-medium">Typsnitt</p>
                    <p className="text-muted-foreground text-xs">
                      {template.branding.headingFont} / {template.branding.bodyFont}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preview area */}
          <div className="flex-1 bg-muted/50 p-6 overflow-auto">
            <div className={cn(
              "mx-auto bg-background rounded-xl border shadow-lg overflow-hidden transition-all duration-300",
              getDeviceWidth()
            )}>
              {/* Browser chrome */}
              <div className="h-10 bg-muted border-b flex items-center gap-2 px-4">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="bg-background rounded-md px-4 py-1 text-xs text-muted-foreground">
                    /{currentPage?.slug || 'home'}
                  </div>
                </div>
              </div>

              {/* Page content preview */}
              <ScrollArea className="h-[calc(90vh-220px)]">
                <div className="p-6 space-y-4">
                  {currentPage?.blocks?.map((block, index) => (
                    <div 
                      key={block.id || index}
                      className="bg-muted/50 rounded-lg border border-dashed p-4"
                    >
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <LayoutGrid className="h-4 w-4" />
                        <span className="font-medium capitalize">{block.type}</span>
                      </div>
                      
                      {/* Block-specific preview */}
                      {block.type === 'hero' && (
                        <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-6 text-center">
                          <h2 className="text-lg font-bold mb-2">
                            {(block.data as any)?.title || 'Hero Title'}
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            {(block.data as any)?.subtitle || 'Hero subtitle goes here'}
                          </p>
                        </div>
                      )}
                      
                      {block.type === 'features' && (
                        <div className="grid grid-cols-3 gap-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-background rounded p-3 text-center">
                              <div className="h-8 w-8 bg-primary/10 rounded-full mx-auto mb-2" />
                              <div className="h-3 w-16 bg-muted rounded mx-auto" />
                            </div>
                          ))}
                        </div>
                      )}

                      {block.type === 'kb-hub' && (
                        <div className="grid grid-cols-2 gap-2">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="bg-background rounded p-3">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 bg-primary/10 rounded" />
                                <div className="h-3 w-20 bg-muted rounded" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {block.type === 'chat' && (
                        <div className="bg-background rounded-lg border p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <MessageSquare className="h-5 w-5 text-primary" />
                            <span className="font-medium">AI Chat</span>
                          </div>
                          <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
                            Chat preview...
                          </div>
                        </div>
                      )}

                      {!['hero', 'features', 'kb-hub', 'chat'].includes(block.type) && (
                        <div className="h-20 bg-muted/50 rounded flex items-center justify-center">
                          <span className="text-xs text-muted-foreground capitalize">
                            {block.type} block
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
