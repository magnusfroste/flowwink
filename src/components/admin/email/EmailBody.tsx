import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatPlainEmail } from '@/lib/email-body';
import { cn } from '@/lib/utils';

/**
 * One message body in the inbox thread. Two inputs, one look:
 *  - HTML (the sender's own alternative, or our own HTML send): sanitised
 *    with DOMPurify — no scripts, styles, forms or iframes, links open in a
 *    new tab. Rendered under the same prose classes as everything else.
 *  - Plain text: escaped, linkified, paragraphed; the quoted earlier thread
 *    folds behind a toggle and the "-- " signature is dimmed.
 * Until 2026-09-02 the page put body_html ?? body_text straight into
 * innerHTML: one grey brick for text, and a stranger's markup executed.
 */
const PURIFY_OPTS = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button', 'object', 'embed', 'link', 'meta'],
  FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  ADD_ATTR: ['target', 'rel'],
};

let hooked = false;
function ensureLinkHook() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

export function EmailBody({ html, text, className }: { html?: string | null; text?: string | null; className?: string }) {
  const [showQuoted, setShowQuoted] = useState(false);

  const content = useMemo(() => {
    if (html && html.trim()) {
      ensureLinkHook();
      return { kind: 'html' as const, html: DOMPurify.sanitize(html, PURIFY_OPTS) };
    }
    return { kind: 'text' as const, ...formatPlainEmail(text) };
  }, [html, text]);

  const prose = 'prose prose-sm dark:prose-invert max-w-none break-words [&_p]:my-2 [&_a]:break-all';

  if (content.kind === 'html') {
    return <div className={cn(prose, className)} dangerouslySetInnerHTML={{ __html: content.html }} />;
  }

  return (
    <div className={className}>
      <div className={prose} dangerouslySetInnerHTML={{ __html: content.main }} />
      {content.signature && (
        <div
          className={cn(prose, 'mt-3 pt-2 border-t border-dashed text-muted-foreground text-xs [&_p]:my-1')}
          dangerouslySetInnerHTML={{ __html: content.signature }}
        />
      )}
      {content.quoted && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowQuoted((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showQuoted ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
          </button>
          {showQuoted && (
            <div
              className={cn(prose, 'mt-2 pl-3 border-l-2 border-border text-muted-foreground')}
              dangerouslySetInnerHTML={{ __html: content.quoted }}
            />
          )}
        </div>
      )}
    </div>
  );
}
