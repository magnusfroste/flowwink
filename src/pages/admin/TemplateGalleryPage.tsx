import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { STARTER_TEMPLATES, StarterTemplate } from "@/data/starter-templates";
import { TemplatePreview } from "@/components/admin/templates/TemplatePreview";
import { TemplateVisualCard } from "@/components/admin/templates/TemplateVisualCard";
import { 
  Search, 
  ArrowLeft,
  ArrowRight,
  Bot,
} from "lucide-react";

export default function TemplateGalleryPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<StarterTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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
      <AdminPageContainer maxWidth="max-w-5xl" className="mx-auto">
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
              What you see is what you get
            </p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Template grid - 2 columns, large visual cards */}
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">No templates match your search</p>
            <Button variant="outline" onClick={() => setSearchQuery('')}>
              Clear search
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {filteredTemplates.map((template) => (
              <TemplateVisualCard
                key={template.id}
                template={template}
                onPreview={handlePreview}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}

        {/* Copilot upsell */}
        <div className="mt-16 text-center pb-8">
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
      </AdminPageContainer>

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
