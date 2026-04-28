import { FileText, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export interface CoworkAttachment {
  id: string;
  name: string;
  size: number;
  kind: 'pdf' | 'text' | 'image' | 'other';
  status: 'parsing' | 'ready' | 'error';
  /** Extracted text content (for pdf/text). Empty for images/other. */
  text?: string;
  /** Optional error message when status === 'error'. */
  error?: string;
  /** Epoch ms when parsing started (used to show elapsed time). */
  startedAt?: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ElapsedBadge({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <span className="text-muted-foreground/70 shrink-0 tabular-nums">
      · {sec}s
    </span>
  );
}

export function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: CoworkAttachment;
  onRemove: () => void;
}) {
  const Icon = attachment.kind === 'image' ? ImageIcon : FileText;
  const isLargePdf =
    attachment.kind === 'pdf' && attachment.size > 1.5 * 1024 * 1024;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 pl-2 pr-1 py-1 text-xs max-w-[280px]"
      title={
        attachment.status === 'parsing' && isLargePdf
          ? 'Large PDFs can take 20–60s to extract.'
          : attachment.error || attachment.name
      }
    >
      {attachment.status === 'parsing' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <Icon
          className={
            attachment.status === 'error'
              ? 'h-3.5 w-3.5 text-destructive shrink-0'
              : 'h-3.5 w-3.5 text-muted-foreground shrink-0'
          }
        />
      )}
      <span className="truncate">{attachment.name}</span>
      <span className="text-muted-foreground/70 shrink-0">
        {formatBytes(attachment.size)}
      </span>
      {attachment.status === 'parsing' && attachment.startedAt && (
        <ElapsedBadge startedAt={attachment.startedAt} />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
