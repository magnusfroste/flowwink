import { useState } from 'react';
import { Wand2, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useCreatePage } from '@/hooks/usePages';
import { toast } from 'sonner';
import type { CopilotBlock, ModuleRecommendation } from '@/hooks/useCopilot';
import type { ContentBlock } from '@/types/cms';
import { BLOCK_REFERENCE } from '@/lib/block-reference';
import { defaultModulesSettings } from '@/hooks/useModules';

interface CreateFromCopilotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: CopilotBlock[];
  moduleRecommendation: ModuleRecommendation | null;
  onSuccess: () => void;
}

export function CreateFromCopilotDialog({
  open,
  onOpenChange,
  blocks,
  moduleRecommendation,
  onSuccess,
}: CreateFromCopilotDialogProps) {
  const createPage = useCreatePage();
  
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [publishNow, setPublishNow] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    // Auto-generate slug from title
    const generatedSlug = value
      .toLowerCase()
      .replace(/[åä]/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSlug(generatedSlug);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Ange ett sidnamn');
      return;
    }

    setIsCreating(true);

    try {
      // Convert CopilotBlocks to ContentBlocks
      const contentBlocks: ContentBlock[] = blocks.map((block, index) => ({
        id: `block-${Date.now()}-${index}`,
        type: block.type as ContentBlock['type'],
        data: block.data,
      }));

      await createPage.mutateAsync({
        title: title.trim(),
        slug: slug.trim() || 'untitled',
        status: publishNow ? 'published' : 'draft',
        content: contentBlocks,
        show_in_menu: true,
        menu_order: 0,
      });

      toast.success('Sidan skapad!');
      onSuccess();
    } catch (error) {
      console.error('Failed to create page:', error);
      toast.error('Kunde inte skapa sidan');
    } finally {
      setIsCreating(false);
    }
  };

  const acceptedModules = moduleRecommendation?.status === 'accepted' 
    ? moduleRecommendation.modules 
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Skapa din sida
          </DialogTitle>
          <DialogDescription>
            Ge din sida ett namn och välj om den ska publiceras direkt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Summary */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Block som skapas:</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {blocks.map((block) => {
                  const info = BLOCK_REFERENCE.find(b => b.type === block.type);
                  return (
                    <Badge key={block.id} variant="secondary" className="text-xs">
                      {info?.name || block.type}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {acceptedModules.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Aktiverade moduler:</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {acceptedModules.map((moduleId) => {
                    const module = defaultModulesSettings[moduleId];
                    return (
                      <Badge key={moduleId} variant="outline" className="text-xs text-green-600">
                        <Check className="h-3 w-3 mr-1" />
                        {module?.name || moduleId}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Page details */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Sidnamn</Label>
              <Input
                id="title"
                placeholder="t.ex. Startsida, Om oss, Kontakt"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL-slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  id="slug"
                  placeholder="startsida"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Lämna tomt för startsida
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="publish">Publicera direkt</Label>
                <p className="text-xs text-muted-foreground">
                  Annars sparas sidan som utkast
                </p>
              </div>
              <Switch
                id="publish"
                checked={publishNow}
                onCheckedChange={setPublishNow}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Skapar...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Skapa sida
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
