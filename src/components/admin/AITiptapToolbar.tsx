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
  const [replaceSelection, setReplaceSelection] = useState(false);

  const getTextForAI = (): string => {
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    
    if (hasSelection) {
      return editor.state.doc.textBetween(from, to, ' ');
    }
    return editor.getText();
  };

  const handleAction = async (action: AIAction) => {
    const text = getTextForAI();
    if (!text.trim()) return;

    const { from, to } = editor.state.selection;
    setReplaceSelection(from !== to);

    const result = await generate({
      text,
      action,
      context,
      targetLanguage: action === 'translate' ? 'English' : undefined
    });

    if (result) {
      setPreview(result);
      setShowPreview(true);
    }
  };

  const handleAccept = () => {
    if (!preview) return;

    const { from, to } = editor.state.selection;
    
    if (replaceSelection && from !== to) {
      // Replace selected text
      editor.chain().focus().deleteSelection().insertContent(preview).run();
    } else {
      // Replace all content
      editor.commands.setContent(`<p>${preview}</p>`);
    }

    setPreview(null);
    setShowPreview(false);
  };

  const handleReject = () => {
    setPreview(null);
    setShowPreview(false);
  };

  const actions: AIAction[] = ['expand', 'improve', 'summarize', 'continue', 'translate'];

  return (
    <>
      <DropdownMenu>
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
            {editor.state.selection.from !== editor.state.selection.to 
              ? 'Transform selected text' 
              : 'Transform all content'}
          </div>
          <DropdownMenuSeparator />
          {actions.map((action) => (
            <DropdownMenuItem key={action} onClick={() => handleAction(action)}>
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
              {replaceSelection 
                ? 'This will replace your selected text.' 
                : 'This will replace all content in the editor.'}
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
