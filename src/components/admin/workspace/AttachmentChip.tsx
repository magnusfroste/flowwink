import { FileText, Image as ImageIcon, X, Loader2 } from 'lucide-react';
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
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: CoworkAttachment;
  onRemove: () => void;
}) {
  const Icon = attachment.kind === 'image' ? ImageIcon : FileText;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 pl-2 pr-1 py-1 text-xs max-w-[240px]">
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
      <span className="truncate" title={attachment.name}>
        {attachment.name}
      </span>
      <span className="text-muted-foreground/70 shrink-0">
        {formatBytes(attachment.size)}
      </span>
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
