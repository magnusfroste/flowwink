import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, Wand2, Languages, FileText, ArrowRight, Loader2, Check, X } from 'lucide-react';
import { useAITextGeneration, AIAction } from '@/hooks/useAITextGeneration';

/**
 * The AI toolbox for MARKDOWN textareas (the wiki editor) — the same five
 * language utilities as the shared AITiptapToolbar, through the same
 * useAITextGeneration hook (Law 3: utilities, not a parallel pipeline).
 *
 * Deliberate differences from the Tiptap variant:
 * - Operates on the textarea SELECTION only — with nothing selected the verbs
 *   are shown disabled instead of transforming the whole document. Wiki pages
 *   are long (the master is 64k chars); "improve everything" is never what a
 *   writer wants there, and content-level work belongs to FlowWork (grounded,
 *   staged, provenance) — not an editor button.
 * - `continue` INSERTS after the selection instead of replacing it.
 */
interface AIMarkdownToolbarProps {
  value: string;
  onChange: (next: string) => void;
  context?: string;
}

const ACTION_CONFIG: Record<AIAction, { label: string; icon: React.ReactNode }> = {
  expand: { label: 'Expand', icon: <Wand2 className="h-4 w-4" /> },
  improve: { label: 'Improve', icon: <Sparkles className="h-4 w-4" /> },
  translate: { label: 'Translate', icon: <Languages className="h-4 w-4" /> },
  summarize: { label: 'Summarize', icon: <FileText className="h-4 w-4" /> },
  continue: { label: 'Continue', icon: <ArrowRight className="h-4 w-4" /> },
};

const ACTIONS: AIAction[] = ['improve', 'expand', 'summarize', 'continue', 'translate'];

export function AIMarkdownToolbar({ value, onChange, context }: AIMarkdownToolbarProps) {
  const { generate, isLoading } = useAITextGeneration();
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<AIAction | null>(null);
  // Selection is captured when the menu OPENS — clicking a menu item blurs the
  // textarea and collapses the live selection, so we snapshot it up front.
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const [hasSelection, setHasSelection] = useState(false);

  const snapshotSelection = () => {
    // The wiki editor renders exactly one markdown textarea; walking the DOM
    // here spares every caller a ref-plumbing exercise.
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-ai-md-target]');
    const start = ta?.selectionStart ?? 0;
    const end = ta?.selectionEnd ?? 0;
    selRef.current = { start, end };
    setHasSelection(end > start);
  };

  const handleAction = async (action: AIAction) => {
    const { start, end } = selRef.current;
    const text = value.slice(start, end);
    if (!text.trim()) return;

    const result = await generate({
      text,
      action,
      context,
      targetLanguage: action === 'translate' ? 'English' : undefined,
    });
    if (result) {
      setPendingAction(action);
      setPreview(result);
    }
  };

  const handleAccept = () => {
    if (preview === null) return;
    const { start, end } = selRef.current;
    const next =
      pendingAction === 'continue'
        ? value.slice(0, end) + '\n\n' + preview + value.slice(end)
        : value.slice(0, start) + preview + value.slice(end);
    onChange(next);
    setPreview(null);
    setPendingAction(null);
  };

  const handleReject = () => {
    setPreview(null);
    setPendingAction(null);
  };

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open) snapshotSelection(); }}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-primary"
            disabled={isLoading}
            title="AI text tools (select text first)"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-1 text-xs">AI</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {hasSelection
              ? 'Transform selected text'
              : 'Select text in the editor first'}
          </div>
          <DropdownMenuSeparator />
          {ACTIONS.map((action) => (
            <DropdownMenuItem key={action} disabled={!hasSelection} onClick={() => handleAction(action)}>
              {ACTION_CONFIG[action].icon}
              <span className="ml-2">{ACTION_CONFIG[action].label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
            Language tools only — for new content, ask FlowWork (grounded &amp; approved).
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) handleReject(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI suggestion</DialogTitle>
            <DialogDescription>
              {pendingAction === 'continue'
                ? 'This will be inserted after your selection.'
                : 'This will replace your selected text.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
              {preview}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleReject}>
              <X className="h-4 w-4 mr-1" /> Discard
            </Button>
            <Button onClick={handleAccept}>
              <Check className="h-4 w-4 mr-1" /> Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
