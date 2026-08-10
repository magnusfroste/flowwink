import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Copy, Check, RotateCw, Loader2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  /** Live skills executed for this answer — shown so grounding is inspectable. */
  consulted?: Array<{ skill: string; ok: boolean; ms: number }>;
  isStreaming?: boolean;
  /** Show regenerate button (assistant + last message + not streaming). */
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}

export function MessageBubble({
  role,
  content,
  consulted,
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
      {consulted && consulted.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-1 text-[11px] text-muted-foreground">
          <Wrench className="h-3 w-3 shrink-0" />
          {consulted.map((c, i) => (
            <span
              key={`${c.skill}-${i}`}
              className={cn('font-mono', !c.ok && 'line-through opacity-60')}
              title={c.ok ? `${c.ms} ms` : 'failed'}
            >
              {c.skill}
            </span>
          ))}
        </div>
      )}
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
