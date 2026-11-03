import { Children, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Copy, Check, RotateCw, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  /** Live skills executed for this answer — shown so grounding is inspectable. */
  consulted?: Array<{ skill: string; ok: boolean; ms: number }>;
  isStreaming?: boolean;
  /** Shimmer status line shown above an empty, still-working assistant bubble. */
  statusLabel?: string;
  /** Currently highlighted citation ref (mirrors the citations drawer). */
  activeCitation?: number | null;
  /** Click a [N] marker — opens / highlights the matching citation card. */
  onCitationClick?: (ref: number) => void;
  /** Hover a [N] marker (null on leave). */
  onCitationHover?: (ref: number | null) => void;
  /** Show regenerate button (assistant + last message + not streaming). */
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}

const CITATION_RE = /\[(\d{1,2})\]/g;

/** Prettify a skill name: `get_customer_360` → `get customer 360`. */
function skillLabel(name: string) {
  return name.replace(/_/g, ' ');
}

export function MessageBubble({
  role,
  content,
  consulted,
  isStreaming,
  statusLabel,
  activeCitation,
  onCitationClick,
  onCitationHover,
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

  /** Turn `[3]` inside markdown text nodes into interactive citation markers. */
  const withCitations = (children: ReactNode): ReactNode =>
    Children.map(children, (child) => {
      if (typeof child === 'string') {
        if (!CITATION_RE.test(child)) return child;
        CITATION_RE.lastIndex = 0;
        const out: ReactNode[] = [];
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = CITATION_RE.exec(child)) !== null) {
          if (m.index > last) out.push(child.slice(last, m.index));
          const ref = Number(m[1]);
          out.push(
            <button
              key={`${ref}-${m.index}`}
              type="button"
              onClick={() => onCitationClick?.(ref)}
              onMouseEnter={() => onCitationHover?.(ref)}
              onMouseLeave={() => onCitationHover?.(null)}
              className={cn(
                'mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1',
                'align-super text-[10px] font-mono leading-none transition-colors',
                activeCitation === ref
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/10 text-primary hover:bg-primary/20',
              )}
              title={`Show source [${ref}]`}
            >
              {ref}
            </button>,
          );
          last = m.index + m[0].length;
        }
        if (last < child.length) out.push(child.slice(last));
        return <>{out}</>;
      }
      // Inline elements (em/strong/links) pass through untouched.
      return child;
    });

  const showStatus = !content && (isStreaming || !!statusLabel);

  return (
    <div className="group flex flex-col gap-1.5 items-start">
      {showStatus && (
        <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </span>
          <span className="animate-pulse">{statusLabel || 'Working…'}</span>
        </div>
      )}

      {content && (
        <div
          className={cn(
            'max-w-[90%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 prose prose-sm dark:prose-invert',
            'prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-pre:my-2',
            // Tables scroll inside the bubble instead of widening it.
            '[&_table]:block [&_table]:overflow-x-auto [&_table]:text-xs [&_th]:whitespace-nowrap',
          )}
        >
          {/* GFM: tables, strikethrough, task lists. Without it a table the
              model wrote came out as one paragraph of pipes (2026-10-31) —
              FlowChat already had it. */}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p>{withCitations(children)}</p>,
              li: ({ children }) => <li>{withCitations(children)}</li>,
              td: ({ children }) => <td>{withCitations(children)}</td>,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}

      {consulted && consulted.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-1">
          {consulted.map((c, i) => (
            <span
              key={`${c.skill}-${i}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40',
                'px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted',
                !c.ok && 'line-through opacity-60 border-destructive/40',
              )}
              title={c.ok ? `${c.skill} · ${c.ms} ms` : `${c.skill} · failed`}
            >
              <Wrench className="h-2.5 w-2.5 shrink-0" />
              <span className="font-mono">{skillLabel(c.skill)}</span>
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
