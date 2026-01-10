import { StarterTemplate, HelpStyle } from "@/data/starter-templates";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTemplateThumbnail } from "@/lib/template-helpers";
import { 
  Eye,
  ArrowRight,
  FileText,
  LayoutGrid,
  MessageSquare,
  BookOpen,
  Rocket,
  Building2,
  ShieldCheck,
  Layers,
  Sparkles,
  Play,
  Zap
} from "lucide-react";

interface TemplateCardProps {
  template: StarterTemplate;
  onPreview: (template: StarterTemplate) => void;
  onSelect: (template: StarterTemplate) => void;
}

const CATEGORY_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  startup: { icon: Rocket, color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", label: "Startup" },
  enterprise: { icon: Building2, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", label: "Enterprise" },
  compliance: { icon: ShieldCheck, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", label: "Compliance" },
  platform: { icon: Layers, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", label: "Platform" },
  helpcenter: { icon: BookOpen, color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300", label: "Help Center" },
};

const HELP_STYLE_CONFIG: Record<HelpStyle | 'none', { label: string; color: string }> = {
  'kb-classic': { label: 'KB', color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  'ai-hub': { label: 'AI Hub', color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  'hybrid': { label: 'Hybrid', color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  'none': { label: '', color: "" },
};

export function TemplateCard({ template, onPreview, onSelect }: TemplateCardProps) {
  const categoryConfig = CATEGORY_CONFIG[template.category] || CATEGORY_CONFIG.startup;
  const helpStyleConfig = HELP_STYLE_CONFIG[template.helpStyle || 'none'];
  const CategoryIcon = categoryConfig.icon;
  
  const pageCount = template.pages?.length || 0;
  const blockCount = template.pages?.reduce((acc, page) => acc + (page.blocks?.length || 0), 0) || 0;
  const hasChat = template.chatSettings?.enabled !== false;
  const hasBlog = (template.blogPosts?.length || 0) > 0;
  const hasKb = (template.kbCategories?.length || 0) > 0;

  // Get thumbnail for visual preview
  const thumbnail = getTemplateThumbnail(template);
  const primaryColor = template.branding?.primaryColor || '#6366f1';

  // Get hero title for preview
  const heroBlock = template.pages?.[0]?.blocks?.find(b => b.type === 'hero');
  const heroTitle = (heroBlock?.data as any)?.title || template.name;

  return (
    <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 hover:border-primary/50 hover:-translate-y-1">
      {/* Visual Preview Area */}
      <div 
        className="relative h-40 overflow-hidden cursor-pointer"
        onClick={() => onPreview(template)}
        style={thumbnail.type === 'image' 
          ? { 
              backgroundImage: `url(${thumbnail.value})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center top',
            }
          : { background: thumbnail.value }
        }
      >
        {/* Overlay with template name preview */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        
        {/* Simulated browser UI */}
        <div className="absolute top-0 left-0 right-0 h-6 bg-white/10 backdrop-blur-sm flex items-center gap-1 px-2">
          <div className="h-2 w-2 rounded-full bg-red-400/80" />
          <div className="h-2 w-2 rounded-full bg-yellow-400/80" />
          <div className="h-2 w-2 rounded-full bg-green-400/80" />
          <div className="flex-1 flex justify-center">
            <div className="bg-white/20 rounded px-3 py-0.5 text-[10px] text-white/80">
              /{template.pages?.[0]?.slug || 'home'}
            </div>
          </div>
        </div>
        
        {/* Hero text overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-white font-semibold text-lg line-clamp-2 drop-shadow-lg">
            {heroTitle}
          </p>
        </div>
        
        {/* Play button on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-white/90 backdrop-blur-sm rounded-full p-3 shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
            <Eye className="h-5 w-5 text-gray-900" />
          </div>
        </div>
        
        {/* Feature badges overlay */}
        <div className="absolute top-8 left-2 flex flex-col gap-1">
          {hasChat && (
            <Badge className="bg-cyan-500/90 text-white border-0 text-[10px] h-5 backdrop-blur-sm">
              <Zap className="h-2.5 w-2.5 mr-1" />
              AI
            </Badge>
          )}
          {hasKb && (
            <Badge className="bg-indigo-500/90 text-white border-0 text-[10px] h-5 backdrop-blur-sm">
              <BookOpen className="h-2.5 w-2.5 mr-1" />
              KB
            </Badge>
          )}
        </div>
      </div>
      
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div 
            className="p-2 rounded-lg shrink-0"
            style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
          >
            <CategoryIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
              {template.name}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {template.tagline}
            </p>
          </div>
        </div>

        {/* Compact stats row */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span>{pageCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <LayoutGrid className="h-3 w-3" />
            <span>{blockCount}</span>
          </div>
          <div className="flex-1" />
          <Badge variant="secondary" className={cn("text-[10px] h-5", categoryConfig.color)}>
            {categoryConfig.label}
          </Badge>
          {helpStyleConfig.label && (
            <Badge variant="secondary" className={cn("text-[10px] h-5", helpStyleConfig.color)}>
              {helpStyleConfig.label}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 h-8 text-xs"
            onClick={() => onPreview(template)}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Preview
          </Button>
          <Button 
            size="sm" 
            className="flex-1 h-8 text-xs"
            onClick={() => onSelect(template)}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Använd
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}