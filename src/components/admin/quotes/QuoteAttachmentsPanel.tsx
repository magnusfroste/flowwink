import { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Paperclip, Upload, Trash2, ExternalLink } from 'lucide-react';
import {
  useQuoteAttachments,
  useAttachToQuote,
  useRemoveQuoteAttachment,
  openQuoteAttachment,
} from '@/hooks/useQuoteAttachments';

interface Props {
  quoteId: string;
}

const fmtBytes = (n: number | null | undefined) => {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export function QuoteAttachmentsPanel({ quoteId }: Props) {
  const { data: attachments = [], isLoading } = useQuoteAttachments(quoteId);
  const attach = useAttachToQuote();
  const remove = useRemoveQuoteAttachment();
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    attach.mutate({ quoteId, file });
    e.target.value = '';
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> Attachments
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={attach.isPending}>
          <Upload className="h-4 w-4 mr-1" /> Upload
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={onFile} />
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No attachments. Add spec PDFs, drawings, or terms — they follow the quote when sent.
          </p>
        ) : (
          attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{a.filename}</div>
                <div className="text-xs text-muted-foreground">{fmtBytes(a.documents?.file_size_bytes)}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => openQuoteAttachment(a)} title="Open">
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove.mutate({ attachmentId: a.id, quoteId })}
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
