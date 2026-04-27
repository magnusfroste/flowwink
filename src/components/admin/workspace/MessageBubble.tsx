import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Copy, Check, RotateCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  /** Show regenerate button (assistant + last message + not streaming). */
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}

export function MessageBubble({
  role,
  content,
  isStreaming,
  canRegenerate,
  onRegenerate,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (role === 'user') {
    return (
      <div className="flex justify-end group">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5">
          <p className="whitespace-pre-wrap m-0 text-sm">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-1.5 items-start">
      <div
        className={cn(
          'max-w-[90%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 prose prose-sm dark:prose-invert',
          'prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-pre:my-2',
        )}
      >
        {content ? (
          <ReactMarkdown>{content}</ReactMarkdown>
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {content && !isStreaming && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pl-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 mr-1" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 mr-1" /> Copy
              </>
            )}
          </Button>
          {canRegenerate && onRegenerate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={onRegenerate}
            >
              <RotateCw className="h-3 w-3 mr-1" /> Regenerate
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
