import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, FileText } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreatePage } from '@/hooks/usePages';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';

const pageSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  slug: z.string()
    .min(2, 'URL slug must be at least 2 characters')
    .regex(/^[a-z0-9-]+$/, 'URL slug can only contain lowercase letters, numbers and hyphens'),
});

export default function NewPagePage() {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
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
      const page = await createPage.mutateAsync({ title, slug });
      
      toast({
        title: 'Page created',
        description: 'Your new blank page is ready',
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

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="font-serif text-2xl">New Blank Page</CardTitle>
                <CardDescription>
                  Create an empty page and add content blocks manually
                </CardDescription>
              </div>
            </div>
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
                  Create Page
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
