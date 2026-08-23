import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { consentAllows, acceptAll, setConsent } from '@/lib/visitor-consent';
import { useVisitorConsent, bannerIsEnabled } from '@/hooks/useVisitorConsent';

/**
 * Spärr: mätningen lyder samtycket DÄR samtycke inhämtas — inte överallt.
 *
 * 2026-08-23. Grinden var `hasConsent(category)`, som svarar på exakt en fråga:
 * "finns ett lagrat ja?". Inget lagrat ⇒ nej. Det är rätt svar bara på en
 * instans som faktiskt FRÅGAR.
 *
 * FlowWink är självhostad och open source. En operatör utan samtyckesplikt —
 * en amerikansk driftsättning, en intern instans — stänger av cookiebannern.
 * Då renderas ingen banner, då skriver ingenting någonsin ett samtycke, och då
 * svarade `hasConsent` nej för varje besökare för alltid. Instansen mätte
 * ingenting: noll sidvisningar, ingen GA4-tagg, ingen pixel — och inte ett enda
 * felmeddelande någonstans som förklarade varför. Svaret på en fråga som aldrig
 * ställdes var nej. Vi hade exporterat EU-byråkratin till hela världen.
 *
 * Regeln: bannern PÅ → vänta på besökarens svar. Bannern AV → det finns inget
 * svar att respektera, alltså mät.
 *
 * Och medan inställningen laddas VET vi inte vilket fall vi är i. Båda
 * felgissningarna är verkliga: gissar vi "grindat" tappar den banner-lösa
 * instansen sin första sidvisning; gissar vi "fritt" läcker EU-instansen en
 * mätning innan bannern hunnit upp. Därför avgörs ingenting före `ready`.
 */

const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');
const TRACKING = read('components/public/TrackingScripts.tsx');
const PAGEVIEW = read('hooks/usePageViewTracker.ts');
const BANNER = read('components/public/CookieBanner.tsx');
const HOOK = read('hooks/useVisitorConsent.ts');
const LIB = read('lib/visitor-consent.ts');
const CHAT = read('components/public/ChatWidget.tsx');

/** Var i src en sträng förekommer — filtrerar bort tester och kommentarer. */
function globSearch(needle: RegExp): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(full); continue; }
      if (!/\.tsx?$/.test(e.name) || /\.test\./.test(e.name)) continue;
      if (needle.test(code(readFileSync(full, 'utf8')))) {
        out.push(relative(join(__dirname, '../../..'), full));
      }
    }
  };
  walk(join(__dirname, '../..'));
  return out.sort();
}

/** Kod utan kommentarer — en docstring som citerar felet får inte räknas som fixen. */
const code = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

// ─── Regeln, ren och riggfri ────────────────────────────────────────────────

describe('consentAllows — alla fyra kombinationerna', () => {
  const YES = { essential: true as const, analytics: true, marketing: true, timestamp: '' };
  const NO = { essential: true as const, analytics: false, marketing: false, timestamp: '' };

  it('banner PÅ + samtycke givet → mät', () => {
    expect(consentAllows('analytics', { collecting: true, consent: YES })).toBe(true);
    expect(consentAllows('marketing', { collecting: true, consent: YES })).toBe(true);
  });

  it('banner PÅ + samtycke nekat → mät inte', () => {
    expect(consentAllows('analytics', { collecting: true, consent: NO })).toBe(false);
    expect(consentAllows('marketing', { collecting: true, consent: NO })).toBe(false);
  });

  it('banner PÅ + inget svar än → mät inte (frågan är ställd, inte besvarad)', () => {
    expect(consentAllows('analytics', { collecting: true, consent: null })).toBe(false);
    expect(consentAllows('marketing', { collecting: true, consent: null })).toBe(false);
  });

  it('banner AV + inget lagrat samtycke → MÄT (det var hela buggen)', () => {
    expect(
      consentAllows('analytics', { collecting: false, consent: null }),
      'en instans utan banner mäter ingenting — svaret på en fråga som aldrig ställdes var nej',
    ).toBe(true);
    expect(consentAllows('marketing', { collecting: false, consent: null })).toBe(true);
  });

  it('banner AV + gammalt nej i lagringen → mät ändå, ingen fråga ställs här', () => {
    // Annars ärver en instans som stängt av bannern ett nej från den tid då den
    // var på, och blir tyst av ett skäl ingen längre kan se i gränssnittet.
    expect(consentAllows('analytics', { collecting: false, consent: NO })).toBe(true);
  });

  it('essential är alltid tillåtet, oavsett bannern', () => {
    expect(consentAllows('essential', { collecting: true, consent: NO })).toBe(true);
    expect(consentAllows('essential', { collecting: false, consent: null })).toBe(true);
  });
});

