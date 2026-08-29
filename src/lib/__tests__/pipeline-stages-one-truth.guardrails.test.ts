import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * One truth for deal stages: the pipeline_stages table (admin-configured under
 * /admin/pipelines/stages). The finding (Magnus, 2026-08-08): the kanban read
 * the config (7 columns incl. Prospecting) while the deal dropdown hardcoded 4
 * active options, the stats hardcoded 6 stages with DIFFERENT probabilities,
 * and a deal sitting in 'prospecting' was silently dropped from every total.
 * Three truths, drifted. Now: config is the source, the hardcoded lists are
 * pre-load fallbacks that mirror the seed, and nothing is ever dropped.
 */

const dealsHook = readFileSync(
  resolve(__dirname, '../../../src/hooks/useDeals.ts'), 'utf-8');
const dealsPage = readFileSync(
  resolve(__dirname, '../../../src/pages/admin/DealsPage.tsx'), 'utf-8');
const dealSection = readFileSync(
  resolve(__dirname, '../../../src/components/admin/DealSection.tsx'), 'utf-8');

describe('the fallbacks mirror the full DB enum and the seed probabilities', () => {
  it("DealStage includes 'prospecting' — the enum value the frontend forgot", () => {
    expect(dealsHook).toMatch(/'lead' \| 'prospecting' \| 'qualified'/);
    expect(dealsHook).toMatch(/prospecting: 0\.20/);
    expect(dealsHook).toMatch(/ACTIVE_STAGES[\s\S]{0,120}'prospecting'/);
  });

  it('the fallback probabilities match the pipeline_stages seed (20/40/60/80), not the old invented 25/50/75', () => {
    expect(dealsHook).toMatch(/qualified: 0\.40/);
    expect(dealsHook).toMatch(/proposal: 0\.60/);
    expect(dealsHook).toMatch(/negotiation: 0\.80/);
  });
});

