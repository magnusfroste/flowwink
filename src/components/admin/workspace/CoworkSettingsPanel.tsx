import { useEffect, useState } from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Settings2, Loader2 } from 'lucide-react';
import {
  useCoworkSettings,
  useSaveCoworkSettings,
  DEFAULT_COWORK_SETTINGS,
  type CoworkChatSettings,
} from '@/hooks/useCoworkSettings';
import { useToast } from '@/hooks/use-toast';

export function CoworkSettingsPanel() {
  const { data, isLoading } = useCoworkSettings();
  const save = useSaveCoworkSettings();
  const { toast } = useToast();
  const [draft, setDraft] = useState<CoworkChatSettings>(DEFAULT_COWORK_SETTINGS);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const handleSave = async () => {
    try {
      await save.mutateAsync(draft);
      toast({ title: 'Flowwork settings saved' });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    }
  };

  const strict = draft.mode === 'strict';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4 mr-1.5" /> Settings
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Flowwork settings</SheetTitle>
          <SheetDescription>
            Control how the assistant blends your workspace data with the model's
            own knowledge and the public web.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Mode</Label>
              <RadioGroup
                value={draft.mode}
                onValueChange={(v) =>
                  setDraft({ ...draft, mode: v as 'strict' | 'cowork' })
                }
                className="space-y-2"
              >
                <label className="flex gap-3 items-start cursor-pointer rounded-md border border-border/60 p-3 hover:bg-muted/40">
                  <RadioGroupItem value="cowork" id="mode-cowork" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Flowwork (recommended)</div>
                    <div className="text-xs text-muted-foreground">
                      Grounds in your workspace data, then uses the model's own
                      knowledge and web search when needed.
                    </div>
                  </div>
                </label>
                <label className="flex gap-3 items-start cursor-pointer rounded-md border border-border/60 p-3 hover:bg-muted/40">
                  <RadioGroupItem value="strict" id="mode-strict" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Strict workspace-only</div>
                    <div className="text-xs text-muted-foreground">
                      Refuses any answer not present in your data. No world
                      knowledge, no web search.
                    </div>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="world" className="text-sm font-medium">
                    Allow model knowledge
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Let the model fall back to its own training data when the
                    workspace context is insufficient.
                  </p>
                </div>
                <Switch
                  id="world"
                  checked={draft.allowWorldKnowledge && !strict}
                  disabled={strict}
                  onCheckedChange={(v) =>
                    setDraft({ ...draft, allowWorldKnowledge: v })
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="web" className="text-sm font-medium">
                    Allow web search
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enables a <code className="text-[10px]">web_search</code> tool
                    backed by Firecrawl. Requires <code className="text-[10px]">FIRECRAWL_API_KEY</code>.
                  </p>
                </div>
                <Switch
                  id="web"
                  checked={draft.allowWebSearch && !strict}
                  disabled={strict}
                  onCheckedChange={(v) =>
                    setDraft({ ...draft, allowWebSearch: v })
                  }
                />
              </div>
            </div>

            <Separator />

            <div className="text-xs text-muted-foreground">
              Sources can be toggled per-conversation in the left panel. Changes
              made there don't override the saved defaults.
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Save settings
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
