import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * `site_settings` är instansens nyckelknippa — anon får se tillåtlistan, inget mer.
 *
 * DET VERKLIGA FELET (20260823120000): baseline-schemat bar
 * `CREATE POLICY "Anyone can view site settings" ON public.site_settings
 *  FOR SELECT USING (true)` — utan TO-klausul, alltså `TO public`, alltså
 * rollen `anon`. `SET ROLE anon` läste hela tabellen på en live-instans, och
 * `site_settings.integrations` bar ett fält `apiKey` med ett icke-tomt värde.
 * Vem som helst med den PUBLIKA publishable-nyckeln kunde hämta en
 * leverantörsnyckel över REST utan konto. Samma yta serverades dessutom av
 * `content-api` (verify_jwt=false, getAnonClient) som gör
 * `.from('site_settings').select('key, value')` helt utan nyckelfilter.
 *
 * Hålet överlevde för att SAMMA TABELL bär den publika sajtens egen
 * konfiguration: `ui_text`, `branding`, `seo`, `cookie_consent_v2`, `general`,
 * `modules` … Att stänga tabellen hade släckt besökarytan på hela fleeten, så
 * ingen stängde den. Fixen är en nyckel-tillåtlista, och den här filen finns
 * för att tillåtlistan ska kunna växa bara AVSIKTLIGT.
 *
 * Tre sätt hålet kan växa tillbaka, ett test var:
 *  1. Någon lägger tillbaka en bred läspolicy (`USING (true)`, eller en
 *     SELECT-policy på tabellen utan nyckelvillkor) i en senare migration.
 *  2. Någon lägger en hemlighetsbärande nyckel i tillåtlistan.
 *  3. Någon läser en icke-tillåtlistad nyckel från en ANONYM yta — vilket är
 *     precis hur `integrations` hamnade i skyltfönstret: TrackingScripts.tsx
 *     läste hela integrations-raden med besökarens ögon för att komma åt två
 *     offentliga spårnings-id:n. Sådana fält exponeras genom en SECURITY
 *     DEFINER-funktion med FAST fältlista (get_public_tracking_config), aldrig
 *     genom att öppna raden.
 */

const REPO = resolve(__dirname, '../../..');
const MIGRATIONS_DIR = resolve(REPO, 'supabase/migrations');
const SRC = resolve(REPO, 'src');

/** Migrationen som stänger hålet — tillåtlistans hemvist. */
const FIX_MIGRATION = '20260823120000_c6d7e8f9-nyckelknippan-lag-i-skyltfonstret.sql';

/**
 * Tillåtlistan, härledd ur koden (varje nyckel har minst en läsare som körs
 * utan inloggning — källorna står i migrationens huvudkommentar).
 *
 * Att lägga till en rad här är ett SÄKERHETSBESLUT: nyckeln blir läsbar för
 * varje besökare på internet. Villkoret är att nyckeln (a) faktiskt läses av en
 * anonym yta och (b) inte kan bära en hemlighet. Behöver en publik yta ETT fält
 * ur en hemlighetsbärande nyckel — exponera fältet, inte raden.
 */
const ALLOWLIST = [
  'aeo',
  'blog',
  'branding',
  'chat',
  'cookie_banner',
  'cookie_consent_v2',
  'custom_scripts',
  'customer_portal',
  'demo_mode',
  'general',
  'maintenance',
  'modules',
  'performance',
  'platform_locale',
  'quotes',
  'sandbox_mode',
  'seo',
  'store',
  'ui_text',
] as const;

/**
 * Nycklar som bär (eller när som helst kan börja bära) en hemlighet:
 * leverantörsnycklar, modellpolicy, utgående tillåtlista, driftens
 * inventarium, agentens själ, interna regler. Ingen av dem får någonsin stå i
 * tillåtlistan — inte ens "bara det här ena fältet behövs".
 */
const SECRET_BEARING_KEYS = [
  'integrations',
  'system_ai',
  'email_allowlist',
  'edge_functions_deployed',
  'visitor_intelligence_rules',
  'soul',
  'heartbeat_overrides',
  'company_profile',
  'business_identity',
  'voice',
  'cowork',
  'autonomy_schedule',
  'accounting_preferences',
  'accounting_locale',
  'custom_themes',
  'handbook_config',
  'sales_pipeline',
  'dunning',
  'subscriptions',
] as const;

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS_DIR, name), 'utf-8') }));

/** Varje `CREATE POLICY "<namn>" ON public.site_settings …;` i turordning. */
type PolicyStmt = { file: string; name: string; body: string };

function siteSettingsPolicyStatements(): PolicyStmt[] {
  const out: PolicyStmt[] = [];
  const re =
    /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+"?public"?\.\s*"?site_settings"?([\s\S]*?);/gi;
  for (const { name: file, sql } of migrations) {
    for (const m of sql.matchAll(re)) {
      out.push({ file, name: m[1], body: m[0] });
    }
  }
  return out;
}

/** Policyns sluttillstånd: senaste CREATE vinner, om inget DROP kom efter. */
function livePolicies(): PolicyStmt[] {
  const live = new Map<string, PolicyStmt>();
  const dropRe = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+"?public"?\.\s*"?site_settings"?/gi;

  for (const { name: file, sql } of migrations) {
    // Positionsordning inom filen avgör: DROP följt av CREATE = policyn lever.
    const events: { pos: number; kind: 'create' | 'drop'; name: string; body: string }[] = [];
    for (const m of sql.matchAll(
      /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+"?public"?\.\s*"?site_settings"?([\s\S]*?);/gi,
    )) {
      events.push({ pos: m.index!, kind: 'create', name: m[1], body: m[0] });
    }
    for (const m of sql.matchAll(dropRe)) {
      events.push({ pos: m.index!, kind: 'drop', name: m[1], body: '' });
    }
    events.sort((a, b) => a.pos - b.pos);
    for (const e of events) {
      if (e.kind === 'drop') live.delete(e.name);
      else live.set(e.name, { file, name: e.name, body: e.body });
    }
  }
  return [...live.values()];
}

