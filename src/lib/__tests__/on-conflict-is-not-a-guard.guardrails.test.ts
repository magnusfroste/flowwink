import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Spärr: `ON CONFLICT DO NOTHING` mot en kolumn utan unik nyckel är INGEN vakt.
 *
 * Buggklassen (inte instansen): en INSERT som avslutas med ett NAKET
 * `ON CONFLICT DO NOTHING` läser som "seeda bara om raden saknas". Men
 * ON CONFLICT kan bara utlösas av en faktisk unik-överträdelse. Har tabellen
 * ingen unik nyckel över de kolumner INSERT:en faktiskt fyller i — t.ex. bara
 * PRIMARY KEY ("id") med gen_random_uuid()-default — så finns det aldrig
 * någon konflikt att fånga, och satsen degraderar tyst till ett obevakat
 * INSERT. Varje omkörning lägger till ännu en rad.
 *
 * Tyst är nyckelordet. Skriver man i stället ut måltavlan,
 * `ON CONFLICT (name) DO NOTHING`, så VERIFIERAR Postgres att ett unikt index
 * finns och kastar "there is no unique or exclusion constraint matching the
 * ON CONFLICT specification" — felet syns direkt vid migrationen. Den nakna
 * formen är den farliga just för att den lyckas.
 *
 * Det hände på riktigt: "Daily Briefing" seedades i 20260624225254 med naket
 * ON CONFLICT mot public.agent_automations (PK på id, ingen unik nyckel på
 * name), medan de tre syskonautomationerna använde `WHERE NOT EXISTS`. Samma
 * tabell, samma körningar: 3 rader mot 1.
 *
 * Regeln som testas: ett naket `ON CONFLICT DO NOTHING` godtas bara om
 * måltabellen har en UNIQUE/PRIMARY KEY vars kolumner ryms i INSERT:ens egen
 * kolumnlista. Uppfylls det inte finns två utvägar:
 *   1. namnge måltavlan — `ON CONFLICT (kol) DO NOTHING` — så felar den högt,
 *   2. eller vakta med `WHERE NOT EXISTS (...)`.
 *
 * Nycklarna läses ur migrationskorpusen själv (baseline + efterföljande DDL),
 * så spärren behöver ingen databas.
 */

const DIR = join(__dirname, '../../../supabase/migrations');

const blank = (m: string) => m.replace(/[^\n]/g, ' ');
const stripComments = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/--[^\n]*/g, blank);

/** Maskera dollar-citerade kroppar (funktioner/DO-block) OCH kommentarer. */
const maskBodies = (sql: string) =>
  stripComments(sql).replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1?\$/g, blank);

const norm = (t: string) => t.replace(/"/g, '').replace(/^public\./i, '').trim().toLowerCase();

const cols = (list: string) =>
  list
    .split(',')
    .map((c) => norm(c))
    .filter(Boolean);

/**
 * Unika nycklar per tabell, samlade ur HELA korpusen.
 *
 * Läser den okommenterade men OMASKERADE texten: baseline lindar varje
 * `ALTER TABLE ... ADD CONSTRAINT` i ett `DO $idem$`-block (omkörbarhets-
 * fixen), och de blocken hade försvunnit med maskeringen.
 */
function collectUniqueKeys(): Map<string, string[][]> {
  const keys = new Map<string, string[][]>();
  const add = (table: string, columns: string[]) => {
    if (!table || columns.length === 0) return;
    const t = norm(table);
    if (!keys.has(t)) keys.set(t, []);
    keys.get(t)!.push(columns);
  };

  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripComments(readFileSync(join(DIR, file), 'utf8'));

    // ALTER TABLE [ONLY] t ADD CONSTRAINT c PRIMARY KEY|UNIQUE (a, b)
    for (const m of sql.matchAll(
      /ALTER\s+TABLE\s+(?:ONLY\s+)?([\w."]+)[\s\S]{0,400}?ADD\s+CONSTRAINT\s+[\w."]+\s+(?:PRIMARY\s+KEY|UNIQUE)\s*\(([^)]*)\)/gi,
    )) {
      add(m[1], cols(m[2]));
    }

    // CREATE UNIQUE INDEX [IF NOT EXISTS] i ON t [USING btree] (a, b) [WHERE ...]
    for (const m of sql.matchAll(
      /CREATE\s+UNIQUE\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?[\w."]+\s+ON\s+(?:ONLY\s+)?([\w."]+)\s*(?:USING\s+\w+\s*)?\(([^)]*)\)/gi,
    )) {
      add(m[1], cols(m[2]));
    }

    // CREATE TABLE t ( ... ) — inline PRIMARY KEY / UNIQUE
    for (const m of sql.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(([\s\S]*?)\n\s*\);/gi,
    )) {
      const table = m[1];
      const body = m[2];
      for (const k of body.matchAll(/(?:PRIMARY\s+KEY|UNIQUE)\s*\(([^)]*)\)/gi)) add(table, cols(k[1]));
      for (const line of body.split('\n')) {
        const c = line.match(/^\s*("?[\w]+"?)\s+[^,(]*?\b(?:PRIMARY\s+KEY|UNIQUE)\b/i);
        if (c && !/\(/.test(line.slice(0, line.search(/\bPRIMARY\s+KEY|\bUNIQUE/i)))) {
          add(table, [norm(c[1])]);
        }
      }
    }
  }
  return keys;
}

