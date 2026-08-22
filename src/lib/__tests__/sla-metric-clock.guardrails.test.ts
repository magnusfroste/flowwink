import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: svarstidsmätaren måste mäta svar.
 *
 * VERKLIGT FEL (QA av support-processen, 2026-08):
 * `run_sla_sweep` behandlade kolumnen `metric` som dekoration. Varje policy
 * mättes likadant — från entitetens created_at till dess entiteten inte längre
 * var "öppen". Två konkreta observationer:
 *   • ett ärende som besvarades på 30 minuter loggades som first_response-brott
 *     på 1020 minuter (klockan fortsatte till stängning)
 *   • två policies med OLIKA metric gav byte-identiska actual_minutes
 * Plattformen kunde alltså inte mäta det den säljer: "vi svarar inom X".
 *
 * Skillnaden fanns redan i datamodellen — `ticket_comments.is_internal` och
 * `author_type` — och behövde bara användas. Spärrarna nedan skyddar mot att
 * den kopplingen tyst försvinner igen, t.ex. vid en omskrivning som "förenklar"
 * klockan tillbaka till en enda öppen-villkors-fråga.
 *
 * Alla spärrar är negativtestade genom att mutera migrationskällan och se
 * testet falla.
 */

const root = process.cwd();
const migrations = join(root, 'supabase/migrations');

/** Migrationsfilen som senast definierar en funktion (den vinnande kroppen). */
function definingSource(signature: string): string {
  const files = readdirSync(migrations)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const hit = files.filter((f) => readFileSync(join(migrations, f), 'utf8').includes(signature)).pop();
  expect(hit, `ingen migration definierar ${signature}`).toBeTruthy();
  return readFileSync(join(migrations, hit!), 'utf8');
}

const sweepSrc = definingSource('FUNCTION public.run_sla_sweep(');
const specSrc = definingSource('FUNCTION public.sla_clock_spec(');

