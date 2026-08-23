import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

/**
 * Utgående post måste lämna ett avtryck — annars kan vi inte svara på
 * VAD VI SKICKAT TILL VEM.
 *
 * Förloppet (optic, 2026-08-23). Ägaren såg en varning i FlowChat:
 * check_integrations rapporterade Resend som "cannot verify from here
 * (HTTP 401)". Han läste det som ett falsklarm — dagsbrevet kom ju fram varje
 * morgon. Det var inget falsklarm. Det var ett äkta symptom på något annat.
 *
 * Kedjan:
 *   1. Resend-nyckeln är sending-only (rätt val, minsta möjliga behörighet).
 *      GET /domains nekar en sådan nyckel. Proben vet det och säger ärligt att
 *      den inte kan avgöra saken därifrån.
 *   2. Därför frågar proben FÖRST plattformens egen utgående logg
 *      (outbound_communications, provider=resend, status=sent, 7 dygn). Ett
 *      levererat mail är beviset — utfört på riktiga vägen, i produktion.
 *   3. Dagsbrevet POST:ade Resend direkt i stället för att gå via `email-send`,
 *      och skrev därför ALDRIG någon rad. Senast loggade resend-utskick på
 *      optic: 10 augusti. Brevet gick ut varje dag ändå.
 *
 * Kontrollen drog alltså rätt slutsats av ett underlag som saknades. Den
 * fjärde särvägen förbi den centrala avsändaren hade gjort plattformens egen
 * bokföring osann.
 *
 * Varför den gamla spärren inte fångade det: krypet i `email-allowlist.test.ts`
 * letar upp varje fil som talar med Resend och kräver att den importerar
 * `filterRecipients`. briefing.ts GJORDE det. Spärren vaktade GRINDEN, inte
 * RÄLSEN — den godkände en särväg så länge särvägen var artig. Den här filen
 * vaktar rälsen: ingen annan än avsändaren själv får tala med leverantören.
 */

const FUNCTIONS_DIR = resolve(__dirname, '../../../supabase/functions');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const ALL_EDGE_FILES = walk(FUNCTIONS_DIR);
const read = (p: string) => readFileSync(p, 'utf-8');

describe('bara en fil får tala med e-postleverantören', () => {
  /**
   * `email-send` ÄR rälsen: allowlist, undertryckningslista, leverantörsval
   * med fallback, avsändaridentitet, RFC 8058-avregistrering, varumärkesramen
   * — och exakt en rad i outbound_communications per utskick. Varje särväg
   * tappar allt utom det den råkade komma ihåg.
   *
   * check-integrations får nämna leverantören men skickar ingenting: den
   * probar /domains och tilltalar ingen människa.
   */
  const ALLOWED = new Set([
    'email-send/index.ts',
    '_shared/handlers/check-integrations.ts',
  ]);

  const callers = ALL_EDGE_FILES
    .filter((f) => read(f).includes('api.resend.com'))
    .map((f) => relative(FUNCTIONS_DIR, f));

  it('hittar avsändaren alls — faller detta till noll är detektorn trasig', () => {
    expect(callers).toContain('email-send/index.ts');
  });

  it('ingen femte särväg: inget annat än email-send rör api.resend.com', () => {
    const strays = callers.filter((f) => !ALLOWED.has(f));
    expect(
      strays,
      `${strays.join(', ')} talar direkt med Resend. Skicka via email-send i ` +
        'stället — annars tappas loggen, undertryckningslistan, ' +
        'leverantörsfallbacken och avregistreringshuvudena, och ' +
        'check_integrations tappar sitt enda ärliga bevis på att nyckeln kan skicka.',
    ).toEqual([]);
  });

  it('och tillåtlistan är kort med flit — den räknar upp undantagen, inte reglerna', () => {
    expect(ALLOWED.size).toBeLessThanOrEqual(2);
  });
});

describe('dagsbrevet går via rälsen och lämnar ett avtryck', () => {
  const briefing = read(join(FUNCTIONS_DIR, 'flowpilot-lifecycle/briefing.ts'));

  it('anropar email-send i stället för leverantören', () => {
    expect(briefing).toMatch(/functions\/v1\/email-send/);
    expect(briefing).not.toMatch(/api\.resend\.com/);
  });

  it('taggar utskicket så raden kan hittas i efterhand', () => {
    // Utan de här tre svarar raden "ett mail hände", inte "vad, till vem, varför".
    expect(briefing).toMatch(/source: "daily_briefing"/);
    expect(briefing).toMatch(/related_entity_type: "flowpilot_briefing"/);
    expect(briefing).toMatch(/related_entity_id: briefing\.id/);
  });

  it('behåller tillåtlistegrinden på plats — den är säkerhetskritisk', () => {
    // Grinden tillämpas både här och inne i email-send. Med flit: det här
    // anropet ska aldrig kunna räcka rälsen en mottagarlista som vakten inte
    // har sett, vad som än händer med hoppet däremellan.
    expect(briefing).toMatch(/import \{ filterRecipients \} from "\.\.\/_shared\/email-allowlist\.ts"/);
    expect(briefing).toMatch(/const gate = await filterRecipients\(supabase, adminEmails\)/);
    const gateAt = briefing.indexOf('filterRecipients(supabase, adminEmails)');
    const sendAt = briefing.indexOf('functions/v1/email-send');
    expect(gateAt, 'grinden måste stå FÖRE utskicket').toBeLessThan(sendAt);
  });

  it('stämplar emailed_at bara när något faktiskt lämnade huset', () => {
    // email-send svarar success:true även när ingen leverantör är konfigurerad
    // (simulated). Att stämpla på det vore att påstå att brevet gick ut.
    const stamp = briefing.indexOf('emailed_at: new Date().toISOString()');
    expect(stamp).toBeGreaterThan(-1);
    const guard = briefing.slice(0, stamp);
    expect(guard).toMatch(/sendJson\?\.simulated !== true/);
    expect(guard).toMatch(/sendJson\?\.success === true/);
  });

  it('säger "withheld" och "simulated" med olika ord än "trasig"', () => {
    // Blockerad, osänd och trasig är tre olika fakta. Slås de ihop får
    // operatören fel felsökning.
    expect(briefing).toMatch(/blocked_by_allowlist/);
    expect(briefing).toMatch(/logged as simulated/);
  });
});

describe('den centrala avsändaren skriver faktiskt raden', () => {
  const emailSend = read(join(FUNCTIONS_DIR, 'email-send/index.ts'));

  it('loggar varje utfall till outbound_communications', () => {
    expect(emailSend).toMatch(/from\("outbound_communications"\)\.insert/);
    for (const status of ['"sent"', '"blocked"', '"skipped"', '"simulated"', '"failed"']) {
      expect(emailSend, `status ${status} saknas i loggen`).toContain(`status: ${status}`);
    }
  });

  it('och sätter provider på den skickade raden — proben filtrerar på den', () => {
    // check_integrations letar provider='resend' AND status='sent'. En rad utan
    // provider är osynlig för sensorn även om mailet gick fram.
    const sentBranch = emailSend.slice(emailSend.lastIndexOf('status: "sent"'));
    expect(sentBranch).toMatch(/provider,/);
  });
});
