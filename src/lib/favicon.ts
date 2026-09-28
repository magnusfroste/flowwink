/**
 * The browser decodes a favicon by its declared `type`. index.html ships
 * FlowWink's own icons as `image/svg+xml` and `image/x-icon`; swapping only
 * the href left a PNG labelled SVG — the tab showed nothing (MJP 2026-09-28),
 * and the untouched favicon.ico link stayed as a second candidate.
 *
 * So the operator's icon replaces BOTH shell links and carries its own type,
 * read from a data: URI or the file extension. Unknown → no type attribute
 * (the browser sniffs), never a wrong one.
 */
const EXT_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function faviconType(href: string): string | null {
  const data = /^data:([^;,]+)[;,]/i.exec(href);
  if (data) return data[1].toLowerCase();
  const path = href.split(/[?#]/)[0];
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  return (ext && EXT_TYPES[ext]) || null;
}

export function applyFavicon(doc: Document, href: string): void {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  const link = links[0] ?? doc.createElement('link');
  links.slice(1).forEach((l) => l.remove());
  link.rel = 'icon';
  link.setAttribute('href', href);
  const type = faviconType(href);
  if (type) link.setAttribute('type', type);
  else link.removeAttribute('type');
  if (!link.parentNode) doc.head.appendChild(link);
}