describe('SLA-klockan stannar där metricen säger', () => {
  it('first_response stoppas av ett SVAR TILL KUNDEN, inte av en intern anteckning', () => {
    // Utan is_internal-filtret räknas en intern anteckning som ett svar —
    // då ser varje ärende ut att vara besvarat på minuten och mätaren blir
    // lika värdelös som när den mätte till stängning, bara åt andra hållet.
    expect(specSrc).toMatch(/first_response/);
    expect(specSrc).toMatch(/ticket_comments/);
    expect(specSrc).toMatch(/c\.is_internal\s*=\s*false/);
    // author_type = 'customer' är kundens egna inlägg och är inte ett svar.
    expect(specSrc).toMatch(/c\.author_type\s*<>\s*''customer''/);
  });

  it('resolution stoppas av resolved_at/closed_at — en annan klocka än first_response', () => {
    expect(specSrc).toMatch(/e\.resolved_at/);
    expect(specSrc).toMatch(/e\.closed_at/);
  });

  it('varje kartlagd entitetstyp har ett eget klockslut (ingen delad "öppen"-fråga)', () => {
    for (const [entity, endMarker] of [
      ['order', 'e.shipped_at'],
      ['booking', 'e.confirmation_sent_at'],
      ['lead', 'e.ai_qualified_at'],
      ['chat', 'chat_messages'],
    ] as const) {
      expect(specSrc, `${entity} saknar klockslut`).toContain(endMarker);
    }
  });

  it('svepet mäter till klockans slut, inte till now() för alla', () => {
    // Kärnan i fixen: elapsed beräknas mot COALESCE(ended_at, now()).
    // Faller detta tillbaka till now() är fynd 1 tillbaka.
    expect(sweepSrc).toMatch(/v_clock_end\s*:=\s*COALESCE\(v_ent\.ended_at,\s*now\(\)\)/);
    expect(sweepSrc).toMatch(/business_minutes_between\(v_ent\.started_at,\s*v_clock_end\)/);
  });

  it('svepet läser klockkartan i stället för att hårdkoda ett öppen-villkor per entitet', () => {
    expect(sweepSrc).toMatch(/public\.sla_clock_spec\(v_policy\.entity_type,\s*v_policy\.metric\)/);
  });

  it('en okartlagd metric RAPPORTERAS i stället för att mätas fel snyggt', () => {
    // Law: hellre synlig drift än en siffra som ser rimlig ut.
    expect(specSrc).toMatch(/'mapped'/);
    expect(sweepSrc).toMatch(/v_unmapped\s*:=\s*v_unmapped\s*\|\|/);
    // Det räcker inte att SAMLA dem — de måste tillbaka till anroparen, annars
    // är driften lika osynlig som förut.
    const ret = sweepSrc.slice(sweepSrc.lastIndexOf('RETURN jsonb_build_object('));
    expect(ret).toMatch(/'unmapped_metrics', v_unmapped/);
  });

  it('en redan stannad klocka fångas retroaktivt — annars missas varje sent svar', () => {
    // Utan lookback-fönstret ser svepet bara entiteter som fortfarande är
    // öppna. Ett ärende som besvarades för sent och sedan stängdes mellan två
    // svep loggas då aldrig, och compliance blir systematiskt för bra.
    expect(sweepSrc).toMatch(/c_lookback_days\s+constant\s+integer/);
    expect(sweepSrc).toMatch(/interval\s+''1 day''\s*\*/);
  });

  it('dedupen tittar på LÖSTA violations också (annars duplicerar lookbacken)', () => {
    // Retroaktiva fönstret + dedupe-på-endast-öppna = en ny violation-rad per
    // svep i sju dygn för samma stannade klocka.
    const guard = sweepSrc.slice(
      sweepSrc.indexOf('FROM public.sla_violations'),
      sweepSrc.indexOf('v_severity :='),
    );
    expect(guard).toMatch(/policy_id = v_policy\.id AND entity_id = v_ent\.id/);
    expect(guard).not.toMatch(/resolved_at IS NULL/);
  });

  it('auto-lösningen frågar om KLOCKAN stannat, inte om entiteten är öppen', () => {
    const resolveLoop = sweepSrc.slice(sweepSrc.indexOf('Auto-lös violations'));
    expect(resolveLoop).toMatch(/\(%s\) IS NOT NULL/);
    expect(resolveLoop).toMatch(/v_end_expr/);
  });

  it('signaturen är oförändrad — ingen överlagring av run_sla_sweep', () => {
    // Överlagringsdrift har bitit oss förut (refund_return p_final): en extra
    // defaultad parameter gör namngivna anrop tvetydiga och skiljer instanser åt.
    expect(sweepSrc).toContain('FUNCTION public.run_sla_sweep(p_entity_type text DEFAULT NULL)');
    const allSigs = readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .flatMap((f) => readFileSync(join(migrations, f), 'utf8').match(/FUNCTION public\.run_sla_sweep\([^)]*\)/g) ?? []);
    expect(new Set(allSigs).size, `flera signaturer: ${[...new Set(allSigs)].join(' | ')}`).toBe(1);
  });

  it('är agent-anropbar: service_role-undantaget finns kvar', () => {
    // MCP-gatewayn kör RPC-skills med servicenyckeln, så auth.uid() är NULL.
    expect(sweepSrc).toMatch(/auth\.role\(\) = 'service_role'/);
  });

  it('svepet är kapat per policy och per deadline-uppdatering', () => {
    expect(sweepSrc).toMatch(/LIMIT 500/);
    expect(sweepSrc).toMatch(/LIMIT 1000/);
  });
});

describe('arbetstidsklockan och pauserna överlever omskrivningen', () => {
  it('svepet mäter fortfarande arbetsminuter när en kalender finns', () => {
    expect(sweepSrc).toMatch(/v_use_bh\s*:=\s*EXISTS \(SELECT 1 FROM public\.business_hours/);
    expect(sweepSrc).toMatch(/public\.business_minutes_between/);
  });

  it('pausade minuter dras fortfarande av, mätt på samma klocka', () => {
    expect(sweepSrc).toMatch(/public\.sla_paused_minutes\(v_policy\.entity_type, v_ent\.id, v_ent\.started_at, v_clock_end, v_use_bh\)/);
    expect(sweepSrc).toMatch(/GREATEST\(v_elapsed - v_paused, 0\)/);
  });

  it('avtalsnivåns multiplikator tillämpas fortfarande på tröskeln', () => {
    expect(sweepSrc).toMatch(/public\.sla_tier_multiplier\(v_ent\.company_id, v_ent\.email\)/);
  });
});
