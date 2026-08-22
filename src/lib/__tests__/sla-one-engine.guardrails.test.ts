import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: EN SLA-motor, en sanning.
 *
 * VERKLIGA FEL (QA av support-processen, 2026-08):
 *
 *  • Två implementationer var oense. `useTicketSla` räknade KALENDERtimmar från
 *    created_at, ignorerade avtalsnivåns multiplikator, ignorerade klockpauser
 *    och såg bara policies med metric='resolution'. `run_sla_sweep` räknade
 *    ARBETStid, pausade vid status=waiting och tillämpade tier-multiplikatorn.
 *    Observerat: samma ärende, samma sekund, motsatta domar — admin-UI:t visade
 *    "Overdue 2d" medan svepet inte hade någon brottsrad alls.
 *
 *  • `tickets.sla_deadline` lästes av tre konsumenter men skrevs aldrig av
 *    någon kodväg. Kolumnen var en tom låtsassanning.
 *
 *  • /admin/sla visade "Compliance 100%" bredvid "Open Violations 3": formeln
 *    räknade severity 'breach'/'critical' — värden svepet aldrig skrev (det
 *    skrev entitetens PRIORITET i severity-kolumnen). Kortet var en konstant.
 *
 *  • SLA-modulen seedade ingen automation och inget cron rörde `sla_check`,
 *    fast UI:t påstod att compliance övervakas automatiskt.
 *
 * Spärrarna nedan är negativtestade genom att mutera källan och se dem falla.
 */

const root = process.cwd();
const migrations = join(root, 'supabase/migrations');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function definingSource(signature: string): string {
  const hit = readdirSync(migrations)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => readFileSync(join(migrations, f), 'utf8').includes(signature))
    .pop();
  expect(hit, `ingen migration definierar ${signature}`).toBeTruthy();
  return readFileSync(join(migrations, hit!), 'utf8');
}

const sweepSrc = definingSource('FUNCTION public.run_sla_sweep(');
const deadlineSrc = definingSource('FUNCTION public.sla_ticket_deadline(');
const hookSrc = read('src/hooks/useTicketSla.ts');
/** Samma fil utan kommentarer — docstringen beskriver felet vid namn, spärren gäller KODEN. */
const hookCode = hookSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const slaHookSrc = read('src/hooks/useSla.ts');
const moduleSrc = read('src/lib/modules/sla-module.ts');

describe('fynd 4 — klienten räknar inte om SLA:n', () => {
  it('useTicketSla har ingen egen klocka: inga policies, ingen egen förfallotid', () => {
    // Varje sådant anrop är en andra motor som kommer att döma annorlunda än
    // svepet. Klienten får läsa deadlinen och räkna ner, inget mer.
    expect(hookCode).not.toMatch(/useSlaPolicies/);
    expect(hookCode).not.toMatch(/threshold_multiplier/);
    // Den skarpaste spärren: den gamla motorn räknade
    //   created_at + policy.threshold_minutes * 60_000
    // i kalendertid. Rör hooken created_at igen är den motorn tillbaka.
    // (v.threshold_minutes på en violation-rad är OK — det är svepets egen siffra.)
    expect(hookCode).not.toMatch(/created_at/);
    // ...och den får inte filtrera bort first_response-policies igen.
    expect(hookCode).not.toMatch(/metric === 'resolution'/);
  });

  it('useTicketSla läser svepets skrivna deadline', () => {
    expect(hookSrc).toMatch(/t\.sla_deadline/);
    expect(hookSrc).toMatch(/t\.sla_metric/);
  });

  it('klienten utnämner inte egna brott — bara svepet skriver violations', () => {
    // En passerad deadline utan brottsrad betyder "svepet har inte kört ännu",
    // inte "brott". Ordvalet i UI:t måste skilja dem åt.
    const overdue = hookSrc.slice(hookSrc.indexOf('minutesLeft <= 0'));
    expect(overdue).toMatch(/Due \$\{humanizeMinutes\(minutesLeft\)\} ago/);
    expect(overdue).not.toMatch(/Overdue/);
  });
});

describe('fynd 3 — sla_deadline har en skrivare', () => {
  it('sla_ticket_deadline finns och är den enda som beräknar deadlinen', () => {
    expect(deadlineSrc).toMatch(/FUNCTION public\.sla_ticket_deadline\(p_ticket_id uuid\)/);
    // Den måste respektera samma tre saker som svepet, annars är vi oense igen.
    expect(deadlineSrc).toMatch(/sla_tier_multiplier/);
    expect(deadlineSrc).toMatch(/sla_paused_minutes/);
    expect(deadlineSrc).toMatch(/business_minutes_add/);
  });

  it('deadlinen skrivs både av svepet OCH av en trigger', () => {
    // Bara svepet räcker inte: mellan ärendets skapande och nästa svep skulle
    // UI:t visa "No SLA" på ett ärende som har en klocka igång.
    expect(sweepSrc).toMatch(/ticket_deadlines_written/);
    expect(sweepSrc).toMatch(/TRIGGER trg_sla_stamp_ticket_deadline\b/);
    expect(sweepSrc).toMatch(/TRIGGER trg_sla_stamp_ticket_deadline_on_comment/);
  });

  it('triggern kan inte återutlösa sig själv', () => {
    // AFTER UPDATE OF <kolumner> där sla_deadline/sla_metric medvetet SAKNAS —
    // återskrivningen nämner bara dem, alltså ingen rekursion.
    const trg = sweepSrc.slice(sweepSrc.indexOf('CREATE TRIGGER trg_sla_stamp_ticket_deadline\n'));
    expect(trg).toMatch(/AFTER INSERT OR UPDATE OF status, priority, resolved_at, closed_at, company_id, contact_email/);
    expect(trg.slice(0, 300)).not.toMatch(/sla_deadline/);
  });

  it('triggern är fail-open och läser NEW utan fältnamn', () => {
    // Verifierat på lokal instans: `NEW.ticket_id` i en trigger som delas av
    // tickets och ticket_comments kastar "record new has no field ticket_id"
    // REDAN VID TILLDELNINGEN — utanför EXCEPTION-blocket. Triggern blev då en
    // grind som stoppade varje ärendeskrivning. sla_deadline är dekoration;
    // den får aldrig kunna hindra att ett ärende skapas.
    const fn = sweepSrc
      .slice(
        sweepSrc.indexOf('FUNCTION public.sla_stamp_ticket_deadline()'),
        sweepSrc.indexOf('DROP TRIGGER IF EXISTS trg_sla_stamp_ticket_deadline '),
      )
      // Kommentarerna nämner felet vid namn; spärren gäller KODEN.
      .replace(/--[^\n]*/g, '');
    expect(fn).toMatch(/to_jsonb\(NEW\)->>'ticket_id'/);
    expect(fn).not.toMatch(/NEW\.ticket_id/);
    expect(fn).toMatch(/EXCEPTION WHEN OTHERS THEN/);
  });

  it('deadline-uppdateringen i svepet kan inte fälla svepet', () => {
    const loop = sweepSrc.slice(sweepSrc.indexOf('Stäm av tickets.sla_deadline'));
    expect(loop).toMatch(/EXCEPTION WHEN OTHERS THEN/);
  });
});

