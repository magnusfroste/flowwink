import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────

export interface SlaPolicy {
  id: string;
  name: string;
  description: string | null;
  entity_type: string;
  metric: string;
  threshold_minutes: number;
  priority: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SlaViolation {
  id: string;
  policy_id: string;
  entity_type: string;
  entity_id: string;
  metric: string;
  threshold_minutes: number;
  actual_minutes: number;
  /** warning | breach | critical — how far past the threshold, not a priority. */
  severity: string;
  /** The entity's own priority at breach time (low/medium/high/urgent). */
  entity_priority: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
  created_at: string;
  policy?: SlaPolicy;
}

/** Only the slice of `sla_compliance_report` this hook needs. */
interface ComplianceReportShape {
  compliance_by_entity?: Record<string, { created_in_period: number; violations_in_period: number }>;
}

export type CreatePolicyInput = Omit<SlaPolicy, 'id' | 'created_at' | 'updated_at'>;

// ── Queries ──────────────────────────────────────────────────────────

export function useSlaPolicies() {
  return useQuery({
    queryKey: ['sla-policies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_policies')
        .select('*')
        .order('entity_type')
        .order('metric');
      if (error) throw error;
      return data as SlaPolicy[];
    },
  });
}

export function useSlaViolations(filters?: { resolved?: boolean; entity_type?: string }) {
  return useQuery({
    queryKey: ['sla-violations', filters],
    queryFn: async () => {
      let query = supabase
        .from('sla_violations')
        .select('*, policy:sla_policies(*)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters?.resolved === false) {
        query = query.is('resolved_at', null);
      } else if (filters?.resolved === true) {
        query = query.not('resolved_at', 'is', null);
      }

      if (filters?.entity_type) {
        query = query.eq('entity_type', filters.entity_type);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SlaViolation[];
    },
  });
}

/**
 * Stats for the SLA Monitor header cards.
 *
 * `complianceRate` kommer från `sla_compliance_report` — samma RPC som
 * Compliance-fliken läser. Varför: kortet visade "Compliance 100%" bredvid
 * "Open Violations 3". Formeln räknade andelen violations med severity
 * 'breach'/'critical' — värden som svepet aldrig skrev (det skrev entitetens
 * PRIORITET i severity-kolumnen). Täljaren var därför konstant noll och kortet
 * en konstant. Att laga formeln i klienten hade gett en TREDJE definition av
 * compliance; i stället läser vi motorns egen: 1 − brott / skapade entiteter
 * i perioden, viktat över entitetstyperna. Två ytor kan då inte visa olika
 * compliance för samma vecka.
 */
export function useSlaStats() {
  return useQuery({
    queryKey: ['sla-stats'],
    queryFn: async () => {
      const { data: violations, error } = await supabase
        .from('sla_violations')
        .select('severity, resolved_at, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
      if (error) throw error;

      const total = violations?.length ?? 0;
      const open = violations?.filter(v => !v.resolved_at).length ?? 0;
      const critical = violations?.filter(v => v.severity === 'critical' && !v.resolved_at).length ?? 0;
      const breaches = violations?.filter(v => v.severity === 'breach' || v.severity === 'critical').length ?? 0;

      const { count: policyCount } = await supabase
        .from('sla_policies')
        .select('*', { count: 'exact', head: true })
        .eq('enabled', true);

      // Compliance from the engine, not from a second formula in the client.
      let complianceRate = 100;
      const { data: report } = await supabase.rpc('sla_compliance_report', { p_days: 30 });
      const byEntity = (report as ComplianceReportShape | null)?.compliance_by_entity;
      if (byEntity) {
        const rows = Object.values(byEntity);
        const created = rows.reduce((s, r) => s + (r.created_in_period ?? 0), 0);
        const violated = rows.reduce((s, r) => s + (r.violations_in_period ?? 0), 0);
        // Inga entiteter i perioden = inget att vara compliant MOT. 100 är då
        // ärligt (det finns inget löfte som bröts), till skillnad från förut
        // där 100 var svaret oavsett hur många brott som låg öppna.
        if (created > 0) complianceRate = Math.round((1 - Math.min(violated / created, 1)) * 100);
      }

      return {
        totalViolations30d: total,
        openViolations: open,
        criticalOpen: critical,
        breaches30d: breaches,
        activePolicies: policyCount ?? 0,
        complianceRate,
      };
    },
  });
}

// ── Mutations ────────────────────────────────────────────────────────

export function useCreateSlaPolicy() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreatePolicyInput) => {
      const { data, error } = await supabase
        .from('sla_policies')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as SlaPolicy;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-policies'] });
      toast({ title: 'Policy created' });
    },
  });
}

export function useUpdateSlaPolicy() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SlaPolicy> & { id: string }) => {
      const { error } = await supabase
        .from('sla_policies')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-policies'] });
      toast({ title: 'Policy updated' });
    },
  });
}

export function useDeleteSlaPolicy() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sla_policies')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-policies'] });
      qc.invalidateQueries({ queryKey: ['sla-violations'] });
      toast({ title: 'Policy deleted' });
    },
  });
}

export function useResolveSlaViolation() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { error } = await supabase
        .from('sla_violations')
        .update({ resolved_at: new Date().toISOString(), resolved_by: 'admin', notes })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-violations'] });
      qc.invalidateQueries({ queryKey: ['sla-stats'] });
      toast({ title: 'Violation resolved' });
    },
  });
}