/** Alla .ts/.tsx under en katalog. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('site_settings: anon-läsningen är en nyckel-tillåtlista', () => {
  it('ingen levande SELECT-policy på site_settings är bred', () => {
    const broad = livePolicies()
      .filter((p) => /FOR\s+SELECT/i.test(p.body))
      // service_role är RLS-befriad ändå — en policy där är dekoration.
      .filter((p) => !/TO\s+service_role/i.test(p.body))
      .filter((p) => {
        const using = p.body.match(/USING\s*\(([\s\S]*)\)\s*;?\s*$/i)?.[1] ?? '';
        const isTrue = /^\s*\(?\s*true\s*\)?\s*$/i.test(using);
        // En SELECT-policy för anon MÅSTE nämna `key` — antingen som
        // tillåtlista eller genom is_staff/has_role för inloggad personal.
        const isGated =
          /\bkey\b/.test(using) || /is_staff|has_role|can_access_module/i.test(using);
        return isTrue || !isGated;
      })
      .map((p) => `${p.file}: "${p.name}"`);

    expect(
      broad,
      'En bred SELECT-policy på site_settings publicerar instansens nyckelknippa ' +
        '(integrations.apiKey, system_ai, email_allowlist) till varje besökare med den ' +
        'publika publishable-nyckeln. Gata på `key` mot tillåtlistan, eller på ' +
        'is_staff() för inloggad personal.',
    ).toEqual([]);
  });

  it('tillåtlistan i migrationen är exakt den härledda listan', () => {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, FIX_MIGRATION), 'utf-8');
    const policy = sql.match(
      /CREATE\s+POLICY\s+"Public site config is readable"[\s\S]*?;/i,
    )?.[0];
    expect(policy, `${FIX_MIGRATION} saknar tillåtliste-policyn`).toBeTruthy();

    const array = policy!.match(/ARRAY\s*\[([\s\S]*?)\]/i)?.[1] ?? '';
    const keys = [...array.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

    expect(
      keys,
      'Tillåtlistan i migrationen och listan i det här testet har glidit isär. ' +
        'Ändra båda medvetet: varje nyckel här är läsbar för hela internet.',
    ).toEqual([...ALLOWLIST].sort());
  });

  it('ingen hemlighetsbärande nyckel står i tillåtlistan', () => {
    const leaked = SECRET_BEARING_KEYS.filter((k) =>
      (ALLOWLIST as readonly string[]).includes(k),
    );
    expect(
      leaked,
      'Nyckeln bär (eller kan börja bära) en hemlighet och får inte vara anon-läsbar. ' +
        'Behöver en publik yta ett enskilt fält ur den: exponera FÄLTET genom en ' +
        'SECURITY DEFINER-funktion med fast fältlista (mönster: get_public_tracking_config), ' +
        'aldrig genom att öppna raden.',
    ).toEqual([]);
  });

  it('ingen anonym yta läser en nyckel utanför tillåtlistan', () => {
    // Ytor som renderas för en utloggad besökare. Providers/banner ligger
    // utanför components/public men monteras i App.tsx för hela appen.
    const anonSurfaces = [
      ...walk(resolve(SRC, 'components/public')),
      resolve(SRC, 'lib/ui-text.tsx'),
      resolve(SRC, 'providers/BrandingProvider.tsx'),
      resolve(SRC, 'components/SandboxBanner.tsx'),
    ];

    const offenders: string[] = [];
    for (const file of anonSurfaces) {
      const code = readFileSync(file, 'utf-8');
      if (!/site_settings/.test(code)) continue;
      for (const m of code.matchAll(/\.eq\(\s*['"]key['"]\s*,\s*['"]([a-z_0-9]+)['"]/gi)) {
        if (!(ALLOWLIST as readonly string[]).includes(m[1])) {
          offenders.push(`${file.replace(REPO + '/', '')} läser '${m[1]}'`);
        }
      }
    }

    expect(
      offenders,
      'En anonym yta läser en nyckel som RLS inte längre släpper igenom — den ' +
        'kommer tyst att få tom konfiguration. Antingen hör nyckeln hemma i ' +
        'tillåtlistan (och är då garanterat hemlighetsfri), eller så ska ytan gå ' +
        'genom en SECURITY DEFINER-funktion med fast fältlista.',
    ).toEqual([]);
  });

  it('ingen publik komponent hämtar hela integrations-raden', () => {
    const offenders = walk(resolve(SRC, 'components/public'))
      .filter((f) => /useIntegrations\b/.test(readFileSync(f, 'utf-8')))
      .map((f) => f.replace(REPO + '/', ''));

    expect(
      offenders,
      'useIntegrations() läser hela site_settings.integrations — raden som bar ' +
        'apiKey. En publik komponent som anropar den tvingar fram att raden görs ' +
        'anon-läsbar igen, vilket ÄR incidenten. Använd get_public_tracking_config() ' +
        'eller lägg till ett motsvarande smalt fönster för fältet du behöver.',
    ).toEqual([]);
  });
});
