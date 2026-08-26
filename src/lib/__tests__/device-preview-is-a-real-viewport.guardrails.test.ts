/**
 * Mobil-/surfplatteförhandsvisningen är en RIKTIG viewport — inte en smal spalt.
 *
 * Före 2026-08-26 krympte sideditorns previewMode bara en container
 * (max-w-[375px]). Tailwinds md:-brytpunkter svarar på VIEWPORT-bredd, så
 * "mobilvyn" visade desktop-layout i smal spalt: TwoColumn sida-vid-sida i
 * stället för staplad, features-grid i tre kolumner. Fixen: mobile/tablet
 * renderas i en läs-läges-<iframe> med äkta viewportbredd 375/768 via den
 * publika renderarens väg (PageBlocks → BlockRenderer), medan desktop förblir
 * den redigerbara BlockEditor-ytan.
 *
 * Vakterna pinnar mekaniken som gör detta sant:
 *  1. Editorn fejkar inte längre bredd med max-w-klasser utan monterar
 *     PreviewFrame + PageBlocks för device-lägena.
 *  2. PreviewFrame klonar förälderns stylesheets in i ramens <head> (annars
 *     är iframen ostylad), applicerar branding på RAMENS documentElement
 *     (admin-föräldern har variablerna avsiktligt återställda) och blockerar
 *     länknavigering + formulärsubmit (läs-läge — inget klick får navigera
 *     bort portal-dokumentet).
 *  3. useScrollAnimation läser element.ownerDocument — annars observerar
 *     reveal-on-scroll fel viewport och blocken fastnar i opacity-0 inne i
 *     ramen.
 *  4. Auto-bakgrundsslingan (FULL_BLEED/SELF_STYLED) bor i PageBlocks —
 *     PreviewPage och TemplateLivePreviewPage får inte återfå egna kopior.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

describe('device-förhandsvisningen är en riktig viewport', () => {
  it('editorn monterar PreviewFrame + PageBlocks — ingen fejkad max-w-viewport', () => {
    const editor = read('pages/admin/PageEditorPage.tsx');
    expect(editor).not.toContain('max-w-[375px]');
    expect(editor).not.toContain('max-w-[768px]');
    expect(editor).toContain('PreviewFrame');
    expect(editor).toContain('PageBlocks');
    // 375/768 är devicebredder, inte containerbredder
    expect(editor).toMatch(/previewMode === 'mobile' \? 375 : 768/);
  });

  it('PreviewFrame klonar stylesheets, brandar ramens dokument och är läs-läge', () => {
    const frame = read('components/admin/PreviewFrame.tsx');
    // stylesheets in i ramen — både Vite-dev <style> och byggda <link>
    expect(frame).toContain(`querySelectorAll('style, link[rel="stylesheet"]')`);
    // branding går på RAMENS documentElement, inte förälderns
    expect(frame).toContain('applyBrandingToDocument(branding, frame.contentDocument)');
    // läs-läge: klick på länkar och submits stoppas i capture-fas
    expect(frame).toContain(`closest('a[href]')`);
    expect(frame).toMatch(/addEventListener\('submit', .*true\)/);
    // temat speglas och hålls i synk
    expect(frame).toContain('MutationObserver');
  });

  it('useScrollAnimation observerar elementets EGEN viewport', () => {
    const hook = read('hooks/useScrollAnimation.ts');
    expect(hook).toContain('element.ownerDocument');
    expect(hook).toContain('new win.IntersectionObserver');
  });

  it('auto-bakgrundsslingan bor i PageBlocks — inga nya kopior i preview-ytorna', () => {
    expect(read('components/public/PageBlocks.tsx')).toContain('SELF_STYLED');
    expect(read('pages/PreviewPage.tsx')).not.toContain('SELF_STYLED');
    expect(read('pages/admin/TemplateLivePreviewPage.tsx')).not.toContain('SELF_STYLED');
  });
});
