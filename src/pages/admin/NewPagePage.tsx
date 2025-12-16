import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, FileText } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StarterTemplateSelector } from '@/components/admin/StarterTemplateSelector';
import { STARTER_TEMPLATES, StarterTemplate } from '@/data/starter-templates';
import { useCreatePage } from '@/hooks/usePages';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const pageSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  slug: z.string()
    .min(2, 'URL slug must be at least 2 characters')
    .regex(/^[a-z0-9-]+$/, 'URL slug can only contain lowercase letters, numbers and hyphens'),
});

type CreationMode = 'blank' | 'template';

export default function NewPagePage() {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [mode, setMode] = useState<CreationMode>('blank');
  const [selectedTemplate, setSelectedTemplate] = useState<StarterTemplate | null>(null);
  const navigate = useNavigate();
  const createPage = useCreatePage();
  const { toast } = useToast();

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/å/g, 'a')
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slug || slug === generateSlug(title)) {
      setSlug(generateSlug(value));
    }
  };

  const handleTemplateSelect = (template: StarterTemplate) => {
    setSelectedTemplate(template);
    setMode('template');
    // Pre-fill title from template name if empty
    if (!title) {
      const templateTitle = template.name + ' Page';
      setTitle(templateTitle);
      setSlug(generateSlug(templateTitle));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = pageSchema.safeParse({ title, slug });
    if (!result.success) {
      toast({
        title: 'Validation Error',
        description: result.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    try {
      const pageData: { title: string; slug: string; content?: any; meta?: any } = { 
        title, 
        slug 
      };

      // If using a template, include blocks and meta
      if (mode === 'template' && selectedTemplate) {
        pageData.content = selectedTemplate.blocks;
        pageData.meta = selectedTemplate.meta;
      }

      const page = await createPage.mutateAsync(pageData);
      
      toast({
        title: mode === 'template' ? 'Page created from template' : 'Page created',
        description: mode === 'template' 
          ? `Created with ${selectedTemplate?.blocks.length} pre-configured blocks`
          : 'Your new blank page is ready',
      });
      
      navigate(`/admin/pages/${page.id}`);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-3xl">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/pages')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to pages
        </Button>

        <div className="space-y-6">
          {/* Mode Selection */}
          <div>
            <Label className="text-base font-medium mb-3 block">How would you like to start?</Label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => { setMode('blank'); setSelectedTemplate(null); }}
                className={cn(
                  "p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50",
                  mode === 'blank' && !selectedTemplate
                    ? "border-primary bg-primary/5"
                    : "border-border"
                )}
              >
                <FileText className="h-6 w-6 mb-2 text-muted-foreground" />
                <div className="font-medium">Blank Page</div>
                <p className="text-sm text-muted-foreground">Start from scratch</p>
              </button>
              
              <StarterTemplateSelector 
                onSelectTemplate={handleTemplateSelect}
                trigger={
                  <button
                    type="button"
                    className={cn(
                      "p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50 w-full",
                      mode === 'template' && selectedTemplate
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    )}
                  >
                    <Sparkles className="h-6 w-6 mb-2 text-muted-foreground" />
                    <div className="font-medium">
                      {selectedTemplate ? selectedTemplate.name : 'Use Template'}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedTemplate 
                        ? `${selectedTemplate.blocks.length} pre-configured blocks`
                        : 'Start with a designed template'
                      }
                    </p>
                  </button>
                }
              />
            </div>
          </div>

          {/* Page Details Form */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-2xl">Page Details</CardTitle>
              <CardDescription>
                {mode === 'template' && selectedTemplate
                  ? `Creating page from "${selectedTemplate.name}" template`
                  : 'Fill in basic information for your new page'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Page Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="e.g. About Us"
                    className="text-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">/</span>
                    <Input
                      id="slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase())}
                      placeholder="about-us"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This URL will be used to access the page: yoursite.com/{slug || 'url-slug'}
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/admin/pages')}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createPage.isPending}>
                    {createPage.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {mode === 'template' ? 'Create from Template' : 'Create Page'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
