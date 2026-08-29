/**
 * Free text with live links — one implementation, every surface.
 *
 * Born in River as a local `autoLink`, needed the moment someone logged a
 * contact activity that pointed at the wiki instead of repeating it (Magnus,
 * 2026-08-29): "teamets samlade reflektioner finns i wikin: <url>". That is
 * exactly how a ledger should work — the entry stays short and points at the
 * material — but the timeline printed the URL as dead text, so the reader had
 * to select and copy it.
 *
 * Two decisions worth keeping:
 *
 * 1. An internal link navigates IN the app. A link to this instance's own
 *    /admin/... is a route, not a destination on the internet; sending it
 *    through target="_blank" reboots the whole SPA to land three metres away.
 *    Same origin → router. Everything else → new tab, noreferrer.
 *
 * 2. The link's text is always the URL itself. Activities are not written only
 *    by us — inbound email becomes activities and agents write them — so a
 *    label someone else chose over a destination someone else chose is a small
 *    phishing surface. Showing the address means seeing where you are going.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Same-origin http(s) URL → the path a router can navigate to. Otherwise null. */
export function internalPath(url: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const u = new URL(url);
    if (u.origin !== window.location.origin) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  // URLs and #tags; everything between them is rendered untouched as text.
  const parts = text.split(/(\bhttps?:\/\/\S+|#[\w-]+)/g);

  return (
    <>
      {parts.map((p, i) => {
        if (/^https?:\/\//.test(p)) {
          // Trailing punctuation belongs to the sentence, not the address:
          // "…/wiki/MoteRedeye." must not link the full stop.
          const trailing = p.match(/[.,;:!?)\]]+$/)?.[0] ?? '';
          const url = trailing ? p.slice(0, -trailing.length) : p;
          const path = internalPath(url);
          const cls = cn('text-primary underline-offset-2 hover:underline break-all', className);
          return (
            <span key={i}>
              {path ? (
                <Link to={path} className={cls}>{url}</Link>
              ) : (
                <a href={url} target="_blank" rel="noreferrer" className={cls}>{url}</a>
              )}
              {trailing}
            </span>
          );
        }
        if (/^#[\w-]+$/.test(p)) {
          return <span key={i} className="text-primary font-medium">{p}</span>;
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}
