import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

/**
 * Vem ligger över vem på den publika ytan.
 *
 * Varje fixerad yta stod på `z-50` — headern, mobilmenyns tre paneler,
 * chattwidgeten, popup-blocken OCH kakrutan. Med samma nivå avgör DOM-ordning,
 * och kakrutan renderas sist: på en telefon lade den sig över den meny
 * besökaren just öppnat, så de nedre grupperna inte gick att nå förrän man
 * svarat (Resta, 2026-09-10, verifierat på 375 px).
 *
 * Regeln är enkel och räcker: det besökaren SJÄLV öppnat ligger överst,
 * passiva band under. Vakten pinnar just den ordningen — den räknar inte upp
 * varje yta, den läser de två som krockade.
 */
describe('publika överlagers ordning', () => {
  it('kakrutan ligger UNDER mobilmenyn', () => {
    const banner = read('components/public/CookieBanner.tsx');
    const bannerZ = banner.match(/fixed bottom-0 left-0 right-0 (z-\[?\d+\]?)/)?.[1];
    expect(bannerZ, 'hittade inte kakrutans z-klass').toBeTruthy();
    expect(
      bannerZ,
      'kakrutan får inte ligga på samma nivå som menyn — då avgör DOM-ordning och bannern vinner',
    ).toBe('z-40');
  });

  it('mobilmenyns paneler ligger kvar på z-50', () => {
    const nav = read('components/public/PublicNavigation.tsx');
    const panels = nav.match(/fixed inset-0 top-0 left-0 z-50|fixed inset-y-0 right-0 z-50/g) ?? [];
    expect(panels.length, 'mobilpanelerna ska ligga över kakrutan').toBe(2);
  });
});
