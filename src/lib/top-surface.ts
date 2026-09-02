import type { ContentBlock } from '@/types/cms';

/**
 * Does the page's FIRST block paint a dark surface right under an overlay
 * header? A transparent header floats over the first block, and its links
 * are theme-coloured (`text-foreground`) — dark in the light theme. Over a
 * dark hero photo that is dark-on-dark: the consult-agency template went
 * transparent 2026-09-02 and its nav vanished in the light theme (Optic never
 * hit this because it runs the dark theme). The header can't see the page,
 * so the page tells it.
 *
 * The answer mirrors the renderers' own text-colour ladders so the two never
 * disagree: HeroBlock — `textTheme` override first, then `overlayColor`
 * ('light' = dark text, everything else = light text; a 'color' background
 * is a primary gradient with light text too). ParallaxSectionBlock — light
 * text unless `textColor: 'dark'`. Any other first block starts under the
 * header's own offset on the page background: not dark.
 */
export function topSurfaceIsDark(block: ContentBlock | undefined | null): boolean {
  if (!block) return false;
  const d = (block.data ?? {}) as Record<string, unknown>;
  if (block.type === 'hero') {
    if (d.textTheme === 'light') return true;
    if (d.textTheme === 'dark') return false;
    return d.overlayColor !== 'light';
  }
  if (block.type === 'parallax-section') {
    return d.textColor !== 'dark';
  }
  return false;
}
