/**
 * useApprovals — generic hook for any module needing approval workflow.
 *
 * Usage in a module page (e.g. PurchaseOrderDetail):
 *   const { evaluate, request, requestsForEntity } = useApprovals();
 *   const { required } = await evaluate('purchase_order', 1500000);
 *   if (required) await request({ entity_type: 'purchase_order', entity_id: po.id, amount_cents: 1500000 });
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/cms';
import type { Database } from '@/integrations/supabase/types';

export type ApprovalRequest = Database['public']['Tables']['approval_requests']['Row'];
export type ApprovalRule = Database['public']['Tables']['approval_rules']['Row'];
export type ApprovalDecision = Database['public']['Tables']['approval_decisions']['Row'];

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useApprovalRules() {
  return useQuery({
    queryKey: ['approvals', 'rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_rules')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useApprovalsForEntity(entityType: string | null, entityId: string | null) {
  return useQuery({
    queryKey: ['approvals', 'entity', entityType, entityId],
    queryFn: async () => {
      if (!entityType || !entityId) return [];
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!entityType && !!entityId,
  });
}

export function useApprovals() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['approvals'] });
  };

  const evaluate = async (
    entityType: string,
    amountCents?: number | null,
    currency = 'SEK',
  ): Promise<{ required: boolean; ruleId?: string; requiredRole?: string; ruleName?: string }> => {
    const { data, error } = await supabase.rpc('evaluate_approval_required', {
      p_entity_type: entityType,
      p_amount_cents: amountCents ?? null,
      p_currency: currency,
    });
    if (error) throw error;
    const rule = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return {
      required: !!rule,
      ruleId: rule?.rule_id,
      requiredRole: rule?.required_role,
      ruleName: rule?.rule_name,
    };
  };

  const request = useMutation({
    mutationFn: async (input: {
      entity_type: string;
      entity_id: string;
      amount_cents?: number | null;
      currency?: string;
      reason?: string;
      context?: Record<string, unknown>;
    }) => {
      const evalResult = await evaluate(input.entity_type, input.amount_cents, input.currency ?? 'SEK');
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('approval_requests')
        .insert({
          rule_id: evalResult.ruleId ?? null,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          amount_cents: input.amount_cents ?? null,
          currency: input.currency ?? 'SEK',
          reason: input.reason ?? null,
          // Whatever role the RULE names — the column is app_role and
          // resolve_approval() checks has_role() against it, so narrowing this
          // cast to the legacy trio would misdescribe a rule that requires,
          // say, `accounting` (rollsvepet #102, app-lagret).
          required_role: (evalResult.requiredRole ?? 'admin') as AppRole,
          requested_by: userData.user?.id ?? null,
          context: (input.context as never) ?? {},
        })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const decide = useMutation({
    mutationFn: async (input: { request_id: string; decision: 'approve' | 'reject'; comment?: string }) => {
      // Read the request first: an agent_skill request carries the call it
      // gates (skill_name, args, the pending activity), and approving it must
      // RUN that call — until 2026-09-03 Approve only flipped the row, and the
      // action never happened unless someone also found it in the Skill Hub.
      const { data: req, error: reqErr } = await supabase
        .from('approval_requests')
        .select('entity_type, context')
        .eq('id', input.request_id)
        .maybeSingle();
      if (reqErr) throw reqErr;
      const { data, error } = await supabase.rpc('resolve_approval', {
        p_request_id: input.request_id,
        p_decision: input.decision,
        p_comment: input.comment ?? null,
      });
      if (error) throw error;
      const ctx = ((req as { context?: Record<string, unknown> } | null)?.context ?? {}) as Record<string, unknown>;
      const skillName = typeof ctx.skill_name === 'string' ? ctx.skill_name : null;
      if (input.decision === 'approve' && (req as { entity_type?: string } | null)?.entity_type === 'agent_skill' && skillName) {
        const args = (ctx.args && typeof ctx.args === 'object' ? ctx.args : {}) as Record<string, unknown>;
        const { data: run, error: execErr } = await supabase.functions.invoke('agent-execute', {
          body: {
            skill_name: skillName,
            arguments: { ...args, _approved: true },
            agent_type: typeof ctx.agent === 'string' ? ctx.agent : 'flowpilot',
            conversation_id: typeof ctx.conversation_id === 'string' ? ctx.conversation_id : undefined,
          },
        });
        if (execErr) throw new Error(`Approved, but running ${skillName} failed: ${execErr.message}`);
        const result = (run as { result?: { success?: boolean; error?: string }; error?: string } | null);
        if (result?.error || result?.result?.success === false) {
          throw new Error(`Approved, but ${skillName} reported: ${result?.error || result?.result?.error}`);
        }
        if (typeof ctx.activity_id === 'string') {
          await supabase.from('agent_activity').update({ status: 'success' } as never).eq('id', ctx.activity_id).eq('status', 'pending_approval');
        }
      }
      return data;
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async (request_id: string) => {
      const { error } = await supabase
        .from('approval_requests')
        .update({ status: 'cancelled' })
        .eq('id', request_id)
        .eq('status', 'pending');
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { evaluate, request, decide, cancel };
}