describe('fynd 5 — compliance räknar det svepet faktiskt skriver', () => {
  it('svepet skriver severity-ordförrådet warning|breach|critical', () => {
    expect(sweepSrc).toMatch(/FUNCTION public\.sla_severity_for/);
    expect(sweepSrc).toMatch(/v_severity := public\.sla_severity_for\(v_elapsed, v_eff_threshold\)/);
    expect(sweepSrc).toMatch(/'critical'/);
    expect(sweepSrc).toMatch(/'breach'/);
  });

  it('entitetens prioritet bor i sin egen kolumn, inte i severity', () => {
    expect(sweepSrc).toMatch(/ADD COLUMN IF NOT EXISTS entity_priority text/);
    expect(sweepSrc).toMatch(/entity_priority\)/);
    // Och gamla rader flyttas över, annars fortsätter formeln räkna på skräp.
    expect(sweepSrc).toMatch(/UPDATE public\.sla_violations[\s\S]*SET entity_priority = severity/);
  });

  it('compliance-kortet läser motorns rapport, inte en tredje formel', () => {
    const stats = slaHookSrc.slice(slaHookSrc.indexOf('export function useSlaStats'));
    expect(stats).toMatch(/sla_compliance_report/);
    expect(stats).toMatch(/compliance_by_entity/);
    // Den gamla konstanten: (total - breaches) / total.
    expect(stats).not.toMatch(/total - breaches/);
  });
});

describe('anon-ytan växer inte med de nya funktionerna', () => {
  it('varje ny SLA-funktion revokeras från PUBLIC och anon', () => {
    // Anon-ytshärdningen 2026-08: Supabase ALTER DEFAULT PRIVILEGES ger anon
    // EXECUTE på varje ny funktion. En SECURITY DEFINER-funktion är därmed
    // anon-körbar från sekund ett om ingen säger annat — precis så
    // fw_edge_credentials (servicenyckeln) blev anon-nåbar.
    for (const sig of [
      'business_minutes_add(timestamptz, numeric)',
      'sla_clock_spec(text, text)',
      'sla_severity_for(numeric, numeric)',
      'sla_ticket_deadline(uuid)',
    ]) {
      expect(sweepSrc, `${sig} saknar REVOKE`).toContain(
        `REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon;`,
      );
    }
    // Triggerfunktionen ska ingen kunna anropa direkt.
    expect(sweepSrc).toContain(
      'REVOKE ALL ON FUNCTION public.sla_stamp_ticket_deadline() FROM PUBLIC, anon, authenticated;',
    );
  });
});

describe('fynd 2 — någon kör klockan', () => {
  it('SLA-modulen seedar en cron-automation för sla_check', () => {
    expect(moduleSrc).toMatch(/automations: SLA_AUTOMATIONS/);
    expect(moduleSrc).toMatch(/skill_name: 'sla_check'/);
    expect(moduleSrc).toMatch(/trigger_type: 'cron'/);
    expect(moduleSrc).toMatch(/cron: '\*\/15 \* \* \* \*'/);
  });

  it('automationen körs av plattformen, inte av FlowPilot', () => {
    // executor='flowpilot' hoppas över när FlowPilot-modulen är av. Att mäta
    // svarstid är plattformsmekanik och får inte hänga på en agenttoggel.
    const block = moduleSrc.slice(moduleSrc.indexOf('const SLA_AUTOMATIONS'));
    expect(block).toMatch(/executor: 'platform'/);
    expect(block).not.toMatch(/executor: 'flowpilot'/);
  });

  it('modulen har ett riktigt id — inte `as any` förbi typkartan', () => {
    // `id: 'sla' as any` dolde att modulen ÄR en riktig ModulesSettings-nyckel.
    expect(moduleSrc).toMatch(/id: 'sla',/);
    expect(moduleSrc).not.toMatch(/id: 'sla' as any/);
  });

  it('UI:t påstår inte längre att FlowPilot övervakar automatiskt', () => {
    // Påståendet var falskt: ingen automation, inget cron. Nu är det sant och
    // formulerat efter den som faktiskt kör.
    const page = read('src/pages/admin/SlaMonitorPage.tsx');
    expect(page).not.toMatch(/FlowPilot monitors compliance automatically/);
    expect(page).toMatch(/every 15 minutes/);
  });
});
