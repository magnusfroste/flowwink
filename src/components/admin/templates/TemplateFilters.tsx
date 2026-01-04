import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HelpStyle } from "@/data/starter-templates";
import { 
  Rocket, 
  Building2, 
  ShieldCheck, 
  LayoutGrid,
  BookOpen,
  MessageSquare,
  Layers,
  X
} from "lucide-react";

export type CategoryFilter = 'all' | 'startup' | 'enterprise' | 'compliance' | 'platform' | 'helpcenter';
export type HelpStyleFilter = 'all' | HelpStyle;

interface TemplateFiltersProps {
  selectedCategory: CategoryFilter;
  selectedHelpStyle: HelpStyleFilter;
  onCategoryChange: (category: CategoryFilter) => void;
  onHelpStyleChange: (style: HelpStyleFilter) => void;
  templateCounts: {
    categories: Record<CategoryFilter, number>;
    helpStyles: Record<HelpStyleFilter, number>;
  };
}

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'all', label: 'Alla kategorier', icon: LayoutGrid },
  { value: 'startup', label: 'Startup', icon: Rocket },
  { value: 'enterprise', label: 'Enterprise', icon: Building2 },
  { value: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { value: 'platform', label: 'Platform', icon: Layers },
  { value: 'helpcenter', label: 'Help Center', icon: BookOpen },
];

const HELP_STYLE_OPTIONS: { value: HelpStyleFilter; label: string; description: string }[] = [
  { value: 'all', label: 'Alla stilar', description: 'Visa alla hjälp-stilar' },
  { value: 'kb-classic', label: 'KB Classic', description: 'SEO-fokuserad kunskapsbas' },
  { value: 'ai-hub', label: 'AI Hub', description: 'Chatt-fokuserad support' },
  { value: 'hybrid', label: 'Hybrid', description: 'Kombination av KB + chatt' },
  { value: 'none', label: 'Ingen hjälp', description: 'Utan dedikerad hjälp-sida' },
];

export function TemplateFilters({
  selectedCategory,
  selectedHelpStyle,
  onCategoryChange,
  onHelpStyleChange,
  templateCounts,
}: TemplateFiltersProps) {
  const hasActiveFilters = selectedCategory !== 'all' || selectedHelpStyle !== 'all';

  const clearFilters = () => {
    onCategoryChange('all');
    onHelpStyleChange('all');
  };

  return (
    <div className="space-y-6">
      {/* Clear filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="w-full justify-start text-muted-foreground"
        >
          <X className="h-4 w-4 mr-2" />
          Rensa filter
        </Button>
      )}

      {/* Category filter */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Kategori
        </h3>
        <div className="space-y-1">
          {CATEGORY_OPTIONS.map((option) => {
            const count = templateCounts.categories[option.value];
            const isActive = selectedCategory === option.value;
            const Icon = option.icon;
            
            return (
              <button
                key={option.value}
                onClick={() => onCategoryChange(option.value)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{option.label}</span>
                <Badge 
                  variant={isActive ? "secondary" : "outline"} 
                  className={cn(
                    "text-xs",
                    isActive && "bg-primary-foreground/20 text-primary-foreground border-transparent"
                  )}
                >
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      {/* Help Style filter */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Hjälp-stil
        </h3>
        <div className="space-y-1">
          {HELP_STYLE_OPTIONS.map((option) => {
            const count = templateCounts.helpStyles[option.value];
            const isActive = selectedHelpStyle === option.value;
            
            return (
              <button
                key={option.value}
                onClick={() => onHelpStyleChange(option.value)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block">{option.label}</span>
                  <span className={cn(
                    "text-xs",
                    isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {option.description}
                  </span>
                </div>
                <Badge 
                  variant={isActive ? "secondary" : "outline"} 
                  className={cn(
                    "text-xs shrink-0",
                    isActive && "bg-primary-foreground/20 text-primary-foreground border-transparent"
                  )}
                >
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
