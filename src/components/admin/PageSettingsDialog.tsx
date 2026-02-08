import { Settings, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import type { PageMeta, ContentBlock } from '@/types/cms';
import { extractPlainText } from '@/lib/tiptap-utils';
import { useAITextGeneration } from '@/hooks/useAITextGeneration';

interface PageSettingsDialogProps {
  meta: PageMeta;
  onMetaChange: (meta: PageMeta) => void;
  disabled?: boolean;
  pageTitle?: string;
  blocks?: ContentBlock[];
}

export function PageSettingsDialog({ meta, onMetaChange, disabled, pageTitle, blocks }: PageSettingsDialogProps) {
  const { generate, isLoading: aiLoading } = useAITextGeneration();

  const handleGenerateDescription = async () => {
    if (!blocks || blocks.length === 0) return;
    
    // Extract plain text from all blocks
    const parts: string[] = [];
    if (pageTitle) parts.push(pageTitle);
    for (const block of blocks) {
      if (block.data?.content) {
        const text = extractPlainText(block.data.content);
        if (text) parts.push(text);
      }
      if (block.data?.title) parts.push(String(block.data.title));
      if (block.data?.subtitle) parts.push(String(block.data.subtitle));
    }
    const pageText = parts.join('\n').slice(0, 2000);
    if (!pageText.trim()) return;

    const result = await generate({
      text: pageText,
      action: 'summarize',
      context: 'Write a concise meta description for this web page. It should be 120-160 characters, compelling, and summarize the page content for search engines. Return ONLY the meta description text, nothing else.',
    });
    if (result) {
      onMetaChange({ ...meta, description: result });
    }
  };
  const showTitle = meta.showTitle !== false;
  const titleAlignment = meta.titleAlignment || 'left';
  const seoTitle = meta.seoTitle || '';
  const noIndex = meta.noIndex || false;
  const noFollow = meta.noFollow || false;

  const updateMeta = (updates: Partial<PageMeta>) => {
    onMetaChange({ ...meta, ...updates });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Settings className="h-4 w-4 mr-2" />
          Page Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Page Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Page Title Display */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="showTitle">Show Page Title</Label>
                <p className="text-sm text-muted-foreground">
                  Display the title above the page content
                </p>
              </div>
              <Switch
                id="showTitle"
                checked={showTitle}
                onCheckedChange={(checked) => updateMeta({ showTitle: checked })}
              />
            </div>
            
            {showTitle && (
              <div className="space-y-2 pl-4 border-l-2 border-muted">
                <Label>Title Alignment</Label>
                <RadioGroup
                  value={titleAlignment}
                  onValueChange={(value: 'left' | 'center') => 
                    updateMeta({ titleAlignment: value })
                  }
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="left" id="align-left" />
                    <Label htmlFor="align-left" className="font-normal cursor-pointer">
                      Left
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="center" id="align-center" />
                    <Label htmlFor="align-center" className="font-normal cursor-pointer">
                      Center
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}
          </div>

          <Separator />

          {/* SEO Settings */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seoTitle">Custom SEO Title</Label>
              <Input
                id="seoTitle"
                value={seoTitle}
                onChange={(e) => updateMeta({ seoTitle: e.target.value })}
                placeholder="Leave empty to use the page title"
              />
              <p className="text-xs text-muted-foreground">
                Displayed in search results and browser tab
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Meta Description</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-primary"
                  onClick={handleGenerateDescription}
                  disabled={aiLoading || !blocks || blocks.length === 0}
                >
                  {aiLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Generate from content
                </Button>
              </div>
              <textarea
                id="description"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={meta.description || ''}
                onChange={(e) => updateMeta({ description: e.target.value })}
                placeholder="A concise summary of this page (120-160 characters recommended)"
              />
              <p className="text-xs text-muted-foreground">
                {(meta.description?.length || 0)} characters
                {(meta.description?.length || 0) > 0 && (meta.description?.length || 0) < 120 && ' — too short'}
                {(meta.description?.length || 0) >= 120 && (meta.description?.length || 0) <= 160 && ' — ideal length'}
                {(meta.description?.length || 0) > 160 && ' — too long'}
              </p>
            </div>
          </div>

          <Separator />

          {/* Search Engine Indexing */}
          <div className="space-y-4">
            <Label>Search Engine Indexing</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="noIndex"
                  checked={noIndex}
                  onCheckedChange={(checked) => 
                    updateMeta({ noIndex: checked === true })
                  }
                />
                <div className="space-y-0.5">
                  <Label htmlFor="noIndex" className="font-normal cursor-pointer">
                    Hide from search engines (noindex)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    The page will not appear in search results
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="noFollow"
                  checked={noFollow}
                  onCheckedChange={(checked) => 
                    updateMeta({ noFollow: checked === true })
                  }
                />
                <div className="space-y-0.5">
                  <Label htmlFor="noFollow" className="font-normal cursor-pointer">
                    Don't follow links (nofollow)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Search engines won't follow links on this page
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
