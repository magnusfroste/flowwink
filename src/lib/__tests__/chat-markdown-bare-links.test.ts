import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '@/lib/chat-markdown';

/**
 * MJP (2026-09-29): the chat answered "…read the full comparison at
 * /kb/mixed-flow-vs-axial-flow-…" and "…listed at /contact-us." — as dead
 * text, because only [label](url) became a link. A visitor should be able to
 * click where the answer points, however the model spelled it.
 */
const links = (html: string) =>
  [...html.matchAll(/<a href="([^"]+)"([^>]*)>([^<]*)<\/a>/g)].map((m) => ({ href: m[1], external: /target="_blank"/.test(m[2]), text: m[3] }));

describe('bare links in chat answers', () => {
  it('a bare site path becomes an in-tab link, the full stop stays outside', () => {
    const html = parseMarkdown('Your regional sales rep is listed at /contact-us.');
    expect(links(html)).toEqual([{ href: '/contact-us', external: false, text: '/contact-us' }]);
    expect(html).toMatch(/<\/a>\.<\/p>/);
  });

  it('a nested path with hyphens, and one inside parentheses', () => {
    const html = parseMarkdown('Read /kb/mixed-flow-vs-axial-flow (or /waterjets-x).');
    expect(links(html).map((l) => l.href)).toEqual(['/kb/mixed-flow-vs-axial-flow', '/waterjets-x']);
  });

  it('a bare web address opens in a new tab', () => {
    const html = parseMarkdown('Brochure: https://marinejetpower.com/wp-content/uploads/b.pdf, page 4.');
    expect(links(html)).toEqual([{ href: 'https://marinejetpower.com/wp-content/uploads/b.pdf', external: true, text: 'https://marinejetpower.com/wp-content/uploads/b.pdf' }]);
  });

  it('text that only looks like a path stays text', () => {
    for (const t of ['Choose axial and/or mixed flow.', 'A 1/2 inch clearance.', 'Use `/contact-us` literally.']) {
      expect(links(parseMarkdown(t)), t).toEqual([]);
    }
  });

  it('an existing markdown link is not linked twice', () => {
    const html = parseMarkdown('See [the contact page](/contact-us) or /support.');
    expect(links(html)).toEqual([
      { href: '/contact-us', external: false, text: 'the contact page' },
      { href: '/support', external: false, text: '/support' },
    ]);
  });

  it('links in list items too', () => {
    const html = parseMarkdown('- Sizing: /jet-selector-tool\n- Parts: /spare-parts');
    expect(links(html).map((l) => l.href)).toEqual(['/jet-selector-tool', '/spare-parts']);
  });
});
