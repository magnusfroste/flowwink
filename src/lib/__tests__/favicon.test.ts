import { describe, it, expect, beforeEach } from 'vitest';
import { applyFavicon, faviconType } from '@/lib/favicon';

describe('faviconType', () => {
  it.each([
    ['data:image/png;base64,iVBOR', 'image/png'],
    ['data:image/svg+xml,<svg/>', 'image/svg+xml'],
    ['https://x.com/wp-content/cropped-favicon.png', 'image/png'],
    ['/icon.svg?v=2', 'image/svg+xml'],
    ['/favicon.ico', 'image/x-icon'],
    ['https://cdn.example.com/icon', null],
  ])('%s → %s', (href, type) => {
    expect(faviconType(href)).toBe(type);
  });
});

describe('applyFavicon', () => {
  beforeEach(() => {
    // The shell index.html ships.
    document.head.innerHTML =
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/x-icon" href="/favicon.ico">';
  });

  it('a PNG replaces both shell icons and is labelled PNG, not SVG', () => {
    applyFavicon(document, 'data:image/png;base64,iVBOR');
    const links = document.querySelectorAll('link[rel~="icon"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('data:image/png;base64,iVBOR');
    expect(links[0].getAttribute('type')).toBe('image/png');
  });

  it('an unknown type carries no type attribute rather than a wrong one', () => {
    applyFavicon(document, 'https://cdn.example.com/icon');
    const link = document.querySelector('link[rel~="icon"]')!;
    expect(link.hasAttribute('type')).toBe(false);
  });

  it('an icon the shell stamped for Helmet is taken back, so navigation cannot delete it', () => {
    // react-helmet-async removes every data-rh tag it does not render on its
    // next update; no page renders an icon (synclair 2026-10-23: the logo
    // click swapped the tab to the domain's FlowWink favicon.ico).
    document.head.innerHTML = '<link data-rh="true" rel="icon" type="image/png" href="/brand.png">';
    applyFavicon(document, '/brand.png');
    const link = document.querySelector('link[rel~="icon"]')!;
    expect(link.hasAttribute('data-rh')).toBe(false);
    expect(link.getAttribute('href')).toBe('/brand.png');
  });

  it('creates the link when the shell has none', () => {
    document.head.innerHTML = '';
    applyFavicon(document, '/brand.png');
    expect(document.querySelector('link[rel~="icon"]')?.getAttribute('type')).toBe('image/png');
  });
});
