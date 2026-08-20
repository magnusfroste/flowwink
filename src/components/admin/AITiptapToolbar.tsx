import { useState } from 'react';
import { Editor } from '@tiptap/react';
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

interface AITiptapToolbarProps {
  editor: Editor;
  context?: string;
}

const ACTION_CONFIG: Record<AIAction, { label: string; icon: React.ReactNode }> = {
  expand: { label: 'Expand', icon: <Wand2 className="h-4 w-4" /> },
  improve: { label: 'Improve', icon: <Sparkles className="h-4 w-4" /> },
  translate: { label: 'Translate', icon: <Languages className="h-4 w-4" /> },
  summarize: { label: 'Summarize', icon: <FileText className="h-4 w-4" /> },
  continue: { label: 'Continue', icon: <ArrowRight className="h-4 w-4" /> },
};

export function AITiptapToolbar({ editor, context }: AITiptapToolbarProps) {
  const { generate, isLoading } = useAITextGeneration();
  const [preview, setPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pendingAction, setPendingAction] = useState<AIAction | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  // Selection is captured when the MENU opens — clicking a menu item moves
  // focus, and acting on a later selection state applied the result to the
  // wrong range. Harmonized with AIMarkdownToolbar (the wiki editor).
  const [selRange, setSelRange] = useState<{ from: number; to: number }>({ from: 0, to: 0 });

  const snapshotSelection = () => {
    const { from, to } = editor.state.selection;
    setSelRange({ from, to });
    setHasSelection(to > from);
  };

  const handleAction = async (action: AIAction) => {
    const { from, to } = selRange;
    // Selection required — with nothing selected the old code transformed the
    // WHOLE document and setContent() flattened every heading/list into one
    // paragraph. "Improve" on a finished post must never mean "replace it all".
    if (to <= from) return;
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (!text.trim()) return;

    const result = await generate({
      text,
      action,
      context,
      targetLanguage: action === 'translate' ? 'English' : undefined
    });

    if (result) {
      setPendingAction(action);
      setPreview(result);
      setShowPreview(true);
    }
  };

  const handleAccept = () => {
    if (!preview) return;
    const { from, to } = selRange;

    if (pendingAction === 'continue') {
      // The hook returns ONLY the continuation — replacing the selection with
      // it deleted the very text being continued. Insert after it instead.
      editor.chain().focus().insertContentAt(to, ' ' + preview).run();
    } else {
      editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, preview).run();
    }

    setPreview(null);
    setPendingAction(null);
    setShowPreview(false);
  };

  const handleReject = () => {
    setPreview(null);
    setShowPreview(false);
  };

  const actions: AIAction[] = ['expand', 'improve', 'summarize', 'continue', 'translate'];

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
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {hasSelection ? 'Transform selected text' : 'Select text in the editor first'}
          </div>
          <DropdownMenuSeparator />
          {actions.map((action) => (
            <DropdownMenuItem key={action} disabled={!hasSelection} onClick={() => handleAction(action)}>
              {ACTION_CONFIG[action].icon}
              <span className="ml-2">{ACTION_CONFIG[action].label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI Generated Text</DialogTitle>
            <DialogDescription>
              {pendingAction === 'continue'
                ? 'This will be inserted after your selection.'
                : 'This will replace your selected text.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
              {preview}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleReject}>
              <X className="h-4 w-4 mr-2" />
              Discard
            </Button>
            <Button onClick={handleAccept}>
              <Check className="h-4 w-4 mr-2" />
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
