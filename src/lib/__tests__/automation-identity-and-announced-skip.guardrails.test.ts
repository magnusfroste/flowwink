import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readCronExpression,
  isSupportedCron,
} from '../../../supabase/functions/_shared/cron/next-run.ts';

/**
 * Två felklasser från observability-revisionen 2026-08-28 (autoversio: sex
 * enablade 'Daily Briefing', dubbla Weekly Business Digest; en schedule-nycklad
 * config körde en VECKOdigest varje TIMME i 15 dagar):
 *
 *   1. Automation-skapande/seedning var inte idempotent på identitet.
 *      agent-execute create var en obevakad INSERT, och seedvägarnas
 *      maybeSingle() ignorerade sitt fel så fort namnet hade två rader
 *      (data=null → "finns inte" → insert till). Grinden: upsert på
 *      (name, skill_name) i create-vägarna, dubblett-tolerant existenskoll i
 *      seedvägarna, och ett partiellt unikt index WHERE enabled som golv.
 *
 *   2. automation-dispatcher läste trigger_config.expression||cron; nyckeln
 *      'schedule' var oläst → calculateNextRun(undefined) → +1h-fallback.
 *      Grinden: readCronExpression accepterar alla tre nycklarna (Law 4), och
 *      oläsbar/oparsbar cron ger en ANNONSERAD skip — disable + skäl i
 *      last_error + logg — aldrig tyst timfallback.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// ─── Grind 2: cron-läsaren, runtime ─────────────────────────────────────────

describe('readCronExpression accepterar alla tre fältnamnen — och hittar på inget', () => {
  it("läser 'schedule' — nyckeln vars frånvaro körde en veckodigest varje timme", () => {
    expect(readCronExpression({ schedule: '0 8 * * 1' })).toBe('0 8 * * 1');
  });

  it("prioriterar expression > cron > schedule (skrivargenerationernas ordning)", () => {
    expect(readCronExpression({ expression: '0 8 * * *', cron: '0 9 * * *', schedule: '0 10 * * *' }))
      .toBe('0 8 * * *');
    expect(readCronExpression({ cron: '0 9 * * *', schedule: '0 10 * * *' })).toBe('0 9 * * *');
  });

  it('NEGATIVT: saknad/blank/icke-sträng cron ger undefined — aldrig ett påhittat schema', () => {
    expect(readCronExpression(undefined)).toBeUndefined();
    expect(readCronExpression(null)).toBeUndefined();
    expect(readCronExpression({})).toBeUndefined();
    expect(readCronExpression({ event: 'booking.created' })).toBeUndefined();
    expect(readCronExpression({ schedule: '   ' })).toBeUndefined();
    expect(readCronExpression({ schedule: 42 })).toBeUndefined();
    expect(readCronExpression({ cron: '' })).toBeUndefined();
  });

  it('NEGATIVT: isSupportedCron avvisar det parsern inte har en gren för', () => {
    expect(isSupportedCron(undefined)).toBe(false);
    expect(isSupportedCron('every morning at 8')).toBe(false);
    expect(isSupportedCron('0 8 * *')).toBe(false); // fyra fält
    // ...och godtar de stödda formerna, så grinden inte disablar friska scheman
    expect(isSupportedCron('0 8 * * *')).toBe(true);
    expect(isSupportedCron('0 8 * * 1')).toBe(true);
    expect(isSupportedCron('*/15 * * * *')).toBe(true);
  });
});

// ─── Grind 2: dispatchern, källspärrar ──────────────────────────────────────

