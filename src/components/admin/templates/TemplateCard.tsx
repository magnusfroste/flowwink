import { StarterTemplate, HelpStyle } from "@/data/starter-templates";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  Sparkles
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
  'kb-classic': { label: 'KB Classic', color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
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

  // Get primary color from branding for visual preview
  const primaryColor = template.branding?.primaryColor || '#6366f1';

  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300 hover:border-primary/50">
      {/* Color accent bar */}
      <div 
        className="h-1.5 w-full"
        style={{ backgroundColor: primaryColor }}
      />
      
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className={cn("p-2.5 rounded-xl", categoryConfig.color)}>
            <CategoryIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
              {template.name}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-1">
              {template.tagline}
            </p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Badge variant="secondary" className={cn("text-xs", categoryConfig.color)}>
            {categoryConfig.label}
          </Badge>
          {helpStyleConfig.label && (
            <Badge variant="secondary" className={cn("text-xs", helpStyleConfig.color)}>
              {helpStyleConfig.label}
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            <span>{pageCount} sidor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>{blockCount} block</span>
          </div>
          {hasChat && (
            <div className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>AI</span>
            </div>
          )}
          {hasBlog && (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Blogg</span>
            </div>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {template.description}
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => onPreview(template)}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            Preview
          </Button>
          <Button 
            size="sm" 
            className="flex-1"
            onClick={() => onSelect(template)}
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            Använd
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
