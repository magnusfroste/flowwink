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
  severity: string;
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
  created_at: string;
  policy?: SlaPolicy;
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

      // Compliance rate: policies checked vs violated (approximation)
      const { count: policyCount } = await supabase
        .from('sla_policies')
        .select('*', { count: 'exact', head: true })
        .eq('enabled', true);

      return {
        totalViolations30d: total,
        openViolations: open,
        criticalOpen: critical,
        breaches30d: breaches,
        activePolicies: policyCount ?? 0,
        complianceRate: total === 0 ? 100 : Math.round(((total - breaches) / Math.max(total, 1)) * 100),
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
