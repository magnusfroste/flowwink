import { useState } from 'react';
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
import { cn } from '@/lib/utils';

interface AITextAssistantProps {
  value: string;
  onChange: (newValue: string) => void;
  context?: string;
  actions?: AIAction[];
  compact?: boolean;
  className?: string;
}

const ACTION_CONFIG: Record<AIAction, { label: string; icon: React.ReactNode; description: string }> = {
  expand: { 
    label: 'Expand', 
    icon: <Wand2 className="h-4 w-4" />, 
    description: 'Generate more content from keywords' 
  },
  improve: { 
    label: 'Improve', 
    icon: <Sparkles className="h-4 w-4" />, 
    description: 'Enhance clarity and grammar' 
  },
  translate: { 
    label: 'Translate', 
    icon: <Languages className="h-4 w-4" />, 
    description: 'Translate to another language' 
  },
  summarize: { 
    label: 'Summarize', 
    icon: <FileText className="h-4 w-4" />, 
    description: 'Create a brief summary' 
  },
  continue: { 
    label: 'Continue', 
    icon: <ArrowRight className="h-4 w-4" />, 
    description: 'Continue writing naturally' 
  },
};

export function AITextAssistant({ 
  value, 
  onChange, 
  context, 
  actions = ['expand', 'improve'], 
  compact = false,
  className 
}: AITextAssistantProps) {
  const { generate, isLoading } = useAITextGeneration();
  const [preview, setPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleAction = async (action: AIAction) => {
    const result = await generate({ 
      text: value, 
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
    if (preview) {
      onChange(preview);
      setPreview(null);
      setShowPreview(false);
    }
  };

  const handleReject = () => {
    setPreview(null);
    setShowPreview(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            type="button" 
            variant="ghost" 
            size={compact ? "icon" : "sm"}
            className={cn("text-muted-foreground hover:text-primary", className)}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {!compact && <span className="ml-2">AI</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {actions.map((action, index) => (
            <div key={action}>
              {index > 0 && action === 'translate' && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => handleAction(action)}>
                {ACTION_CONFIG[action].icon}
                <span className="ml-2">{ACTION_CONFIG[action].label}</span>
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI Generated Text</DialogTitle>
            <DialogDescription>
              Review the generated text before applying it.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">
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
