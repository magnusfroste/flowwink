/**
 * Guardrail: en motor som ingenting schemalägger måste åtminstone gå att köra
 * av en agent.
 *
 * Projektets dominerande buggklass i en ny variant: mekanismen finns, ingen
 * driver den, och ytan påstår ändå att den sköts automatiskt.
 *
 * Fyndet som skrev regeln (2026-08-23): `run_ticket_escalations()` — hela
 * eskaleringsmotorn för supportkön — hade varken pg_cron-schema eller
 * skill-seed. Enda anroparen i hela repot var knappen "Run sweep now" i
 * TicketEscalationRulesTab. Varken FlowPilot eller en extern MCP-operatör
 * kunde nå den; funktionen fanns i databasen, kompilerade, hade RLS-vakt med
 * service_role-undantag — och kunde bara startas av en människa som råkade
 * öppna rätt flik. Samtidigt lovade SLA-sidan "FlowPilot monitors compliance
 * automatically".
 *
 * Jämför `check_approval_escalations` i approvals-module.ts: samma form av
 * motor, men registrerad som `rpc:`-skill och därmed körbar av heartbeat,
 * FlowPilot och gatewayen. Det är mönstret som fungerar, och det är formen
 * det här testet kräver.
 *
 * Varför "eller cron" räcker som drivare: ett svep som en runtime-registrerad
 * cron kör varje minut (sweep_stale_voice_calls) är redan drivet — det är inte
 * föräldralöst bara för att ingen agent kan starta det för hand.
 *
 * Varför INTE "eller adminknapp": en knapp är en människa. Hela poängen med
 * plattformen är att korrektheten inte ska bo i att någon minns att klicka.
 *
 * Motormängden härleds mekaniskt ur migrationerna i stället för att listas för
 * hand — en handskriven lista är exakt den sortens register som driver isär
 * från verkligheten. Kriteriet är formen: parameterlös funktion vars kropp
 * loopar över rader och skriver. Det är vad ett svep ÄR.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const MODULES = join(ROOT, 'src/lib/modules');

const migrationFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const allSql = migrationFiles.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'));

/** Strip `--` comments — prosa om ett svep får aldrig räknas som svepet självt. */
const uncomment = (sql: string) => sql.replace(/--[^\n]*/g, '');

const HEADER =
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"?public"?\.\s*"?([a-z0-9_]+)"?\s*\(([^)]*)\)\s*\n?\s*RETURNS\s+([a-z ]+)/gi;

/** Namnformen ett periodiskt svep bär i det här repot. */
const SWEEP_NAME = /^(run_|sweep_)|_escalations$/;

export interface Engine {
  name: string;
  /** Filen vars definition gäller (den sista i migrationskedjan). */
  file: string;
}

/**
 * Motorer: senaste definitionen per funktionsnamn, svepnamn, noll OBLIGATORISKA
 * parametrar, och en kropp som både itererar (LOOP) och muterar (UPDATE/INSERT/
 * DELETE mot public). En funktion som svarar på en fråga faller bort på
 * mutationskravet; en som agerar på EN namngiven rad faller bort på
 * parameterkravet.
 */
export function discoverEngines(sqls: string[] = allSql, files: string[] = migrationFiles): Engine[] {
  const latest = new Map<string, { file: string; args: string; ret: string; body: string }>();

  sqls.forEach((raw, i) => {
    const sql = uncomment(raw);
    const heads = [...sql.matchAll(HEADER)];
    heads.forEach((m, k) => {
      const start = m.index ?? 0;
      const end = k + 1 < heads.length ? (heads[k + 1].index ?? sql.length) : sql.length;
      latest.set(m[1].toLowerCase(), {
        file: files[i],
        args: m[2],
        ret: m[3].trim().toLowerCase(),
        body: sql.slice(start, end),
      });
    });
  });

  const out: Engine[] = [];
  for (const [name, def] of latest) {
    if (!SWEEP_NAME.test(name)) continue;
    // En trigger-funktion returnerar trigger och drivs av sin trigger.
    if (!/^(jsonb|json|integer|int|bigint)\b/.test(def.ret)) continue;
    // Obligatorisk parameter ⇒ funktionen behöver ett mål ⇒ inget svep.
    const required = def.args
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0 && !/\bdefault\b/i.test(a));
    if (required.length > 0) continue;
    if (!/\bLOOP\b/i.test(def.body)) continue;
    if (!/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"?public"?\./i.test(def.body)) continue;
    out.push({ name, file: def.file });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Varje DB-funktion en skill-seed pekar ut via `rpc:` / `internal:`. */
export function agentReachableFunctions(dir: string = MODULES): Set<string> {
  const out = new Set<string>();
  const sources = [
    ...readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f)),
    join(ROOT, 'src/lib/platform-seeds.ts'),
  ];
  for (const path of sources) {
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(/handler:\s*'(?:rpc|internal):([a-z0-9_]+)'/g)) {
      out.add(m[1]);
      // `mcp_`-omslag: skillen heter X, funktionen den når heter mcp_X.
      // Räkna båda, annars ser en omslagen motor föräldralös ut.
      if (m[1].startsWith('mcp_')) out.add(m[1].slice(4));
    }
  }
  return out;
}

