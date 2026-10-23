/**
 * One rule for every href the content layer emits.
 *
 * React 18 passes `href="javascript:…"` through with a console warning, so a
 * writer's URL field, a Tiptap link mark or an imported anchor is a live script
 * on click for every visitor — and for the admin who opens the page, with the
 * session token in localStorage. The URL parser also strips tabs and newlines
 * before it reads the scheme, so `java\tscript:` passes a naive prefix test.
 *
 * Allowed: http(s), mailto, tel, same-document anchors and same-origin paths.
 * Refused: every other scheme (javascript, data, vbscript, file, …) and
 * protocol-relative `//host` / `/\host`, which the browser reads as a new origin.
 * Scheme-less text ("example.com/page") is left alone — the browser treats it
 * as a relative path, which cannot run anything.
 */
const ALLOWED_SCHEME = /^(https?:|mailto:|tel:)/i;

export function safeHref(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // What the URL parser sees: control characters and whitespace removed.
  const seen = Array.from(trimmed).filter((c) => { const n = c.charCodeAt(0); return n > 32 && n !== 127; }).join('');
  // The value itself is returned untouched (a trailing NBSP is the author's; the
  // serializer must match Tiptap byte for byte) — only the DECISION uses `seen`.
  if (seen.startsWith('#')) return raw;
  if (seen.startsWith('/')) return seen.startsWith('//') || seen.startsWith('/\\') ? undefined : raw;
  if (seen.startsWith('\\')) return undefined;
  if (ALLOWED_SCHEME.test(seen)) return raw;
  if (!seen.includes(':')) return raw; // relative, no scheme
  return undefined;
}

/** `href` for a plain anchor: the safe value, or `undefined` so React omits the attribute. */
export const hrefOrNone = safeHref;
