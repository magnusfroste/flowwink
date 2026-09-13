import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Ett reglage som går att slå på måste göra något i varje layout.
 *
 * Hero-blockets "Controls" ritade sina knappar (spela/pausa, ljud) bara i
 * helbreddsheron. I split-layout gick reglaget att slå på och ingenting hände
 * — Magnus fick prova sig fram till vad det gjorde (2026-09-13). Samma klass
 * som ett fält registret annonserar men ingen renderare läser.
 *
 * Vakten läser split-grenen och kräver att den anropar renderVideoControls.
 */
describe('hero-videons kontroller', () => {
  const src = readFileSync(
    resolve(__dirname, '../../components/public/blocks/HeroBlock.tsx'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

  it('split-layouten ritar kontrollerna', () => {
    const start = src.indexOf("if (layout === 'split-left' || layout === 'split-right')");
    expect(start, 'hittade inte split-grenen').toBeGreaterThan(-1);
    // Grenen slutar där den centrerade layouten tar vid.
    const end = src.indexOf('// Centered layout', start);
    const branch = src.slice(start, end > start ? end : undefined);
    expect(
      branch.includes('renderVideoControls()'),
      'Controls-reglaget gör ingenting i split-layout — anropa renderVideoControls() i mediasidan',
    ).toBe(true);
  });

  it('helbreddsheron ritar dem fortfarande', () => {
    const calls = src.match(/renderVideoControls\(\)/g) ?? [];
    expect(calls.length, 'kontrollerna ska ritas i båda layouterna').toBeGreaterThanOrEqual(2);
  });
});
