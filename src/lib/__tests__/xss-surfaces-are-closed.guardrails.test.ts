import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { safeHref } from '@/lib/safe-url';
import { renderToHtml } from '@/lib/tiptap-utils';
import { parseMarkdown } from '@/lib/chat-markdown';
import { isAllowedEmbedUrl } from '@/components/public/blocks/EmbedBlock.allowlist';

/**
 * Security sweep 2026-10-22: the raw-HTML and href surfaces of the CMS.
 *
 * React 18 passes `href="javascript:…"` through, the URL parser strips tabs
 * before it reads a scheme, and a writer JWT can PATCH block JSON the editor
 * would never produce. So: one href rule for every link the content layer
 * emits (safeHref), a serializer that never interpolates stored attributes
 * into tag names, an EmbedBlock whose custom code runs in a sandboxed frame
 * on an opaque origin, and no string content going into the DOM unrendered.
 */

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

describe('safeHref — one rule for every link', () => {
  it('keeps http(s), mailto, tel, anchors and same-origin paths', () => {
    for (const ok of ['https://a.se/x', 'http://a.se', 'mailto:a@b.se', 'tel:+4670', '#top', '/admin', '/x?y=1', 'example.com/page']) {
      expect(safeHref(ok), ok).toBe(ok);
    }
    // Returned untouched: the serializer must match Tiptap byte for byte.
    for (const ok of [' https://a.se ', '/x\u00a0']) {
      expect(safeHref(ok), JSON.stringify(ok)).toBe(ok);
    }
  });
  it('drops javascript:, data:, vbscript:, protocol-relative and tab-split schemes', () => {
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:x', 'java\tscript:alert(1)', 'java\nscript:1', ' data:text/html,x', 'vbscript:x', '//evil.com', '/\\evil.com', '\\\\evil', 'file:///etc/passwd']) {
      expect(safeHref(bad), JSON.stringify(bad)).toBeUndefined();
    }
    expect(safeHref('')).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});

describe('renderToHtml — stored JSON cannot smuggle markup', () => {
  it('clamps a heading level to 1–6 (Tiptap renders an unknown level as the first)', () => {
    const html = renderToHtml({ type: 'doc', content: [{ type: 'heading', attrs: { level: '1><img src=x onerror=alert(1)><h1' }, content: [{ type: 'text', text: 'x' }] }] });
    expect(html).toBe('<h1>x</h1>');
    expect(renderToHtml({ type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'x' }] }] })).toBe('<h3>x</h3>');
  });
  it('drops a javascript: href from a link mark, keeps the text', () => {
    const html = renderToHtml({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] });
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toMatch(/<a[^>]*>click<\/a>/);
    const ok = renderToHtml({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c', marks: [{ type: 'link', attrs: { href: 'https://a.se' } }] }] }] });
    expect(ok).toMatch(/href="https:\/\/a\.se"/);
  });
  it('drops a tab-split or data: href in legacy HTML', () => {
    const html = renderToHtml('<p><a href="java&#9;script:alert(1)">x</a> <a href="data:text/html,x">y</a> <a href="https://ok.se">z</a></p>');
    expect(html).not.toMatch(/javascript:|data:/i);
    expect(html).toMatch(/href="https:\/\/ok\.se"/);
  });
});

describe('chat markdown — a link stays on this site or is plainly external', () => {
  it('refuses protocol-relative links', () => {
    const html = parseMarkdown('[Click](//evil.com/x) and [ok](/page)');
    expect(html).not.toMatch(/evil\.com/);
    expect(html).toMatch(/href="\/page"/);
  });
});

describe('isAllowedEmbedUrl — https on a known host, nothing else', () => {
  it('accepts allowlisted hosts and their subdomains over https only', () => {
    expect(isAllowedEmbedUrl('https://www.youtube.com/embed/x')).toBe(true);
    expect(isAllowedEmbedUrl('https://player.vimeo.com/video/1')).toBe(true);
    expect(isAllowedEmbedUrl('http://www.youtube.com/embed/x')).toBe(false);
    expect(isAllowedEmbedUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedEmbedUrl('https://evil.com/?youtube.com')).toBe(false);
    expect(isAllowedEmbedUrl('https://youtube.com.evil.com/')).toBe(false);
    expect(isAllowedEmbedUrl('')).toBe(false);
  });
});

describe('the raw-HTML sites', () => {
  it('EmbedBlock never injects editor HTML into the page origin, and only frames allowlisted https hosts', () => {
    const src = read('src/components/public/blocks/EmbedBlock.tsx');
    expect(src).not.toMatch(/__html:\s*data\.customEmbed/);
    expect(src).toMatch(/sandbox="allow-scripts allow-popups allow-forms allow-presentation"/);
    expect(src).not.toMatch(/sandbox="[^"]*allow-same-origin/);
    expect(src).toMatch(/srcDoc=\{/);
    expect(src).toMatch(/isAllowedEmbedUrl\(data\.url\)/);
    expect(src).not.toMatch(/src=\{embedUrl \|\| data\.url\}/);
  });
  it('TabsBlock renders string content through the serializer', () => {
    expect(read('src/components/public/blocks/TabsBlock.tsx')).not.toMatch(/__html:\s*tab\.content\s*\}/);
  });
  it('email signatures are sanitized before an admin sees them', () => {
    expect(read('src/pages/admin/EmailPage.tsx')).toMatch(/__html:\s*sanitizeInlineHtml\(s\.html\)/);
    expect(read('src/components/admin/email/EmailBody.tsx')).toMatch(/FORBID_ATTR: \['style', 'class', 'id'/);
  });
  it('block and navigation hrefs go through safeHref', () => {
    for (const f of ['src/components/public/blocks/CTABlock.tsx', 'src/components/public/blocks/AnnouncementBarBlock.tsx', 'src/components/public/blocks/FeaturesBlock.tsx', 'src/components/public/blocks/BadgeBlock.tsx', 'src/components/public/blocks/PopupBlock.tsx', 'src/components/public/PublicNavigation.tsx', 'src/components/public/AnchorLink.tsx']) {
      const src = read(f);
      expect(src, f).toMatch(/safeHref\(/);
      expect(src, f).not.toMatch(/href=\{(data|item|child|feature|badge|link|col|headerCta)\.[a-zA-Z]*[uU]rl\}/);
    }
  });
  it('the customer login redirect stays on this origin', () => {
    expect(read('src/pages/account/CustomerAuthPage.tsx')).toMatch(/requested\.startsWith\('\/'\) && !requested\.startsWith\('\/\/'\)/);
  });
});
