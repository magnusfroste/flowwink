/**
 * usePipelineStages — shared accessor for the pipeline_stages table.
 *
 * Returns rows for one entity_type ('lead' | 'deal' | 'ticket'), ordered by
 * sort_order. Used by DealKanban, LeadKanban, TicketsKanban and the
 * PipelineSummary forecast so the UI always reflects whatever stages an admin
 * has configured under /admin/pipelines/stages.
 *
 * The DB enum (deals.stage, leads.status, tickets.status) stays the source of
 * truth for legacy code paths; the sync_*_stage triggers keep stage_id and the
 * enum column in lockstep, so writing either side is safe.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PipelineEntityType = 'lead' | 'deal' | 'ticket';

export interface PipelineStage {
  id: string;
  entity_type: PipelineEntityType;
  key: string;
  name: string;
  sort_order: number;
  probability: number | null;
  is_won: boolean;
  is_lost: boolean;
  fold: boolean;
  is_active: boolean;
}

export function usePipelineStages(entityType: PipelineEntityType) {
  return useQuery({
    queryKey: ['pipeline-stages', entityType],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id, entity_type, key, name, sort_order, probability, is_won, is_lost, fold, is_active')
        .eq('entity_type', entityType)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PipelineStage[];
    },
  });
}

/** Tailwind classes used to colour stage badges. Order matches sort_order. */
const STAGE_COLOR_CYCLE = [
  'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300',
  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  'bg-warning/10 text-warning',
  'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  'bg-success/10 text-success',
];

export function getStageColor(stage: PipelineStage, index: number): string {
  if (stage.is_won) return 'bg-success/10 text-success';
  if (stage.is_lost) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
  return STAGE_COLOR_CYCLE[index % STAGE_COLOR_CYCLE.length];
}

/**
 * The contact funnel as ONE list — prospect → lead → opportunity → customer
 * (+ lost), for every status dropdown on the contact surfaces.
 *
 * Same one-truth rule as deal stages: the options come from the configured
 * `pipeline_stages` rows, so a stage an admin renames, adds or deactivates
 * changes the kanban columns AND the dropdowns together. The hardcoded list
 * below is a pre-load fallback mirroring the seed, never a second truth.
 *
 * `prospect` is prepended rather than configured: prospecting finds live
 * OUTSIDE the pipeline by design (they carry no stage_id — see the Prospects
 * triage tab), but a human still has to be able to read the status on a record
 * and send one back to triage. A dropdown missing the record's own status
 * renders an EMPTY trigger, which is how this surfaced (Magnus, 2026-08-29).
 */
export const PROSPECT_STATUS_OPTION = { key: 'prospect', name: 'Prospect' };

const LEAD_STAGE_FALLBACK = [
  { key: 'lead', name: 'Lead' },
  { key: 'opportunity', name: 'Opportunity' },
  { key: 'customer', name: 'Customer' },
  { key: 'lost', name: 'Lost' },
];

export function useLeadStatusOptions(opts?: { includeProspect?: boolean }): Array<{ key: string; name: string }> {
  const { data: stages = [] } = usePipelineStages('lead');
  const configured = stages.length
    ? stages.map((s) => ({ key: s.key, name: s.name }))
    : LEAD_STAGE_FALLBACK;
  return opts?.includeProspect === false
    ? configured
    : [PROSPECT_STATUS_OPTION, ...configured];
}
