import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Spärr: en instans märkt TESTBÄDD får aldrig kunna nollställas.
 *
 * Fleeten har tre sorters icke-produktionsinstans, och exakt en av dem lever på
 * att historiken VÄXER:
 *
 *   sandbox   rivs varje natt — ombygget ÄR behörighetssystemet
 *   demo      rivs varje natt — värdet är att den ser ny ut
 *   testbed   rivs aldrig — Nordbrygg AB, där processer bevisas över veckor:
 *             en faktura som får åldras, en retur som kommer efter periodstängning,
 *             ett värderingslager som bara betyder något för att sex inleveranser
 *             kom före
 *
 * En natt med demo-cycle på testbädden raderar månader, och ingenting återskapar
 * det. Klassen är inte hypotetisk här: 20260812190000 finns redan för att rätt
 * cron-jobb pekat på fel instans.
 *
 * 20260822130000 gjorde `testbed_mode` till ett UPPLÅS (såkedjorna accepterar
 * den). 20260823020000 skrev andra halvan av kontraktet — samma flagga är ett
 * VETO på allt som förstör — och det är den halvan den här spärren vaktar.
 *
 * Asymmetrin är hela poängen: testbed_mode VINNER över demo_mode och
 * sandbox_mode. Inte "kontrolleras också". Att vägra riva en engångsinstans
 * kostar en förvirrad operatör och ett UPDATE; att riva en testbädd kostar
 * månader och återskapas av ingenting. Fall åt det återställbara hållet.
 *
 * Spärren har två armar. Censuslistan fäller dagens sju vägar. Upptäcktsarmarna
 * fäller nästa — en funktion som TRUNCATE:ar hela schemat, eller som heter något
 * i förstörelsevokabulären och raderar rader, måste bära vetot även om ingen
 * kom ihåg att lägga till den här.
 */

const root = process.cwd();
const DIR = join(root, 'supabase/migrations');

const VETO = 'assert_not_testbed';

/** Kommentarer bär orden vi indexerar på ("demo_mode", "has_role"). Bort. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/**
 * Senaste definitionen av varje funktion, över alla migrationer i filnamnsordning.
 *
 * Att läsa en namngiven fil vore fel spärr: den skulle certifiera en kropp som
 * ingen instans kör så fort någon ersätter funktionen i en senare migration.
 * (Den fällan satt redan i sandbox-reset.guardrails.test.ts, som pekade på
 * 20260813100000 långt efter att vetot flyttat kroppen vidare.)
 */
function latestDefinitions(): Map<string, { file: string; body: string }> {
  const out = new Map<string, { file: string; body: string }>();
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DIR, file), 'utf8');
    const re = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:"?public"?\.)?"?(\w+)"?\s*\(/gi;
    const hits = [...sql.matchAll(re)];
    for (let i = 0; i < hits.length; i++) {
      const start = hits[i].index as number;
      const end = i + 1 < hits.length ? (hits[i + 1].index as number) : sql.length;
      out.set(hits[i][1].toLowerCase(), { file, body: sql.slice(start, end) });
    }
  }
  return out;
}

const DEFS = latestDefinitions();

/** Dagens kända nollställnings- och demodata-skrivvägar. */
const CENSUS = [
  'sandbox_reset_wipe',
  'reset_site_data',
  'reset_module_data',
  'sandbox_teardown_chains',
  'admin_wipe_journal',
  'restock_demo_products',
  'enable_demo_cycle_cron',
] as const;

/**
 * Namn i förstörelsevokabulären som INTE rör historik — undantag med skäl, inte
 * en tystnadslista. Var och en måste kunna köras på en testbädd utan att något
 * som ackumulerats går förlorat.
 */
const EXEMPT: Record<string, string> = {
  reset_role_module_access:
    'återställer roll/nav-matrisen till defaults — plattformskonfig, inte historik',
  reset_all_role_module_access:
    'återställer roll/nav-matrisen till defaults — plattformskonfig, inte historik',
  purge_audit_logs_past_retention:
    'retentionssvep: raderar bara loggar som redan passerat den beslutade gallringsfristen',
};

