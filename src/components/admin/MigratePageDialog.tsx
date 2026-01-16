import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Download, Sparkles, Globe, CheckCircle2, AlertCircle, FileText, Image, Layout, Type, HardDrive } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreatePage } from '@/hooks/usePages';
import { supabase } from '@/integrations/supabase/client';
import { getBlockTypeLabels } from '@/lib/block-reference';
import type { ContentBlock } from '@/types/cms';

// Dynamic icon mapping based on block category
const BLOCK_TYPE_ICONS: Record<string, React.ReactNode> = {
  hero: <Layout className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
  image: <Image className="h-4 w-4" />,
  gallery: <Image className="h-4 w-4" />,
  logos: <Image className="h-4 w-4" />,
  youtube: <Globe className="h-4 w-4" />,
  embed: <Globe className="h-4 w-4" />,
  map: <Globe className="h-4 w-4" />,
  cta: <Sparkles className="h-4 w-4" />,
  quote: <Type className="h-4 w-4" />,
  testimonials: <Type className="h-4 w-4" />,
  'info-box': <AlertCircle className="h-4 w-4" />,
  // Layout blocks
  'two-column': <Layout className="h-4 w-4" />,
  separator: <Layout className="h-4 w-4" />,
  'link-grid': <Layout className="h-4 w-4" />,
  features: <Layout className="h-4 w-4" />,
  'announcement-bar': <Layout className="h-4 w-4" />,
  tabs: <Layout className="h-4 w-4" />,
  marquee: <Layout className="h-4 w-4" />,
  popup: <Layout className="h-4 w-4" />,
  'floating-cta': <Layout className="h-4 w-4" />,
};

// Fallback icon for blocks not in the map
const getBlockIcon = (type: string): React.ReactNode => {
  return BLOCK_TYPE_ICONS[type] || <FileText className="h-4 w-4" />;
};

type MigrationStep = 'input' | 'analyzing' | 'processing-images' | 'preview' | 'saving' | 'done';

interface MigrationResult {
  title: string;
  blocks: ContentBlock[];
  sourceUrl: string;
  metadata: {
    originalTitle?: string;
    originalDescription?: string;
    platform?: string;
    videosFound?: number;
    imagesFound?: number;
    screenshotAvailable?: boolean;
    scrapedAt: string;
  };
}

interface ImageProcessingStatus {
  total: number;
  processed: number;
  current: string;
}

