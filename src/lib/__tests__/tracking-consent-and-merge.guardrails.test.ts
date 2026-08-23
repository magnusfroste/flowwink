import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Spärr: mätningen lyder samtycket, och reglaget raderar inte konfigurationen.
 *
 * 2026-08-22. Två fel som möttes i samma funktion.
 *
 * 1. BANNERN VAR DEKORATIV. Sajtens egen sidvisningsräknare respekterade
 *    `hasConsent('analytics')` — men GA4- och Meta Pixel-taggarna laddade för
 *    VARJE besökare, utan att fråga. Bannern frågade, en räknare lydde, och
 *    leverantörstaggen struntade i svaret. En banner som inte styr den mätning
 *    den mest handlar om är utsmyckning.
 *
 * 2. TVÅ SKRIVARE RADERADE VARANDRA. `handleToggle` skrev `{ [key]: { enabled } }`
 *    och ersatte därmed HELA integrationsobjektet — inklusive det
 *    measurement-id som får integrationen att fungera. Konfigurationsformuläret
 *    skrev tillbaka objektet utan `enabled`. Uppmätt live: ett sparat
 *    `G-Y5B3ZBTBVP` med ingen `enabled`-nyckel alls, så taggen laddade aldrig
 *    och ingenting sa varför. Ägaren såg "sparat" två gånger och en tom mätning.
 *    `handleBulkToggle` intill gjorde redan rätt — felet var att den ena av två
 *    nästan identiska funktioner spred och den andra inte.
 */

const TRACKING = readFileSync(
  join(__dirname, '../../components/public/TrackingScripts.tsx'), 'utf8');
// 2026-08-23: lyssnaren flyttade in i den delade kroken när sidvisnings-
// räknaren och taggarna slutade ha två uppfattningar om samtycket.
const CONSENT_HOOK = readFileSync(
  join(__dirname, '../../hooks/useVisitorConsent.ts'), 'utf8');
const INTEGRATIONS = readFileSync(
  join(__dirname, '../../pages/admin/IntegrationsStatusPage.tsx'), 'utf8');

/** Kod utan kommentarer — en docstring som citerar felet får inte räknas som fixen. */
const code = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

describe('mätningen lyder samtycket', () => {
  const src = code(TRACKING);

  it('båda taggarna avbryter utan samtycke', () => {
    expect(src, 'GA4 laddar utan att fråga').toContain('if (!consent.analytics) return;');
    expect(src, 'Meta Pixel laddar utan att fråga — pixeln är annonsering, alltså marketing')
      .toContain('if (!consent.marketing) return;');
  });

  it('samtycket ligger i beroendena, annars laddar taggen aldrig efter ett ja', () => {
    // Utan detta är grinden en envägsdörr: besökaren tackar ja och ingenting händer
    // förrän hen laddar om sidan.
    expect(src).toMatch(/\}, \[[^\]]*consent\.analytics[^\]]*\]\)/);
    expect(src).toMatch(/\}, \[[^\]]*consent\.marketing[^\]]*\]\)/);
  });

  it('den lyssnar på att besökaren ändrar sig', () => {
    // Egenskapen ligger kvar, men i kroken båda konsumenterna delar.
    expect(src, 'taggarna läser inte det delade samtyckesbeslutet')
      .toContain('useVisitorConsent()');
    expect(code(CONSENT_HOOK), 'inget lyssnar på cookie-consent-changed')
      .toContain('cookie-consent-changed');
  });
});

describe('reglaget slår ihop, det ersätter inte', () => {
  const src = code(INTEGRATIONS);

  it('handleToggle sprider det befintliga objektet', () => {
    const i = src.indexOf('const handleToggle');
    expect(i, 'handleToggle är borta').toBeGreaterThan(-1);
    const body = src.slice(i, i + 400);
    expect(body, 'reglaget skriver ett naket { enabled } och raderar konfigurationen')
      .not.toMatch(/\[key\]:\s*\{\s*enabled\s*\}/);
    expect(body, 'reglaget sprider inte det befintliga objektet').toContain('...(integrationSettings?.[key]');
  });

  it('de två reglagen är överens om formen', () => {
    // handleBulkToggle spred redan korrekt. Att bara en av två nästan identiska
    // funktioner gjorde rätt är hela felet — de ska inte kunna glida isär igen.
    const bulk = src.slice(src.indexOf('const handleBulkToggle'));
    expect(bulk.slice(0, 400)).toContain('...(integrationSettings?.[k]');
  });
});