describe('en testbädd kan sås men aldrig rivas', () => {
  it('vetot finns, läser båda jsonb-formerna och SMÄLLER (inte returnerar false)', () => {
    const isTestbed = DEFS.get('is_testbed');
    const assertFn = DEFS.get(VETO);
    expect(isTestbed, 'is_testbed() saknas').toBeTruthy();
    expect(assertFn, `${VETO}() saknas`).toBeTruthy();

    // Fleeten bär redan båda formerna för demo_mode. En vakt som binder till
    // fel form är en vakt som aldrig binder.
    expect(isTestbed!.body).toMatch(/'true'::jsonb/);
    expect(isTestbed!.body).toMatch(/->>\s*'enabled'/);
    expect(isTestbed!.body).toMatch(/key\s*=\s*'testbed_mode'/);

    // Måste RAISE. En vakt som returnerar false låter anroparen välja att
    // strunta i den, och då är den ingen vakt.
    expect(assertFn!.body).toMatch(/RAISE\s+EXCEPTION/i);
    expect(assertFn!.body).toMatch(/TESTBED/);
    // Meddelandet måste säga vägen ut, annars kringgår den som möter det kl 23.
    expect(assertFn!.body).toMatch(/testbed_mode/);
  });

  it.each(CENSUS)('%s vägrar på en testbädd', (fn) => {
    const def = DEFS.get(fn);
    expect(def, `${fn} hittades inte i migrationerna`).toBeTruthy();
    expect(
      stripComments(def!.body),
      `${fn} (senast definierad i ${def!.file}) anropar inte ${VETO} — ` +
        `en nollställningsväg utan veto kan köra på Nordbrygg`,
    ).toMatch(new RegExp(`PERFORM\\s+(?:public\\.)?${VETO}\\s*\\(`, 'i'));
  });

  it.each(CENSUS)('%s ställer vetot FÖRE alla andra grindar (testbädd vinner)', (fn) => {
    const body = stripComments(DEFS.get(fn)!.body);
    const veto = body.search(new RegExp(`PERFORM\\s+(?:public\\.)?${VETO}`, 'i'));
    expect(veto).toBeGreaterThan(-1);

    // Varje annan grind — rollkoll, bekräftelsetoken, demo_mode/sandbox_mode —
    // måste ligga EFTER. Annars är testbädden bara "också kontrollerad", och
    // en operatör som sätter demo_mode på Nordbrygg återarmerar rivningen.
    const later = [
      /has_role\s*\(/i,
      /p_confirm\s+IS\s+DISTINCT/i,
      /key\s*=\s*'demo_mode'/i,
      /key\s*=\s*'sandbox_mode'/i,
    ];
    for (const re of later) {
      const at = body.search(re);
      if (at === -1) continue;
      expect(
        veto,
        `${fn}: grinden ${re} ligger före vetot — då kan demo_mode/sandbox_mode ` +
          `eller ett giltigt token nå förbi testbädds-skyddet`,
      ).toBeLessThan(at);
    }
  });

  it.each(CENSUS)('%s ställer vetot före den första förstörande satsen', (fn) => {
    const body = stripComments(DEFS.get(fn)!.body);
    const veto = body.search(new RegExp(`PERFORM\\s+(?:public\\.)?${VETO}`, 'i'));
    // Utan detta blir testet tomt när vetot SAKNAS: search() ger -1, och -1 är
    // alltid mindre än skadans index — spärren hade grönt på en riven vakt.
    expect(veto, `${fn}: inget veto alls i kroppen`).toBeGreaterThan(-1);
    const damage = body.search(/TRUNCATE\s+TABLE|DELETE\s+FROM|UPDATE\s+(?:public\.)?\w+\s+SET/i);
    if (damage === -1) return; // enable_demo_cycle_cron förstör inget själv
    expect(
      veto,
      `${fn}: en förstörande sats ligger före vetot — skadan hinner ske`,
    ).toBeLessThan(damage);
  });

  // ── Upptäcktsarmarna: de fäller nästa väg, inte dagens ────────────────────

  it('varje funktion som TRUNCATE:ar hela schemat bär vetot', () => {
    // Formen "bygg tabellistan ur pg_tables och TRUNCATE:a den" ÄR en
    // instansrivning, vad den än heter. Ingen undantagslista här: det finns
    // ingen version av den formen som är ofarlig på en testbädd.
    const offenders: string[] = [];
    for (const [name, def] of DEFS) {
      const body = stripComments(def.body);
      if (!/TRUNCATE\s+TABLE/i.test(body)) continue;
      if (!/pg_tables/i.test(body)) continue;
      if (!new RegExp(`${VETO}`, 'i').test(body)) offenders.push(`${name} (${def.file})`);
    }
    expect(
      offenders,
      `Dessa funktioner truncar hela public-schemat utan testbädds-veto. ` +
        `Lägg till "PERFORM public.${VETO}('<namn>');" som FÖRSTA sats i kroppen.`,
    ).toEqual([]);
  });

  it('varje funktion i förstörelsevokabulären bär vetot eller ett skrivet undantag', () => {
    const offenders: string[] = [];
    for (const [name, def] of DEFS) {
      if (!/wipe|reset|teardown|purge|destroy|truncate/i.test(name)) continue;
      if (EXEMPT[name]) continue;
      const body = stripComments(def.body);
      if (!/TRUNCATE\s+TABLE|DELETE\s+FROM/i.test(body)) continue; // läser bara
      if (!new RegExp(`${VETO}`, 'i').test(body)) offenders.push(`${name} (${def.file})`);
    }
    expect(
      offenders,
      `Dessa raderar rader och heter något som förstör, men vägrar inte på en ` +
        `testbädd. Antingen anropa public.${VETO}(...) först, eller skriv in ` +
        `funktionen i EXEMPT med ett SKÄL som håller: den får inte kunna ` +
        `förstöra något som ackumulerats.`,
    ).toEqual([]);
  });

  it('undantagen är motiverade, inte bara uppräknade', () => {
    for (const [name, reason] of Object.entries(EXEMPT)) {
      expect(DEFS.has(name), `EXEMPT pekar på ${name} som inte finns — död rad`).toBe(true);
      expect(reason.length, `${name} saknar skäl`).toBeGreaterThan(30);
    }
  });

  // ── Sådden får inte gå sönder av skyddet ─────────────────────────────────

  it('sådden överlever: seed_demo_operations hoppar över rivningen på en testbädd', () => {
    // Funktionen är en SÅDD vars första handling är en rivning. Ett rakt veto
    // hade brutit testbäddens egen såväg — precis det "skydd som förstör det
    // det skyddar" som får spärrar borttagna en vecka senare.
    const body = stripComments(DEFS.get('seed_demo_operations')!.body);
    expect(body).toMatch(/IF\s+(?:public\.)?is_testbed\s*\(\s*\)\s+THEN/i);
    expect(body, 'rivningen måste ligga i ELSE-grenen').toMatch(
      /ELSE\s+[\s\S]*sandbox_teardown_chains/i,
    );
    // Kedjorna ska köras oavsett gren — annars sår den inte längre.
    for (const chain of ['sandbox_seed_p2p', 'sandbox_seed_o2c', 'sandbox_seed_rma']) {
      expect(body, `${chain} körs inte längre`).toMatch(new RegExp(chain));
    }
    const elseEnd = body.search(/END\s+IF;/i);
    for (const chain of ['sandbox_seed_p2p', 'sandbox_seed_o2c', 'sandbox_seed_rma']) {
      expect(
        body.search(new RegExp(chain)),
        `${chain} ligger inne i grenen — då sår testbädden inte`,
      ).toBeGreaterThan(elseEnd);
    }
  });

  it('upplåset finns kvar: såkedjorna accepterar fortfarande en testbädd', () => {
    // Vetots halva får inte råka riva upplåsets halva (20260822130000).
    const mode = DEFS.get('seed_chain_mode');
    expect(mode, 'seed_chain_mode() saknas — testbädden kan inte längre sås').toBeTruthy();
    expect(mode!.body).toMatch(/'testbed'/);
    expect(mode!.body).toMatch(/key\s*=\s*'testbed_mode'/);
  });

  // ── Kantlagret: RPC-vetot får inte vara enda linjen ───────────────────────

  it('demo-cycle vägrar på en testbädd, och kollar det före demo_mode', () => {
    const dc = readFileSync(join(root, 'supabase/functions/demo-cycle/index.ts'), 'utf8');
    const testbed = dc.indexOf('"testbed_mode"');
    const demo = dc.indexOf('"demo_mode"');
    expect(testbed, 'demo-cycle läser inte testbed_mode alls').toBeGreaterThan(-1);
    expect(
      testbed,
      'demo-cycle kollar demo_mode före testbed_mode — en instans med båda ' +
        'flaggorna satta skulle cyklas',
    ).toBeLessThan(demo);
  });

  it('reset_sandbox-skillen vägrar på en testbädd före den ens läser demo_mode', () => {
    const ae = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
    const fnStart = ae.indexOf('async function executeResetSandbox');
    expect(fnStart).toBeGreaterThan(-1);
    const body = ae.slice(fnStart, fnStart + 4000);
    const testbed = body.indexOf("enabled(byKey.get('testbed_mode'))");
    const demo = body.indexOf("enabled(byKey.get('demo_mode'))");
    expect(testbed, 'reset_sandbox kollar inte testbed_mode').toBeGreaterThan(-1);
    expect(testbed, 'testbed-kollen ligger efter demo-kollen').toBeLessThan(demo);
    // Och den måste returnera en vägran, inte fortsätta.
    expect(body.slice(testbed, demo)).toMatch(/return\s*\{[\s\S]*?error/);
  });
});