interface Offence {
  file: string;
  table: string;
  detail: string;
}

function scanBareOnConflict(keys: Map<string, string[][]>): Offence[] {
  const out: Offence[] = [];

  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = maskBodies(readFileSync(join(DIR, file), 'utf8'));

    for (const m of sql.matchAll(/INSERT\s+INTO\s+([\w."]+)\s*(\([^)]*\))?([\s\S]*?);/gi)) {
      const stmt = m[0];
      // Naket = DO NOTHING/DO UPDATE utan måltavla. `ON CONFLICT (kol)` och
      // `ON CONFLICT ON CONSTRAINT x` är verifierade av Postgres och godtas.
      if (!/ON\s+CONFLICT\s+DO\s+(NOTHING|UPDATE)/i.test(stmt)) continue;

      const table = norm(m[1]);
      if (!m[2]) {
        out.push({
          file,
          table,
          detail: 'naket ON CONFLICT utan kolumnlista — går inte att verifiera mot någon nyckel',
        });
        continue;
      }

      const inserted = new Set(cols(m[2].slice(1, -1)));
      const tableKeys = keys.get(table) ?? [];
      const arbiter = tableKeys.find((k) => k.every((c) => inserted.has(c)));
      if (!arbiter) {
        out.push({
          file,
          table,
          detail:
            tableKeys.length === 0
              ? 'tabellen har ingen känd unik nyckel alls'
              : `ingen unik nyckel ryms i INSERT:ens kolumner (kända nycklar: ${tableKeys
                  .map((k) => `(${k.join(', ')})`)
                  .join(', ')})`,
        });
      }
    }
  }
  return out;
}

describe('ON CONFLICT måste ha en riktig nyckel att kollidera med', () => {
  const keys = collectUniqueKeys();

  it('extraherar unika nycklar ur korpusen (självtest på spärren)', () => {
    // Om nyckelutvinningen tystnar blir spärren värdelös på motsatt sätt:
    // allt ser ut som en överträdelse, eller inget gör det.
    expect(keys.size).toBeGreaterThan(100);
    // 20260905110000 gav agent_automations en riktig identitetsnyckel:
    // partiellt unikt index (name, skill_name) WHERE enabled. Extraktorn ska
    // se den — och 'id'-PK:n från baseline ska finnas kvar.
    expect(keys.get('agent_automations')).toEqual(
      expect.arrayContaining([['id'], ['name', 'skill_name']]),
    );
    expect(keys.get('role_module_access')).toEqual(
      expect.arrayContaining([['role', 'module_id']]),
    );
  });

  it('inget naket ON CONFLICT saknar en nyckel som INSERT:en faktiskt fyller', () => {
    const offences = scanBareOnConflict(keys);
    const msg = offences
      .map((o) => `  ${o.file}\n    INSERT INTO ${o.table}: ${o.detail}`)
      .join('\n');
    expect(
      offences,
      offences.length
        ? `Naket "ON CONFLICT DO NOTHING/UPDATE" som inte kan utlösas — vakten skyddar ingenting.\n` +
            `Namnge måltavlan (ON CONFLICT (kol)) så Postgres felar högt, eller vakta med WHERE NOT EXISTS.\n${msg}`
        : '',
    ).toEqual([]);
  });
});

describe('seedade automationer delar idempotensmönster med sina syskon', () => {
  /**
   * Datadriven syskonspärr: agent_automations är tabellen där klassen slog
   * till, och `name` är dess de facto identitetsnyckel överallt i koden
   * (module-bootstrap och platform-seeds slår upp med
   * `.eq('name', …)`, teardown med `.in('name', …)`). Sedan 20260905110000
   * finns ett partiellt unikt index (name, skill_name) WHERE enabled — men det
   * täcker bara ENABLADE rader, så varje seedande INSERT i en migration måste
   * fortfarande vakta på name via NOT EXISTS — precis som Quote Expiry
   * Reminders, Webinar Reminders och Notify approvers in cowork chat gör.
   */
  it('varje INSERT INTO agent_automations i migrationer vaktas med NOT EXISTS', () => {
    const bad: string[] = [];
    let seen = 0;

    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
      if (file === '00000000000000_baseline.sql') continue;
      const sql = maskBodies(readFileSync(join(DIR, file), 'utf8'));
      for (const m of sql.matchAll(/INSERT\s+INTO\s+[\w."]*agent_automations\b([\s\S]*?);/gi)) {
        seen++;
        if (!/NOT\s+EXISTS\s*\(/i.test(m[0])) bad.push(file);
      }
    }

    expect(seen, 'hittade inga seedade automationer — spärren har tappat greppet').toBeGreaterThan(3);
    expect(
      bad,
      `Automations-seed utan NOT EXISTS-vakt (name är identitetsnyckeln, men ingen unik nyckel finns):\n  ${bad.join(
        '\n  ',
      )}`,
    ).toEqual([]);
  });
});