/** Varje DB-funktion ett cron-kommando i migrationerna anropar. */
export function cronDrivenFunctions(sqls: string[] = allSql): Set<string> {
  const out = new Set<string>();
  for (const raw of sqls) {
    const sql = uncomment(raw);
    for (const m of sql.matchAll(/cron\.schedule\(/gi)) {
      const window = sql.slice(m.index ?? 0, (m.index ?? 0) + 900);
      for (const c of window.matchAll(/\b(?:SELECT|PERFORM)\s+"?public"?\.?"?([a-z0-9_]+)"?\s*\(/gi)) {
        out.add(c[1].toLowerCase());
      }
    }
  }
  return out;
}

/** Motorer utan drivare. Ren funktion — negativtestet matar den för hand. */
export function orphanEngines(
  engines: Engine[],
  agent: Set<string>,
  cron: Set<string>,
): string[] {
  return engines
    .filter((e) => !agent.has(e.name) && !cron.has(e.name))
    .map((e) => `${e.name}  (${e.file})`);
}

describe('varje motor har en drivare', () => {
  const engines = discoverEngines();

  it('hittar motorerna alls (sanity — en tyst tom mängd bevisar ingenting)', () => {
    expect(engines.length).toBeGreaterThanOrEqual(4);
    // Motorn som skrev regeln måste synas för scannern.
    expect(engines.map((e) => e.name)).toContain('run_ticket_escalations');
  });

  it('ingen motor är föräldralös — cron eller agent, aldrig bara en knapp', () => {
    const orphans = orphanEngines(engines, agentReachableFunctions(), cronDrivenFunctions());

    expect(
      orphans,
      'Dessa svep kan bara startas av en människa vid en adminknapp. Registrera dem ' +
        'som `rpc:`-skill i sin modul (mönstret: check_approval_escalations i ' +
        'approvals-module.ts) så FlowPilot och externa operatörer kan köra dem — eller ' +
        'schemalägg dem via en RUNTIME-registrator (register_flowpilot_cron), aldrig ' +
        'via en migration allena.',
    ).toEqual([]);
  });

  it('negativtest: en motor utan skill och utan cron fångas', () => {
    const fake: Engine[] = [{ name: 'run_phantom_sweep', file: 'x.sql' }];
    expect(orphanEngines(fake, new Set(), new Set())).toEqual(['run_phantom_sweep  (x.sql)']);
    // …och släpps igenom så snart någon av de två drivarna finns.
    expect(orphanEngines(fake, new Set(['run_phantom_sweep']), new Set())).toEqual([]);
    expect(orphanEngines(fake, new Set(), new Set(['run_phantom_sweep']))).toEqual([]);
  });

  it('negativtest: scannern klassar inte en fråga som en motor', () => {
    const query = `
      CREATE OR REPLACE FUNCTION public.run_report_summary()
      RETURNS jsonb LANGUAGE plpgsql AS $function$
      DECLARE r record; BEGIN
        FOR r IN SELECT * FROM public.tickets LOOP NULL; END LOOP;
        RETURN '{}'::jsonb;
      END; $function$;`;
    expect(discoverEngines([query], ['q.sql'])).toEqual([]);
  });

  it('negativtest: scannern klassar inte en enradsåtgärd som en motor', () => {
    const single = `
      CREATE OR REPLACE FUNCTION public.run_one_escalation(p_ticket_id uuid)
      RETURNS jsonb LANGUAGE plpgsql AS $function$
      DECLARE r record; BEGIN
        FOR r IN SELECT * FROM public.tickets WHERE id = p_ticket_id LOOP
          UPDATE public.tickets SET priority = 'urgent' WHERE id = r.id;
        END LOOP;
        RETURN '{}'::jsonb;
      END; $function$;`;
    expect(discoverEngines([single], ['s.sql'])).toEqual([]);
  });

  it('negativtest: en kommenterad cron.schedule driver ingenting', () => {
    const commented = `-- PERFORM cron.schedule('x','* * * * *', $$SELECT public.run_ghost();$$);`;
    expect(cronDrivenFunctions([commented]).has('run_ghost')).toBe(false);
  });
});
