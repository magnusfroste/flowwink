import DOMPurify from 'dompurify';

/**
 * HTML a person other than the reader wrote, shown inside the admin: an email
 * signature, a snippet. One sanitizer, no inline style, no class or id (the
 * admin's own Tailwind classes would otherwise let `fixed inset-0` paint a
 * fake dialog over the page), no forms or frames. Scripts and `on*` go by
 * DOMPurify's own defaults.
 */
export function sanitizeInlineHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button', 'textarea', 'select', 'object', 'embed', 'link', 'meta', 'base', 'svg', 'math'],
    FORBID_ATTR: ['style', 'class', 'id', 'name'],
  });
}
