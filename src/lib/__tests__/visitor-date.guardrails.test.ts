import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatVisitorDate } from '../visitor-date';

/**
 * Bokningskalenderns dag- och månadsnamn följer BESÖKARENS språk.
 *
 * Verifierat live 2026-08-31: /en/booking visade "mån, tis, ons" och
 * "31 aug. 2026 - 6 sep. 2026" — namnen red med platform_locale (sv-SE),
 * som är ett formatval, inte ett språk (docs/architecture/language.md §0).
 *
 * Fast klocka: varje datum är en fryst UTC-ankrad konstant. Date.now() per
 * rad har flakat förr — se page-language-grouping.guardrails.test.ts.
 */
const MON = new Date(Date.UTC(2026, 7, 31)); // måndag 31 aug 2026 — live-buggens vecka
const SUN = new Date(Date.UTC(2026, 8, 6));

describe('besökarens språk styr datumnamnen', () => {
  it('veckoradens korta veckodagsnamn', () => {
    const weekday = { weekday: 'short', year: undefined, month: undefined, day: undefined } as const;
    expect(formatVisitorDate('sv', MON, weekday)).toBe('mån');
    expect(formatVisitorDate('en', MON, weekday)).toBe('Mon');
  });

  it('veckonavigeringens intervall — exakt strängen från live-buggen', () => {
    const from = formatVisitorDate('en', MON, { year: undefined, month: 'short', day: 'numeric' });
    const to = formatVisitorDate('en', SUN, { year: 'numeric', month: 'short', day: 'numeric' });
    expect(`${from} - ${to}`).toBe('Aug 31 - Sep 6, 2026');
    expect(formatVisitorDate('sv', MON)).toBe('31 aug. 2026'); // så såg /en/booking ut
  });

  it('bekräftelsens fullständiga datum', () => {
    const full = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' } as const;
    expect(formatVisitorDate('en', MON, full)).toBe('Monday, August 31, 2026');
    expect(formatVisitorDate('sv', MON, full)).toBe('måndag 31 augusti 2026');
  });

  it('samma UTC-ankare som plattformsformatteraren — datumet driver aldrig en dag', () => {
    // En date-only-sträng renderas ordagrant oavsett testmiljöns tidszon.
    expect(formatVisitorDate('en', '2026-09-06', { year: undefined, month: undefined, day: 'numeric' })).toBe('6');
    expect(formatVisitorDate('en', null)).toBe('—');
    expect(formatVisitorDate('en', 'inte-ett-datum')).toBe('inte-ett-datum');
  });
});

describe('kopplingen i SmartBookingBlock', () => {
  const src = readFileSync(
    resolve(__dirname, '../../components/public/blocks/SmartBookingBlock.tsx'),
    'utf-8',
  );

  it('datumen kommer från useVisitorDateFormat, inte usePlatformFormat', () => {
    expect(src).toContain('useVisitorDateFormat()');
    // Plattformshooken får finnas kvar för valuta — men inte äga formatDate.
    const platformDestructure = src.match(/const\s*{([^}]*)}\s*=\s*usePlatformFormat\(\)/)?.[1] ?? '';
    expect(
      platformDestructure.includes('formatDate'),
      'SmartBookingBlock tar formatDate från usePlatformFormat igen — då visar '
      + '/en/booking "mån, tis" på nytt. Datumnamn ska gå via useVisitorDateFormat.',
    ).toBe(false);
  });
});
