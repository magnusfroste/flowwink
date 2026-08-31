import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Two things a visitor sees on every page that no page-level test covers: the
 * cookie banner and the hero's background video. Both were caught by looking at
 * a screenshot of optic, not by reading the DOM text — text assertions pass
 * happily on a banner that says the wrong thing in the wrong language.
 */

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf-8');

describe('cookie banner copy is data, not code', () => {
  const src = read('components/public/CookieBanner.tsx');
  // Everything from the component onward is render code; the defaults object
  // above it is where the English is allowed to live.
  const render = src.slice(src.indexOf('export function CookieBanner'));

  /**
   * Kontraktet har VUXIT, inte bytts ut.
   *
   * Först var rubrik, brödtext och knappar hårdkodad engelska — så optic, vars
   * hela pitch är GDPR och datasuveränitet, mötte besökaren med "We use
   * cookies". Då blev texten data.
   *
   * Men data var ETT värde. Bannern renderas på varje sida, även de engelska,
   * så optics engelska sidor mötte i stället besökaren med en SVENSK
   * cookie-ruta — innan hen ens valt språk. Nu går varje sträng genom
   * ui_text-packet, med operatörens egen text som baslager för sajtens språk
   * (operatorText) och kodens engelska längst ned.
   *
   * Två saker måste därför hålla samtidigt: ingen sträng får renderas direkt
   * ur JSX, och operatörens sparade värde får inte tappas bort.
   */
  for (const phrase of [
    'We use cookies',
    'Accept all',
    'Essential only',
    'Save selection',
    'Cookie preferences',
  ]) {
    it(`står bara som t()-fallback, aldrig i uppmärkningen`, () => {
      // Literalen får finnas som kodens engelska golv i ett t()-anrop, men
      // varje förekomst måste vara på en sådan rad — annars renderas den direkt.
      const loose = render
        .split('\n')
        .filter((line) => line.includes(phrase) && !line.includes("t('cookie."));
      expect(loose, `"${phrase}" står utanför ett t()-anrop`).toEqual([]);
    });
  }

  it('varje sträng går genom textlagret', () => {
    for (const key of ['cookie.title', 'cookie.acceptAll', 'cookie.essentialOnly', 'cookie.saveSelection']) {
      expect(src, `${key} saknas — strängen kan inte översättas`).toContain(`t('${key}'`);
    }
  });

  it('operatörens egen text vinner fortfarande för sajtens språk', () => {
    // Utan det här hade flytten till packet tyst kastat bort varje instans
    // sparade banner-text.
    expect(src).toContain('const own = settings.text ?? {}');
    expect(src).toContain('operatorText(own.title');
    expect(src).toContain('operatorText(own.acceptAll');
  });
});

describe('hero background video is decor, not a player', () => {
  const src = read('components/public/blocks/HeroBlock.tsx');
  const iframes = [...src.matchAll(/<iframe[\s\S]*?\/>/g)].map((m) => m[0]);

  it('finds the background embeds', () => {
    expect(iframes.length).toBeGreaterThan(0);
  });

  /**
   * A background video with pointer events lets a visitor click it, which
   * pauses playback — and a paused YouTube embed draws its own title bar over
   * the hero headline ("Cyberpunk Code Hacker Glitch Hi-Tech Background
   * video…" sat above "Suveränitet börjar i marken"). `showinfo=0` has been
   * ignored by YouTube since 2018, so the param list cannot prevent it.
   */
  for (const [i, frame] of iframes.entries()) {
    const isBackground = frame.includes('controls=0') || frame.includes('background=1');
    if (!isBackground) continue;
    it(`background iframe ${i + 1} cannot be clicked or paused`, () => {
      expect(
        frame.includes('pointer-events-none'),
        'a clickable background video can be paused, which reveals the provider\'s title overlay',
      ).toBe(true);
    });
  }
});
