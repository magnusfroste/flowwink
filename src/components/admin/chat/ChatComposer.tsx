import type { KeyboardEvent, ReactNode } from 'react';
import { Loader2, Paperclip, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * The text box both assistants use: a rounded card with a growing textarea,
 * an optional row of chips (Flowwork's sources and mode), attach on the
 * left, send — or stop while it works — on the right. Enter sends,
 * Shift+Enter breaks the line. FlowChat had a one-line pill input and
 * Flowwork this card; one assistant, one box.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  busy,
  canSend,
  onStop,
  onAttach,
  attaching,
  above,
  chips,
  large,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  placeholder: string;
  disabled?: boolean;
  /** Working: the send button becomes stop. */
  busy?: boolean;
  /** Defaults to "there is text". */
  canSend?: boolean;
  onStop?: () => void;
  onAttach?: () => void;
  attaching?: boolean;
  /** Attachment chips, above the text. */
  above?: ReactNode;
  /** Quick settings, under the text. */
  chips?: ReactNode;
  large?: boolean;
}) {
  const sendable = (canSend ?? value.trim().length > 0) && !busy;
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (sendable) onSend();
    }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (sendable) onSend(); }}>
      <div
        className={`rounded-2xl border border-border/60 bg-card shadow-sm focus-within:border-primary/40 focus-within:shadow-md transition-shadow ${
          large ? 'p-3' : 'p-2'
        }`}
      >
        {above && <div className="flex flex-wrap gap-1.5 px-1 pb-2 border-b border-border/40 mb-2">{above}</div>}
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={`border-0 shadow-none focus-visible:ring-0 resize-none px-2 ${
            large ? 'min-h-[64px] max-h-40 text-base' : 'min-h-[44px] max-h-32 text-sm'
          }`}
          disabled={disabled}
        />
        {chips && <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1.5">{chips}</div>}
        <div className="flex items-center justify-between pt-1.5 px-1">
          {onAttach ? (
            <Button type="button" variant="ghost" size="sm" onClick={onAttach} disabled={busy || attaching} className="text-muted-foreground gap-1.5 h-8">
              {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              <span className="text-xs hidden sm:inline">Attach</span>
            </Button>
          ) : <span />}
          {busy && onStop ? (
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={onStop} title="Stop">
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="h-8 w-8 rounded-lg" disabled={!sendable} title="Send">
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