describe('dispatchern skippar ANNONSERAT — aldrig tyst timfallback', () => {
  const dispatcher = read('supabase/functions/automation-dispatcher/index.ts');

  it('läser cron via den delade readCronExpression — inga kvarglömda expression||cron-läsningar', () => {
    expect(dispatcher).toMatch(/readCronExpression/);
    expect(dispatcher).not.toMatch(/trigger_config\s+as\s+any\)\?\.(expression|cron|schedule)/);
  });

  it('oläsbar/oparsbar cron ⇒ disable + skäl i last_error + logg, i BÅDA lanes', () => {
    // Grinden finns i automations- OCH workflows-lanen
    expect(dispatcher.match(/disabled_unreadable_cron/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(dispatcher.match(/isSupportedCron\(cronExpr\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // Annonserat: enabled stängs av och skälet skrivs där admin-UI:t visar det
    expect(dispatcher).toMatch(/enabled:\s*false[\s\S]{0,200}last_error:\s*`Disabled by dispatcher/);
    expect(dispatcher).toMatch(/console\.error\(`\[dispatcher\] disabling automation/);
  });

  it('grinden står FÖRE all schemaläggning i automations-lanen', () => {
    const gate = dispatcher.indexOf('disabled_unreadable_cron');
    const init = dispatcher.indexOf('status: "initialized"');
    expect(gate).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(init);
  });
});

describe('en parser, ingen driftande kopia', () => {
  it('pilot/handlers.ts definierar ingen egen calculateNextRun längre', () => {
    const handlers = read('supabase/functions/_shared/pilot/handlers.ts');
    expect(handlers).not.toMatch(/function\s+calculateNextRun/);
    expect(handlers).toMatch(/from\s+'\.\.\/cron\/next-run\.ts'/);
  });
});

// ─── Grind 1: skapande/seedning är idempotent på identitet ─────────────────

/**
 * Buggformen i seedvägarna: en agent_automations-läsning som avslutas med
 * maybeSingle() UTAN vare sig .limit(1) före (då kan den aldrig se två rader)
 * eller .eq('id', …) (PK är unik). Med två rader ger den data=null + ett fel
 * som ignorerades — och "finns inte" blev "seeda igen".
 */
describe('ingen agent_automations-existenskoll kan luras av en dubblett', () => {
  const FILES = [
    'src/lib/module-bootstrap.ts',
    'src/lib/platform-seeds.ts',
    'supabase/functions/agent-execute/index.ts',
    'supabase/functions/_shared/pilot/handlers.ts',
  ];

  it.each(FILES)('%s: maybeSingle mot agent_automations kräver limit(1) eller PK-filter', (file) => {
    const src = read(file);
    const offenders: string[] = [];
    for (const m of src.matchAll(/\.from\(['"]agent_automations['"]\)[\s\S]{0,400}?\.maybeSingle\(\)/g)) {
      const seg = m[0];
      if (!/\.limit\(\s*1\s*\)/.test(seg) && !/\.eq\(['"]id['"]/.test(seg)) {
        offenders.push(seg.slice(0, 120));
      }
    }
    expect(
      offenders,
      `maybeSingle() utan limit(1)/PK — vid en dubblett blir svaret null+ignorerat fel, och varje omseedning lägger en rad till:\n${offenders.join('\n---\n')}`,
    ).toEqual([]);
  });

  it('create-vägarna slår upp befintlig rad på (name, skill_name) före insert', () => {
    const agentExecute = read('supabase/functions/agent-execute/index.ts');
    // upsert-uppslaget i case 'automations'
    expect(agentExecute).toMatch(
      /\.from\('agent_automations'\)\s*\n?\s*\.select\('id'\)\s*\n?\s*\.eq\('name',\s*name\)\s*\n?\s*\.eq\('skill_name',\s*targetSkill\)/,
    );

    const handlers = read('supabase/functions/_shared/pilot/handlers.ts');
    expect(handlers).toMatch(
      /\.eq\('name',\s*args\.name\)\s*\n?\s*\.eq\('skill_name',\s*args\.skill_name\)/,
    );
  });

  it('seedvägarna hanterar existenskollens FEL i stället för att tolka det som frånvaro', () => {
    for (const file of ['src/lib/module-bootstrap.ts', 'src/lib/platform-seeds.ts']) {
      const src = read(file);
      const m = src.match(/\.from\('agent_automations'\)\s*\n?\s*\.select\('id'\)[\s\S]{0,300}?\.limit\(1\);?[\s\S]{0,120}/);
      expect(m, `${file}: hittar ingen limit(1)-baserad existenskoll`).toBeTruthy();
      expect(m![0]).toMatch(/if\s*\(existsError\)\s*throw/);
    }
  });
});

describe('golvet i databasen: dedupe + partiellt unikt index', () => {
  const DIR = join(root, 'supabase/migrations');
  const corpus = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ f, sql: readFileSync(join(DIR, f), 'utf8') }));

  it('en migration reser UNIQUE (name, skill_name) WHERE enabled på agent_automations', () => {
    const hit = corpus.find(({ sql }) =>
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+\S+\s+ON\s+public\.agent_automations\s*\(name,\s*skill_name\)\s*NULLS\s+NOT\s+DISTINCT\s*WHERE\s+enabled/i.test(sql),
    );
    expect(hit, 'det partiella unika indexet på agent_automations saknas i migrationskorpusen').toBeTruthy();
  });

  it('dedupen DISABLAR yngre dubbletter med skäl — den raderar inget', () => {
    const mig = corpus.find(({ f }) => f.includes('sex-dagliga-briefingar'));
    expect(mig).toBeTruthy();
    expect(mig!.sql).toMatch(/SET\s+enabled\s*=\s*false/i);
    expect(mig!.sql).toMatch(/last_error\s*=\s*'Disabled 2026-08-28: duplicate/);
    expect(mig!.sql).toMatch(/ORDER\s+BY\s+created_at\s+ASC/i); // äldsta vinner
    expect(mig!.sql).not.toMatch(/DELETE\s+FROM\s+public\.agent_automations/i);
  });
});
