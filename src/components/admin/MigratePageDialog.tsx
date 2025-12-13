import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, Sparkles, Globe, CheckCircle2, AlertCircle, FileText, Image, Layout, Type } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreatePage } from '@/hooks/usePages';
import { supabase } from '@/integrations/supabase/client';
import type { ContentBlock } from '@/types/cms';

const BLOCK_TYPE_ICONS: Record<string, React.ReactNode> = {
  hero: <Layout className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
  image: <Image className="h-4 w-4" />,
  'two-column': <Layout className="h-4 w-4" />,
  'article-grid': <FileText className="h-4 w-4" />,
  'link-grid': <Layout className="h-4 w-4" />,
  accordion: <FileText className="h-4 w-4" />,
  cta: <Sparkles className="h-4 w-4" />,
  quote: <Type className="h-4 w-4" />,
  stats: <FileText className="h-4 w-4" />,
  contact: <FileText className="h-4 w-4" />,
  separator: <Layout className="h-4 w-4" />,
  youtube: <FileText className="h-4 w-4" />,
  gallery: <Image className="h-4 w-4" />,
  'info-box': <AlertCircle className="h-4 w-4" />,
};

const BLOCK_TYPE_LABELS: Record<string, string> = {
  hero: 'Hero',
  text: 'Text',
  image: 'Bild',
  'two-column': 'Två kolumner',
  'article-grid': 'Artikelrutnät',
  'link-grid': 'Länkrutnät',
  accordion: 'Accordion',
  cta: 'Call to Action',
  quote: 'Citat',
  stats: 'Statistik',
  contact: 'Kontakt',
  separator: 'Separator',
  youtube: 'YouTube',
  gallery: 'Galleri',
  'info-box': 'Infobox',
};

type MigrationStep = 'input' | 'analyzing' | 'preview' | 'saving' | 'done';

interface MigrationResult {
  title: string;
  blocks: ContentBlock[];
  sourceUrl: string;
  metadata: {
    originalTitle?: string;
    originalDescription?: string;
    scrapedAt: string;
  };
}

export function MigratePageDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<MigrationStep>('input');
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const createPage = useCreatePage();

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[åä]/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    
    setStep('analyzing');
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('migrate-page', {
        body: { url: url.trim() }
      });

      if (fnError) throw fnError;

      if (!data.success) {
        throw new Error(data.error || 'Analysen misslyckades');
      }

      setResult(data);
      setTitle(data.title);
      setSlug(generateSlug(data.title));
      setStep('preview');

    } catch (err) {
      console.error('Migration error:', err);
      setError(err instanceof Error ? err.message : 'Ett fel uppstod');
      setStep('input');
    }
  };

  const handleSave = async (publish: boolean) => {
    if (!result) return;

    setStep('saving');

    try {
      const page = await createPage.mutateAsync({
        title,
        slug,
        content: result.blocks,
        meta: {
          showTitle: false,
          description: result.metadata.originalDescription,
        }
      });

      if (publish && page) {
        // Update status to published
        const { error: updateError } = await supabase
          .from('pages')
          .update({ status: 'published' })
          .eq('id', page.id);

        if (updateError) throw updateError;
      }

      setStep('done');
      
      toast({
        title: publish ? 'Sida publicerad!' : 'Sida sparad som utkast!',
        description: `"${title}" har ${publish ? 'publicerats' : 'skapats'}`,
      });

      // Navigate to the new page
      setTimeout(() => {
        setOpen(false);
        navigate(`/admin/pages/${page?.id}`);
      }, 1500);

    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : 'Kunde inte spara sidan');
      setStep('preview');
    }
  };

  const handleReset = () => {
    setUrl('');
    setStep('input');
    setResult(null);
    setError(null);
    setTitle('');
    setSlug('');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) handleReset();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Importera sida
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI-driven sidimport
          </DialogTitle>
        </DialogHeader>

        {/* Step: Input URL */}
        {step === 'input' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Ange URL till en extern sida så analyserar AI:n innehållet och mappar det till CMS-block automatiskt.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="url">Webbadress</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://example.com/page"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button onClick={handleAnalyze} disabled={!url.trim()}>
                  Analysera
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step: Analyzing */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <Sparkles className="h-5 w-5 text-primary absolute -top-1 -right-1 animate-pulse" />
            </div>
            <div className="text-center">
              <p className="font-medium">Analyserar sidan...</p>
              <p className="text-sm text-muted-foreground">
                AI:n scrapar och mappar innehållet till CMS-block
              </p>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && result && (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Sidtitel</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setSlug(generateSlug(e.target.value));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL-slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              Importerad från: {result.sourceUrl}
            </div>

            <div className="flex-1 min-h-0">
              <Label className="mb-2 block">Mappade block ({result.blocks.length})</Label>
              <ScrollArea className="h-[300px] border rounded-md">
                <div className="p-4 space-y-2">
                  {result.blocks.map((block, index) => (
                    <Card key={block.id} className="bg-muted/50">
                      <CardHeader className="py-2 px-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <span className="text-muted-foreground">#{index + 1}</span>
                          {BLOCK_TYPE_ICONS[block.type] || <FileText className="h-4 w-4" />}
                          <Badge variant="secondary">
                            {BLOCK_TYPE_LABELS[block.type] || block.type}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 px-3">
                        <pre className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                          {JSON.stringify(block.data).substring(0, 100)}...
                        </pre>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleReset}>
                Börja om
              </Button>
              <Button variant="secondary" onClick={() => handleSave(false)}>
                Spara som utkast
              </Button>
              <Button onClick={() => handleSave(true)}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Publicera
              </Button>
            </div>
          </div>
        )}

        {/* Step: Saving */}
        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="font-medium">Sparar sidan...</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center">
              <p className="font-medium">Import klar!</p>
              <p className="text-sm text-muted-foreground">
                Omdirigerar till redigeraren...
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
