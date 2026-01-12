import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { STARTER_TEMPLATES, StarterTemplate } from "@/data/starter-templates";
import { TemplatePreview } from "@/components/admin/templates/TemplatePreview";
import { 
  Search, 
  ArrowLeft,
  Eye,
  ArrowRight,
  Sparkles,
  FileText,
  Bot,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function TemplateGalleryPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<StarterTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

  // Simple search filter only
  const filteredTemplates = useMemo(() => {
    if (!searchQuery) return STARTER_TEMPLATES;
    
    const search = searchQuery.toLowerCase();
    return STARTER_TEMPLATES.filter((template) => 
      template.name.toLowerCase().includes(search) ||
      template.description.toLowerCase().includes(search) ||
      template.tagline.toLowerCase().includes(search)
    );
  }, [searchQuery]);

  const handlePreview = (template: StarterTemplate) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
  };

  const handleSelect = (template: StarterTemplate) => {
    navigate('/admin/new-site', { state: { selectedTemplate: template } });
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/quick-start">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Templates</h1>
            <p className="text-muted-foreground">
              Pick a template to get started. What you see is what you get.
            </p>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Template grid - large visual cards */}
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">No templates match your search</p>
            <Button variant="outline" onClick={() => setSearchQuery('')}>
              Clear search
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => {
              const pageCount = template.pages?.length || 0;
              const hasKb = template.kbCategories && template.kbCategories.length > 0;
              const hasBlog = template.blogPosts && template.blogPosts.length > 0;
              const isHovered = hoveredTemplate === template.id;
              
              return (
                <Card 
                  key={template.id}
                  className={cn(
                    "group cursor-pointer overflow-hidden transition-all duration-300",
                    isHovered ? "border-primary shadow-xl scale-[1.02]" : "hover:border-muted-foreground/50"
                  )}
                  onMouseEnter={() => setHoveredTemplate(template.id)}
                  onMouseLeave={() => setHoveredTemplate(null)}
                >
                  {/* Visual preview area */}
                  <div 
                    className="aspect-[16/10] relative overflow-hidden"
                    style={{ 
                      backgroundColor: template.branding?.primaryColor || '#6366f1',
                    }}
                  >
                    {/* Simulated page preview */}
                    <div className="absolute inset-4 bg-background rounded-lg shadow-2xl overflow-hidden">
                      {/* Mini header */}
                      <div className="h-8 bg-muted/50 border-b flex items-center px-3 gap-2">
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: template.branding?.primaryColor || '#6366f1' }}
                        />
                        <div className="flex-1" />
                        <div className="flex gap-1">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="w-8 h-2 bg-muted rounded" />
                          ))}
                        </div>
                      </div>
                      {/* Mini content */}
                      <div className="p-4 space-y-3">
                        <div className="space-y-2">
                          <div 
                            className="h-3 rounded w-3/4"
                            style={{ backgroundColor: `${template.branding?.primaryColor || '#6366f1'}30` }}
                          />
                          <div className="h-2 bg-muted rounded w-full" />
                          <div className="h-2 bg-muted rounded w-5/6" />
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="aspect-square bg-muted rounded" />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Hover overlay with actions */}
                    <div className={cn(
                      "absolute inset-0 bg-black/60 flex items-center justify-center gap-3 transition-opacity duration-200",
                      isHovered ? "opacity-100" : "opacity-0"
                    )}>
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreview(template);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </Button>
                      <Button 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(template);
                        }}
                      >
                        Use template
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>

                  {/* Template info */}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg truncate">{template.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {template.tagline}
                        </p>
                      </div>
                    </div>
                    
                    {/* Feature badges */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge variant="secondary" className="text-xs">
                        <FileText className="h-3 w-3 mr-1" />
                        {pageCount} pages
                      </Badge>
                      {hasKb && (
                        <Badge variant="secondary" className="text-xs">
                          <Bot className="h-3 w-3 mr-1" />
                          Knowledge base
                        </Badge>
                      )}
                      {hasBlog && (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Blog
                        </Badge>
                      )}
                      {template.chatSettings && (
                        <Badge variant="secondary" className="text-xs">
                          <MessageSquare className="h-3 w-3 mr-1" />
                          AI Chat
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Copilot upsell */}
        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-3">
            Can't find what you're looking for?
          </p>
          <Button variant="outline" asChild>
            <Link to="/admin/copilot">
              <Bot className="h-4 w-4 mr-2" />
              Let Copilot build it for you
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
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