describe('bannerIsEnabled — samma predikat som bannern renderar på', () => {
  it('ingen rad alls = plattformens standard, alltså banner', () => {
    expect(bannerIsEnabled(null)).toBe(true);
    expect(bannerIsEnabled(undefined)).toBe(true);
  });

  it('enabled:false = ingen banner = inget att respektera', () => {
    expect(bannerIsEnabled({ enabled: false } as never)).toBe(false);
  });

  it('en rad utan enabled-nyckel räknas som avstängd — precis som bannern gör', () => {
    // Bannern gör `if (!bannerIsEnabled(stored)) return null`. Skulle detta
    // svara true skulle mätningen vänta på en banner som aldrig renderas.
    expect(bannerIsEnabled({} as never)).toBe(false);
  });
});

// ─── Kroken: tre svar, och `ready` är det som bär ───────────────────────────

const maybeSingle = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }),
    }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const NEVER = () => new Promise<never>(() => {});
const row = (value: unknown) => ({ data: { value } });

/**
 * jsdom i den här riggen exponerar ingen `localStorage`, och samtycket bor
 * där. Vi lägger dit en minnesvariant och tar bort den bit-identiskt efteråt:
 * originaldeskriptorn läggs tillbaka, eller nyckeln raderas om ingen fanns.
 */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

describe('useVisitorConsent', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new MemoryStorage();

  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: store, configurable: true, writable: true,
    });
  });

  afterAll(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as Record<string, unknown>).localStorage;
  });

  beforeEach(() => {
    store.clear();
    maybeSingle.mockReset();
  });

  afterEach(() => {
    store.clear();
  });

  it('avgör INGENTING innan inställningen landat', async () => {
    maybeSingle.mockImplementation(NEVER);
    // Bannern är avstängd i verkligheten, men det vet vi inte än — och att
    // gissa rätt av en slump är inte att veta.
    const { result } = renderHook(() => useVisitorConsent(), { wrapper });

    expect(result.current.ready).toBe(false);
    expect(result.current.analytics, 'en mätning läckte innan svaret var känt').toBe(false);
    expect(result.current.marketing).toBe(false);

    // Och den blir aldrig ready av sig själv medan frågan hänger.
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.ready).toBe(false);
  });

  it('banner AV → mäter så fort svaret är känt, utan lagrat samtycke', async () => {
    maybeSingle.mockResolvedValue(row({ enabled: false }));
    const { result } = renderHook(() => useVisitorConsent(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.analytics).toBe(true);
    expect(result.current.marketing).toBe(true);
  });

  it('banner PÅ + obesvarad → mäter inte', async () => {
    maybeSingle.mockResolvedValue(row({ enabled: true }));
    const { result } = renderHook(() => useVisitorConsent(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.analytics).toBe(false);
    expect(result.current.marketing).toBe(false);
  });

  it('banner PÅ + lagrat ja → mäter', async () => {
    setConsent({ analytics: true, marketing: false });
    maybeSingle.mockResolvedValue(row({ enabled: true }));
    const { result } = renderHook(() => useVisitorConsent(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.analytics).toBe(true);
    expect(result.current.marketing, 'marknadsföring var inte påslagen').toBe(false);
  });

  it('ett ja senare öppnar grinden utan omladdning', async () => {
    maybeSingle.mockResolvedValue(row({ enabled: true }));
    const { result } = renderHook(() => useVisitorConsent(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.analytics).toBe(false);

    // Besökaren trycker "Acceptera alla" — samma anrop bannern gör.
    act(() => { acceptAll(); });

    await waitFor(() => expect(result.current.analytics).toBe(true));
    expect(result.current.marketing).toBe(true);
  });

  it('en oläsbar inställning fryser inte mätningen för evigt', async () => {
    maybeSingle.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useVisitorConsent(), { wrapper });

    // Ready blir sant på ett settlat fel också — annars mäter en instans med
    // ett tillfälligt nätverksfel aldrig något igen. Utfallet är den försiktiga
    // halvan av regeln: plattformens standard är banner på.
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.analytics).toBe(false);
  });
});

