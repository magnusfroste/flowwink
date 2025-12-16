import { useState } from 'react';
import { Rocket, Building2, ShieldCheck, Sparkles, MessageSquare, Check, FileText, Settings, Palette } from 'lucide-react';
import { STARTER_TEMPLATES, StarterTemplate } from '@/data/starter-templates';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS = {
  startup: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  enterprise: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  compliance: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const CATEGORY_LABELS = {
  startup: 'Startup',
  enterprise: 'Enterprise',
  compliance: 'Compliance',
};

const ICON_MAP = {
  Rocket: Rocket,
  Building2: Building2,
  ShieldCheck: ShieldCheck,
};

interface StarterTemplateSelectorProps {
  onSelectTemplate: (template: StarterTemplate) => void;
  trigger?: React.ReactNode;
}

export function StarterTemplateSelector({ onSelectTemplate, trigger }: StarterTemplateSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (template: StarterTemplate) => {
    setSelectedId(template.id);
    onSelectTemplate(template);
    setOpen(false);
  };

  // Calculate total blocks across all pages
  const getTotalBlocks = (template: StarterTemplate) => {
    return template.pages.reduce((total, page) => total + page.blocks.length, 0);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Start from Template
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Site Templates
          </SheetTitle>
          <SheetDescription>
            Choose a professionally designed template to create your complete website. Each template includes multiple pages, branding, and AI chat configuration.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {STARTER_TEMPLATES.map((template) => {
            const IconComponent = ICON_MAP[template.icon as keyof typeof ICON_MAP] || Rocket;
            const isSelected = selectedId === template.id;
            
            return (
              <Card 
                key={template.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
                  isSelected && "border-primary ring-2 ring-primary/20"
                )}
                onClick={() => handleSelect(template)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        template.category === 'startup' && "bg-violet-100 dark:bg-violet-900/30",
                        template.category === 'enterprise' && "bg-blue-100 dark:bg-blue-900/30",
                        template.category === 'compliance' && "bg-emerald-100 dark:bg-emerald-900/30"
                      )}>
                        <IconComponent className={cn(
                          "h-5 w-5",
                          template.category === 'startup' && "text-violet-600 dark:text-violet-400",
                          template.category === 'enterprise' && "text-blue-600 dark:text-blue-400",
                          template.category === 'compliance' && "text-emerald-600 dark:text-emerald-400"
                        )} />
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {template.name}
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">{template.tagline}</p>
                      </div>
                    </div>
                    <Badge className={CATEGORY_COLORS[template.category]}>
                      {CATEGORY_LABELS[template.category]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription className="text-sm">
                    {template.description}
                  </CardDescription>
                  
                  {/* What's included */}
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="font-medium">{template.pages.length} pages</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Palette className="h-3.5 w-3.5" />
                      <span className="font-medium">Branding</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span className="font-medium">AI Chat</span>
                    </div>
                  </div>

                  {/* Pages preview */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {template.pages.map((page) => (
                      <Badge 
                        key={page.slug} 
                        variant="secondary" 
                        className="text-xs"
                      >
                        {page.title}
                        {page.isHomePage && <span className="ml-1 opacity-60">(Home)</span>}
                      </Badge>
                    ))}
                  </div>

                  {/* Branding preview */}
                  <div className="flex items-center gap-2 pt-1">
                    <div 
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${template.branding.primaryColor})` }}
                      title="Primary color"
                    />
                    <span className="text-xs text-muted-foreground">
                      {template.branding.headingFont} / {template.branding.bodyFont}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground text-center">
            Templates create a complete site with multiple pages, applied branding, and configured AI chat. You can customize everything after creation.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface TemplateEmptyStateProps {
  onSelectTemplate: (template: StarterTemplate) => void;
}

export function TemplateEmptyState({ onSelectTemplate }: TemplateEmptyStateProps) {
  return (
    <div className="text-center py-12 px-4 border-2 border-dashed border-muted-foreground/20 rounded-xl">
      <Sparkles className="h-10 w-10 mx-auto mb-4 text-muted-foreground/50" />
      <h3 className="text-lg font-medium mb-2">Start with a Template</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        Choose a professionally designed starter template, or add blocks manually to build from scratch.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <StarterTemplateSelector 
          onSelectTemplate={onSelectTemplate}
          trigger={
            <Button className="gap-2">
              <Sparkles className="h-4 w-4" />
              Browse Templates
            </Button>
          }
        />
      </div>
    </div>
  );
}