export function MigratePageDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<MigrationStep>('input');
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [saveImagesLocally, setSaveImagesLocally] = useState(true);
  const [imageStatus, setImageStatus] = useState<ImageProcessingStatus>({ total: 0, processed: 0, current: '' });
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const createPage = useCreatePage();
  
  // Get block labels dynamically from block-reference
  const blockLabels = useMemo(() => getBlockTypeLabels(), []);

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[åä]/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Extract all image URLs from blocks
  const extractImageUrls = (blocks: ContentBlock[]): { blockIndex: number; path: string; url: string }[] => {
    const images: { blockIndex: number; path: string; url: string }[] = [];
    
    blocks.forEach((block, blockIndex) => {
      const data = block.data as Record<string, unknown>;
      
      // Check common image fields
      if (typeof data.src === 'string' && data.src.startsWith('http')) {
        images.push({ blockIndex, path: 'src', url: data.src });
      }
      if (typeof data.backgroundImage === 'string' && data.backgroundImage.startsWith('http')) {
        images.push({ blockIndex, path: 'backgroundImage', url: data.backgroundImage });
      }
      if (typeof data.image === 'string' && data.image.startsWith('http')) {
        images.push({ blockIndex, path: 'image', url: data.image });
      }
      
      // Check gallery images
      if (Array.isArray(data.images)) {
        data.images.forEach((img, imgIndex) => {
          if (typeof img === 'object' && img !== null && typeof (img as Record<string, unknown>).src === 'string') {
            const src = (img as Record<string, unknown>).src as string;
            if (src.startsWith('http')) {
              images.push({ blockIndex, path: `images.${imgIndex}.src`, url: src });
            }
          }
        });
      }
      
      // Check article-grid items
      if (Array.isArray(data.articles)) {
        data.articles.forEach((article, articleIndex) => {
          if (typeof article === 'object' && article !== null && typeof (article as Record<string, unknown>).image === 'string') {
            const img = (article as Record<string, unknown>).image as string;
            if (img.startsWith('http')) {
              images.push({ blockIndex, path: `articles.${articleIndex}.image`, url: img });
            }
          }
        });
      }
      
      // Check link-grid items
      if (Array.isArray(data.links)) {
        data.links.forEach((link, linkIndex) => {
          if (typeof link === 'object' && link !== null && typeof (link as Record<string, unknown>).image === 'string') {
            const img = (link as Record<string, unknown>).image as string;
            if (img.startsWith('http')) {
              images.push({ blockIndex, path: `links.${linkIndex}.image`, url: img });
            }
          }
        });
      }
    });
    
    return images;
  };

  // Update block data at a nested path
  const updateBlockAtPath = (blocks: ContentBlock[], blockIndex: number, path: string, newValue: string): ContentBlock[] => {
    const newBlocks = [...blocks];
    const block = { ...newBlocks[blockIndex], data: { ...newBlocks[blockIndex].data as object } };
    
    const parts = path.split('.');
    let current: Record<string, unknown> = block.data as Record<string, unknown>;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (Array.isArray(current[key])) {
        current[key] = [...(current[key] as unknown[])];
        const idx = parseInt(parts[i + 1]);
        if (!isNaN(idx)) {
          (current[key] as unknown[])[idx] = { ...((current[key] as unknown[])[idx] as object) };
          current = (current[key] as unknown[])[idx] as Record<string, unknown>;
          i++; // Skip the index part
        }
      } else if (typeof current[key] === 'object' && current[key] !== null) {
        current[key] = { ...(current[key] as object) };
        current = current[key] as Record<string, unknown>;
      }
    }
    
    const lastKey = parts[parts.length - 1];
    current[lastKey] = newValue;
    
    newBlocks[blockIndex] = block;
    return newBlocks;
  };

  // Process images through edge function
  const processImages = async (blocks: ContentBlock[]): Promise<ContentBlock[]> => {
    const images = extractImageUrls(blocks);
    
    if (images.length === 0) {
      return blocks;
    }
    
    setImageStatus({ total: images.length, processed: 0, current: '' });
    let updatedBlocks = blocks;
    
    for (let i = 0; i < images.length; i++) {
      const { blockIndex, path, url } = images[i];
      setImageStatus({ total: images.length, processed: i, current: url.substring(0, 50) + '...' });
      
      try {
        const { data, error } = await supabase.functions.invoke('process-image', {
          body: { imageUrl: url }
        });
        
        if (error) {
          console.warn(`Failed to process image ${url}:`, error);
          continue;
        }
        
        if (data.success && data.url) {
          updatedBlocks = updateBlockAtPath(updatedBlocks, blockIndex, path, data.url);
          console.log(`Processed image: ${url} → ${data.url}`);
        }
      } catch (err) {
        console.warn(`Error processing image ${url}:`, err);
        // Continue with other images even if one fails
      }
    }
    
    setImageStatus({ total: images.length, processed: images.length, current: '' });
    return updatedBlocks;
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
        throw new Error(data.error || 'Analysis failed');
      }

      let processedBlocks = data.blocks;
      
      // Process images if option is enabled
      if (saveImagesLocally && data.blocks.length > 0) {
        setStep('processing-images');
        processedBlocks = await processImages(data.blocks);
      }

      setResult({ ...data, blocks: processedBlocks });
      setTitle(data.title);
      setSlug(generateSlug(data.title));
      setStep('preview');

    } catch (err) {
      console.error('Migration error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
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
        const { error: updateError } = await supabase
          .from('pages')
          .update({ status: 'published' })
          .eq('id', page.id);

        if (updateError) throw updateError;
      }

      setStep('done');
      
      toast({
        title: publish ? 'Page published!' : 'Page saved as draft!',
        description: `"${title}" has been ${publish ? 'published' : 'created'}`,
      });

      setTimeout(() => {
        setOpen(false);
        navigate(`/admin/pages/${page?.id}`);
      }, 1500);

    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : 'Could not save the page');
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
    setImageStatus({ total: 0, processed: 0, current: '' });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) handleReset();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Import Page
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI-Powered Page Import
          </DialogTitle>
        </DialogHeader>

        {/* Step: Input URL */}
        {step === 'input' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Enter a URL to an external page and the AI will analyze the content and map it to CMS blocks automatically.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="url">Web Address</Label>
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
                  Analyze
                </Button>
              </div>
            </div>

            {/* Save images locally toggle */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="save-images" className="text-sm font-medium cursor-pointer">
                    Save images locally
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Downloads and saves all images to the media library
                  </p>
                </div>
              </div>
              <Switch
                id="save-images"
                checked={saveImagesLocally}
                onCheckedChange={setSaveImagesLocally}
              />
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
              <p className="font-medium">Analyzing page...</p>
              <p className="text-sm text-muted-foreground">
                AI is scraping and mapping content to CMS blocks
              </p>
            </div>
          </div>
        )}

        {/* Step: Processing Images */}
        {step === 'processing-images' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <HardDrive className="h-5 w-5 text-primary absolute -top-1 -right-1 animate-pulse" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-medium">Downloading images...</p>
              <p className="text-sm text-muted-foreground">
                {imageStatus.processed} of {imageStatus.total} images
              </p>
              {imageStatus.current && (
                <p className="text-xs text-muted-foreground font-mono truncate max-w-md">
                  {imageStatus.current}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && result && (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Page Title</Label>
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
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span className="truncate max-w-[300px]">{result.sourceUrl}</span>
              {result.metadata.platform && result.metadata.platform !== 'unknown' && (
                <Badge variant="outline" className="capitalize">
                  {result.metadata.platform}
                </Badge>
              )}
              {saveImagesLocally && (
                <Badge variant="secondary">
                  <HardDrive className="h-3 w-3 mr-1" />
                  Local images
                </Badge>
              )}
              {result.metadata.videosFound && result.metadata.videosFound > 0 && (
                <Badge variant="secondary">
                  {result.metadata.videosFound} videos
                </Badge>
              )}
              {result.metadata.imagesFound && result.metadata.imagesFound > 0 && (
                <Badge variant="secondary">
                  <Image className="h-3 w-3 mr-1" />
                  {result.metadata.imagesFound} images
                </Badge>
              )}
            </div>

            <div className="flex-1 min-h-0">
              <Label className="mb-2 block">Mapped blocks ({result.blocks.length})</Label>
              <ScrollArea className="h-[300px] border rounded-md">
                <div className="p-4 space-y-2">
                  {result.blocks.map((block, index) => (
                    <Card key={block.id} className="bg-muted/50">
                      <CardHeader className="py-2 px-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <span className="text-muted-foreground">#{index + 1}</span>
                          {getBlockIcon(block.type)}
                          <Badge variant="secondary">
                            {blockLabels[block.type] || block.type}
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
                Start Over
              </Button>
              <Button variant="secondary" onClick={() => handleSave(false)}>
                Save as Draft
              </Button>
              <Button onClick={() => handleSave(true)}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Publish
              </Button>
            </div>
          </div>
        )}

        {/* Step: Saving */}
        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="font-medium">Saving page...</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center">
              <p className="font-medium">Import complete!</p>
              <p className="text-sm text-muted-foreground">
                Redirecting to editor...
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
