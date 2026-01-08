import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STARTER_TEMPLATES, StarterTemplate } from "@/data/starter-templates";
import { TemplateCard } from "@/components/admin/templates/TemplateCard";
import { TemplateFilters, CategoryFilter, HelpStyleFilter } from "@/components/admin/templates/TemplateFilters";
import { TemplatePreview } from "@/components/admin/templates/TemplatePreview";
import { 
  Search, 
  LayoutGrid, 
  List,
  Sparkles,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

type ViewMode = 'grid' | 'list';

export default function TemplateGalleryPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [selectedHelpStyle, setSelectedHelpStyle] = useState<HelpStyleFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [previewTemplate, setPreviewTemplate] = useState<StarterTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return STARTER_TEMPLATES.filter((template) => {
      // Search filter
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        const matchesSearch = 
          template.name.toLowerCase().includes(search) ||
          template.description.toLowerCase().includes(search) ||
          template.tagline.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && template.category !== selectedCategory) {
        return false;
      }

      // Help style filter
      if (selectedHelpStyle !== 'all') {
        const templateHelpStyle = template.helpStyle || 'none';
        if (templateHelpStyle !== selectedHelpStyle) {
          return false;
        }
      }

      return true;
    });
  }, [searchQuery, selectedCategory, selectedHelpStyle]);

  // Calculate counts for filters
  const templateCounts = useMemo(() => {
    const categories: Record<CategoryFilter, number> = {
      all: STARTER_TEMPLATES.length,
      startup: 0,
      enterprise: 0,
      compliance: 0,
      platform: 0,
      helpcenter: 0,
    };

    const helpStyles: Record<HelpStyleFilter, number> = {
      all: STARTER_TEMPLATES.length,
      'kb-classic': 0,
      'ai-hub': 0,
      'hybrid': 0,
      'none': 0,
    };

    STARTER_TEMPLATES.forEach((template) => {
      categories[template.category]++;
      const style = template.helpStyle || 'none';
      helpStyles[style]++;
    });

    return { categories, helpStyles };
  }, []);

  const handlePreview = (template: StarterTemplate) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
  };

  const handleSelect = (template: StarterTemplate) => {
    // Navigate to new-site page with template pre-selected
    navigate('/admin/new-site', { state: { selectedTemplate: template } });
  };

  return (
    <AdminLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin/quick-start">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                Template Gallery
              </h1>
              <p className="text-muted-foreground">
                Choose a professionally designed template to get started quickly
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              {filteredTemplates.length} av {STARTER_TEMPLATES.length} templates
            </Badge>
          </div>
        </div>

        <div className="flex flex-1 gap-6 min-h-0">
          {/* Filters sidebar */}
          <div className="w-64 shrink-0">
            <div className="sticky top-0">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <TemplateFilters
                selectedCategory={selectedCategory}
                selectedHelpStyle={selectedHelpStyle}
                onCategoryChange={setSelectedCategory}
                onHelpStyleChange={setSelectedHelpStyle}
                templateCounts={templateCounts}
              />
            </div>
          </div>

          {/* Template grid */}
          <div className="flex-1 min-w-0">
            {/* View controls */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {selectedCategory === 'all' && selectedHelpStyle === 'all' 
                  ? 'Alla templates' 
                  : 'Filtrerade templates'}
              </h2>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="h-8 w-8 p-0"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-8 w-8 p-0"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {filteredTemplates.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  Inga templates matchar dina filter
                </p>
                <Button 
                  variant="link" 
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedHelpStyle('all');
                    setSearchQuery('');
                  }}
                >
                  Rensa alla filter
                </Button>
              </div>
            ) : (
              <div className={cn(
                "grid gap-4",
                viewMode === 'grid' 
                  ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" 
                  : "grid-cols-1"
              )}>
                {filteredTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onPreview={handlePreview}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview modal */}
      <TemplatePreview
        template={previewTemplate}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onSelect={handleSelect}
      />
    </AdminLayout>
  );
}
