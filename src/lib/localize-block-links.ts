/**
 * Every internal link inside a page's blocks, pointed at the visitor's
 * language version of the page it names.
 *
 * The menu, the footer and the header button localised their links; the
 * blocks did not, so a Swedish page's hero button, CTA, feature cards and
 * rich-text links all led to the English pages (nordbrygg 2026-10-25: 34
 * links on seven Swedish pages had to be rewritten by hand, and would have
 * drifted again on the next edit). Applied once, where the public page hands
 * content to the renderer, so no block has to know about language — the rule
 * language.md states: blocks know nothing about language, the page does.
 *
 * Discovered, not enumerated: a link is any string under a key named `href`
 * or ending in `url` (url, ctaUrl, buttonUrl, secondaryButtonUrl, linkUrl,
 * Tiptap link marks' attrs.href …) that starts with "/". localizeHref leaves
 * anything that is not a page — /blog, /images/x.jpg, external URLs — as it
 * is, because only a slug with a sibling in the visitor's language moves.
 */
import { localizeHref, type SiblingOf } from '@/hooks/usePageSiblings';

const LINK_KEY = /^(href|.*url)$/i;

export function localizeBlockLinks<T>(value: T, siblingOf: SiblingOf, homepageSlug?: string): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      let changed = false;
      const out = node.map((item) => {
        const next = walk(item);
        if (next !== item) changed = true;
        return next;
      });
      return changed ? out : node;
    }
    if (node && typeof node === 'object') {
      let changed = false;
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(node as Record<string, unknown>)) {
        let next = v;
        if (typeof v === 'string') {
          if (LINK_KEY.test(key) && v.startsWith('/') && !v.startsWith('//')) next = localizeHref(v, siblingOf, homepageSlug);
        } else {
          next = walk(v);
        }
        if (next !== v) changed = true;
        out[key] = next;
      }
      return changed ? out : node;
    }
    return node;
  };
  return walk(value) as T;
}