// ─── Att felet inte kan återinföras ─────────────────────────────────────────

describe('ingen konsument får grinda mätning på hasConsent igen', () => {
  for (const [name, src] of [
    ['TrackingScripts.tsx', TRACKING],
    ['usePageViewTracker.ts', PAGEVIEW],
  ] as const) {
    it(`${name} använder det delade beslutet, inte hasConsent`, () => {
      const c = code(src);
      expect(c, 'hasConsent svarar nej på en fråga som kanske aldrig ställs')
        .not.toMatch(/\bhasConsent\s*\(/);
      expect(c).toContain('useVisitorConsent()');
    });

    it(`${name} avgör ingenting före ready — i VARJE effekt`, () => {
      const c = code(src);
      const gate = /if \(!consent\.(analytics|marketing)\) return;/;
      const gated = c.split('useEffect(').filter((chunk) => gate.test(chunk));
      expect(gated.length, 'ingen effekt grindar alls på samtycket').toBeGreaterThan(0);
      for (const chunk of gated) {
        // Att EN av två effekter har vakten räcker inte: den andra gissar då
        // under laddningen, och det är exakt så halvfixade grindar ser ut.
        expect(chunk, 'utan ready-vakten gissar konsumenten under laddningen')
          .toContain('if (!consent.ready) return;');
      }
    });
  }

  it('hasConsent finns kvar för bakåtkompatibilitet men är märkt', () => {
    expect(LIB).toContain('export function hasConsent');
    expect(LIB, 'nästa läsare måste se varför hasConsent inte är grinden')
      .toMatch(/NOT the measurement gate/);
  });

  it('regeln uttrycks en gång, i consentAllows', () => {
    const c = code(LIB);
    expect(c).toContain('export function consentAllows');
    // Kärnan: utan inhämtning finns inget att respektera.
    expect(c).toMatch(/if \(!env\.collecting\) return true;/);
  });
});

describe('bannern och grinden läser EN inställning', () => {
  it('kroken äger nyckeln', () => {
    expect(code(HOOK)).toContain("['site-settings', 'cookie_consent_v2']");
  });

  it('bannern öppnar ingen egen fråga om samma rad', () => {
    const c = code(BANNER);
    expect(c, 'två anrop och två uppfattningar om samma inställning')
      .not.toContain("queryKey: ['site-settings', 'cookie_consent_v2']");
    expect(c).toContain('useCookieConsentSettings()');
  });

  it('bannern renderas på samma predikat som grinden mäter på', () => {
    // Skulle de gå isär kunde en instans både sakna banner och vägra mäta.
    expect(code(BANNER)).toContain('bannerIsEnabled(stored)');
  });
});

describe('ingen yta lämnar plats åt en banner som aldrig kommer', () => {
  it('bara PublicPage renderar bannern', () => {
    // Om en andra yta renderade den skulle en avstängd banner kunna dyka upp
    // ändå — och då vore "bannern är av" inte längre sant någonstans.
    // JSX-renderingen, inte typnamnet `CookieBannerSettings`.
    const hits = globSearch(/<CookieBanner\s*\/>/);
    expect(hits, `CookieBanner renderas i: ${hits.join(', ')}`)
      .toEqual(['src/pages/PublicPage.tsx']);
  });

  it('chattknappen lyfter bara när bannern faktiskt kan visas', () => {
    // `useCookieConsent()` är 'pending' för evigt på en instans som aldrig
    // frågar. Att lyfta på det ensamt reserverade 260px mobilskärm åt en
    // banner som inte finns — samma buggklass, annan yta.
    const c = code(CHAT);
    expect(c).toContain('bannerIsEnabled(consentSettings)');
    expect(c, 'lyftet hänger fortfarande på ett evigt pending')
      .not.toMatch(/cookieConsent === 'pending'\s*\n?\s*\?/);
  });
});
