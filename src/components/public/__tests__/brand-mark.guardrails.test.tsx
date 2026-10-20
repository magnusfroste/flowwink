import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrandMark } from '../BrandMark';
import { pagesModule } from '@/lib/modules/pages-module';
import { planImport, MAX_VIDEO_BYTES } from '../../../../supabase/functions/_shared/media/import-plan.ts';

/**
 * Guardrail: the logo-mark animation is a branding dial, with the manners a
 * runtime script never had.
 *
 * Synclair's agency delivered the mark as an After Effects animation (black
 * and white mp4). The connected ChatGPT, finding no dial, wrote a
 * MutationObserver script into custom_scripts that swapped the header image
 * for a <video> (2026-10-19). BrandMark is the dial; this locks its manners:
 * reduced motion → static; "once" is once per browser session; the static
 * logo is poster and fallback; the dark surface gets its own file, never the
 * light one.
 */
const root = join(__dirname, '../../../..');

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({ matches: q.includes('reduce') ? matches : false, media: q, addEventListener() {}, removeEventListener() {} })),
  });
}

describe('BrandMark', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    setReducedMotion(false);
  });

  it('plays the animation with the static logo as poster, then settles into the logo — once per session', () => {
    const { container, unmount } = render(<BrandMark src="/logo.svg" animationSrc="/mark.mp4" mode="once" alt="Synclair" className="h-10" />);
    const video = container.querySelector('video')!;
    expect(video).not.toBeNull();
    expect(video.getAttribute('src')).toBe('/mark.mp4');
    expect(video.getAttribute('poster')).toBe('/logo.svg');
    expect(video.muted).toBe(true);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(video.loop).toBe(false);
    expect(video.getAttribute('role')).toBe('img');
    expect(video.getAttribute('aria-label')).toBe('Synclair');
    fireEvent.ended(video);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/logo.svg');
    unmount();
    // the next page in the same session: straight to the static logo
    const again = render(<BrandMark src="/logo.svg" animationSrc="/mark.mp4" mode="once" alt="Synclair" />);
    expect(again.container.querySelector('video')).toBeNull();
    expect(again.container.querySelector('img')).not.toBeNull();
  });

  it('loop keeps looping; off and reduced motion never animate; an error falls back to the logo', () => {
    const loop = render(<BrandMark src="/logo.svg" animationSrc="/mark.mp4" mode="loop" alt="S" />);
    expect(loop.container.querySelector('video')!.loop).toBe(true);
    const off = render(<BrandMark src="/logo.svg" animationSrc="/mark.mp4" mode="off" alt="S" />);
    expect(off.container.querySelector('video')).toBeNull();
    setReducedMotion(true);
    const reduced = render(<BrandMark src="/logo.svg" animationSrc="/mark.mp4" mode="loop" alt="S" />);
    expect(reduced.container.querySelector('video')).toBeNull();
    expect(reduced.container.querySelector('img')).not.toBeNull();
    setReducedMotion(false);
    const broken = render(<BrandMark src="/logo.svg" animationSrc="/missing.mp4" mode="loop" alt="S" />);
    fireEvent.error(broken.container.querySelector('video')!);
    expect(broken.container.querySelector('img')!.getAttribute('src')).toBe('/logo.svg');
  });

  it('the header picks the animation by surface and never crosses it', () => {
    const nav = readFileSync(join(root, 'src/components/public/PublicNavigation.tsx'), 'utf8');
    expect(nav).toMatch(/const currentAnimation = onDarkSurface \? branding\?\.logoAnimationDark : branding\?\.logoAnimation;/);
    expect(nav).toMatch(/<BrandMark/);
    expect(nav).toMatch(/animationSrc=\{branding\?\.scrollAnimations === 'off' \? null : currentAnimation\}/);
  });

  it('site_branding_update takes the three dials, and the import rail brings the mp4 in', () => {
    const seed = pagesModule.skillSeeds.find((s) => s.name === 'site_branding_update')!;
    const props = (seed.tool_definition as { function: { parameters: { properties: Record<string, { enum?: string[]; description?: string }> } } }).function.parameters.properties;
    expect(props.logo_animation_url.description).toMatch(/import_from_url/);
    expect(props.logo_animation_dark_url).toBeTruthy();
    expect(props.logo_animation.enum).toEqual(['once', 'loop', 'off']);
    expect(seed.instructions).toMatch(/never a header video script in custom_scripts/);

    const ae = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
    expect(ae).toMatch(/videoUrl\('logo_animation_url', logo_animation_url\)/);
    expect(ae).toMatch(/pick\('logo_animation', logo_animation, \['once', 'loop', 'off'\]\)/);
    expect(ae).toMatch(/ct === 'video\/mp4' \|\| ct === 'video\/webm'/);

    expect(planImport({ bytes: 1_500_000, contentType: 'video/mp4', header: null }).verdict).toBe('keep');
    expect(planImport({ bytes: MAX_VIDEO_BYTES + 1, contentType: 'video/mp4', header: null }).verdict).toBe('refuse');
  });
});
