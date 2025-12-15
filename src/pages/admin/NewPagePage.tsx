import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreatePage } from '@/hooks/usePages';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';

const pageSchema = z.object({
  title: z.string().min(2, 'Titeln måste vara minst 2 tecken'),
  slug: z.string()
    .min(2, 'URL-sluggen måste vara minst 2 tecken')
    .regex(/^[a-z0-9-]+$/, 'URL-sluggen får bara innehålla små bokstäver, siffror och bindestreck'),
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
        title: 'Valideringsfel',
        description: result.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    try {
      const page = await createPage.mutateAsync({ title, slug });
      navigate(`/admin/pages/${page.id}`);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/pages')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Tillbaka till sidor
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Skapa ny sida</CardTitle>
            <CardDescription>
              Fyll i grundläggande information för din nya sida
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Sidtitel</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="t.ex. Om sjukhuset"
                  className="text-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL-slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">/</span>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    placeholder="om-sjukhuset"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Denna URL används för att nå sidan: sophiahemmet.se/{slug || 'url-slug'}
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/admin/pages')}
                >
                  Avbryt
                </Button>
                <Button type="submit" disabled={createPage.isPending}>
                  {createPage.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Skapa sida
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