describe('the stats read the configured pipeline and never drop a deal', () => {
  const statsFn = dealsHook.slice(dealsHook.indexOf('export function useDealStats'));

  it('open/won/probability come from pipeline_stages, hardcoded lists are fallback only', () => {
    expect(statsFn).toMatch(/usePipelineStages\('deal'\)/);
    expect(statsFn).toMatch(/stageConfig\.filter\(\(s\) => !s\.is_won && !s\.is_lost\)/);
    expect(statsFn).toMatch(/cfg\.probability \/ 100/);
  });

  it('an unknown stage gets a bucket on the fly — the silent drop is dead', () => {
    // The old code: `if (!stats[stage]) return;` — a deal in prospecting
    // vanished from totalPipeline. Money must never disappear from stats.
    expect(statsFn).toMatch(/if \(!\(stage in stats\)\) stats\[stage\] = \{ count: 0, value: 0 \}/);
    expect(statsFn).not.toMatch(/if \(!stats\[stage\]\) return/);
  });

  it('every enum stage is always seeded so consumers can read stats.negotiation.value unguarded', () => {
    expect(statsFn).toMatch(/\[\.\.\.ENUM_STAGES, \.\.\.stageConfig\.map\(\(s\) => s\.key\)\]/);
    expect(dealsHook).toMatch(/ENUM_STAGES: DealStage\[\] = \['lead', 'prospecting', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'\]/);
  });

  it('the stats refetch when the admin reconfigures the pipeline', () => {
    expect(statsFn).toMatch(/queryKey: \['deal-stats', basis, configSignature\]/);
  });
});

describe('the edit dropdown shows the same stages as the kanban', () => {
  it('DealsPage renders stage options from usePipelineStages, not a hardcoded list', () => {
    expect(dealsPage).toMatch(/usePipelineStages\('deal'\)/);
    expect(dealsPage).toMatch(/stageOptions\.map\(\(s\) => \(/);
    // The old hardcoded 4-active-option list must not return.
    expect(dealsPage).not.toMatch(/<SelectItem value="lead">Lead<\/SelectItem>/);
  });

  it('the contact view mini-summary uses config for open + probability too', () => {
    expect(dealSection).toMatch(/usePipelineStages\('deal'\)/);
    expect(dealSection).toMatch(/isOpenStage\(d\.stage\)/);
    expect(dealSection).toMatch(/probabilityOf\(d\.stage\)/);
  });

  it('active-deal count follows the config as well', () => {
    const countFn = dealsHook.slice(dealsHook.indexOf('export function useActiveDealCount'), dealsHook.indexOf('export function useDeal('));
    expect(countFn).toMatch(/usePipelineStages\('deal'\)/);
    expect(countFn).toMatch(/queryKey: \['deals-active-count', activeKeys\.join/);
  });
});

describe('the admin can FIND the config from where the work happens', () => {
  const stagesPage = readFileSync(
    resolve(__dirname, '../../../src/pages/admin/PipelineStagesPage.tsx'), 'utf-8');
  const ticketsKanban = readFileSync(
    resolve(__dirname, '../../../src/components/admin/tickets/TicketsKanban.tsx'), 'utf-8');

  it('DealsPage links to the stages config for its own entity', () => {
    expect(dealsPage).toMatch(/\/admin\/pipelines\/stages\?entity=deal/);
  });

  it('the stages page honours ?entity= so contextual links land on the right tab', () => {
    // TicketsKanban linked ?entity=ticket long before the page read the param —
    // every contextual entry silently landed on the Leads tab.
    expect(stagesPage).toMatch(/get\('entity'\)/);
    expect(ticketsKanban).toMatch(/\?entity=ticket/);
  });
});

// ─── Samma regel på kontaktsidan (Magnus 2026-08-29) ────────────────────────
//
// Fyndet: statusväljaren på kontaktdetaljsidan hårdkodade fyra alternativ och
// saknade 'prospect' — ett prospekt öppnat ur triagefliken visade en TOM
// statusruta, och etiketten sa "Contact" där resten av produkten sa "Lead".
// Exakt deals-klassen från 2026-08-08, en yta bort.

describe('kontaktens statusväljare följer den konfigurerade tratten', () => {
  const leadDetail = readFileSync(
    resolve(__dirname, '../../../src/pages/admin/LeadDetailPage.tsx'), 'utf-8');
  const leadsPage = readFileSync(
    resolve(__dirname, '../../../src/pages/admin/LeadsPage.tsx'), 'utf-8');
  const stagesHook = readFileSync(
    resolve(__dirname, '../../../src/hooks/usePipelineStages.ts'), 'utf-8');
  const leadUtils = readFileSync(
    resolve(__dirname, '../../../src/lib/lead-utils.ts'), 'utf-8');

  it('detaljsidan renderar alternativen ur useLeadStatusOptions, inte ur en egen lista', () => {
    expect(leadDetail).toMatch(/useLeadStatusOptions\(\)/);
    expect(leadDetail).toMatch(/statusOptions\.map\(\(o\) => \(/);
    expect(leadDetail).not.toMatch(/<SelectItem value="lead">Contact<\/SelectItem>/);
    expect(leadDetail).not.toMatch(/<SelectItem value="opportunity">/);
  });

  it('listans filter OCH bulkväljare läser samma lista', () => {
    expect(leadsPage).toMatch(/useLeadStatusOptions\(\)/);
    // Två dropdowns, samma källa — ingen får återfalla i egna SelectItems.
    expect(leadsPage.match(/statusOptions\.map\(\(o\) => \(/g)?.length).toBe(2);
    expect(leadsPage).not.toMatch(/<SelectItem value="opportunity">/);
    expect(leadsPage).not.toMatch(/<SelectItem value="customer">/);
  });

  it("'prospect' ligger först och kommer aldrig ur pipelinekonfigurationen", () => {
    // Prospekt lever utanför pipelinen (inget stage_id) men MÅSTE gå att läsa
    // och sätta — en väljare utan postens egen status renderar tom ruta.
    expect(stagesHook).toMatch(/PROSPECT_STATUS_OPTION = \{ key: 'prospect'/);
    expect(stagesHook).toMatch(/\[PROSPECT_STATUS_OPTION, \.\.\.configured\]/);
  });

  it('fallbacken speglar enum-tratten tills konfigurationen laddat (Law 4)', () => {
    expect(stagesHook).toMatch(/usePipelineStages\('lead'\)/);
    expect(stagesHook).toMatch(/LEAD_STAGE_FALLBACK[\s\S]{0,200}'opportunity'[\s\S]{0,120}'customer'/);
  });

  it("badge-etiketten säger 'Lead', inte 'Contact' — samma ord som tratten", () => {
    expect(leadUtils).toMatch(/prospect: \{ label: 'Prospect'/);
    expect(leadUtils).toMatch(/lead: \{ label: 'Lead'/);
    expect(leadUtils).not.toMatch(/lead: \{ label: 'Contact'/);
  });
});
