import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const HOOKS = readFileSync(resolve(ROOT, 'src/hooks/useSiteSettings.tsx'), 'utf8');
const RESET = readFileSync(resolve(ROOT, 'src/components/admin/ResetSiteDialog.tsx'), 'utf8');
const BLOG_TAB = readFileSync(resolve(ROOT, 'src/components/admin/blog/BlogSettingsTab.tsx'), 'utf8');

/**
 * Ett defaultvärde per inställning.
 *
 * `blog.archiveTitle` hade TRE: kodfallbacken sa 'Blogg', reset-seeden 'Blog'
 * och adminfältets platshållare 'Blogg'. Vilket en instans fick berodde på om
 * raden råkade finnas — och eftersom ingen livesajt hade någon blog-rad alls
 * körde alla på fallbacken. Det var därför Optics ENGELSKA sida visade
 * "Blogg" i menyn: ingen hade valt ordet, det var bara vad koden föll tillbaka
 * på.
 *
 * Klassen är inte "svenska i en engelsk produkt" — det är att samma fråga har
 * flera svar på olika ställen, vilket gör beteendet beroende av vilken väg
 * instansen råkade ta.
 */
describe('ett defaultvärde per inställning', () => {
  const codeFallback = HOOKS.match(/archiveTitle:\s*'([^']*)'/)?.[1];
  const resetSeed = RESET.match(/archiveTitle:\s*'([^']*)'/)?.[1];
  const placeholder = BLOG_TAB.match(/id="archiveTitle"[\s\S]*?placeholder="([^"]*)"/)?.[1];

  it('alla tre källorna finns kvar att jämföra', () => {
    expect(codeFallback, 'kodfallbacken hittades inte').toBeTruthy();
    expect(resetSeed, 'reset-seeden hittades inte').toBeTruthy();
    expect(placeholder, 'platshållaren hittades inte').toBeTruthy();
  });

  it('kodfallback och reset-seed säger samma sak om archiveTitle', () => {
    expect(codeFallback).toBe(resetSeed);
  });

  it('adminfältets platshållare lovar samma default som koden ger', () => {
    // En platshållare är ett löfte om vad som händer om man lämnar fältet tomt.
    expect(placeholder).toBe(codeFallback);
  });

  it('navet läser ingen slug som rutterna inte känner till', () => {
    // archiveSlug byggde menylänken medan rutterna var hårdkodade /blog — den
    // som skrev något i fältet fick en meny som pekade på en 404.
    const NAV = readFileSync(resolve(ROOT, 'src/components/public/PublicNavigation.tsx'), 'utf8');
    expect(NAV).not.toContain('archiveSlug');
  });
});
