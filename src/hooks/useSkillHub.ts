import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AgentSkill, AgentActivity } from '@/types/agent';

// ─── Skills ───────────────────────────────────────────────────────────────────

export function useSkills() {
  return useQuery({
    queryKey: ['agent-skills'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_skills')
        .select('*')
        .order('category')
        .order('name');
      if (error) throw error;
      return data as unknown as AgentSkill[];
    },
  });
}

export function useToggleSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      // MCP invariant: mcp_exposed=true requires enabled=true. Disabling a
      // skill must also unexpose it, or the MCP catalog advertises a tool
      // that errors on call (system-sweep finding #A4, 2026-07-07).
      const payload = enabled ? { enabled } : { enabled, mcp_exposed: false };
      const { error } = await supabase
        .from('agent_skills')
        .update(payload as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-skills'] }),
    onError: () => toast.error('Failed to toggle skill'),
  });
}

export function useBulkToggleSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, enabled }: { ids: string[]; enabled: boolean }) => {
      if (!ids.length) return;
      // Same MCP invariant as useToggleSkill (finding #A4).
      const payload = enabled ? { enabled } : { enabled, mcp_exposed: false };
      const { error } = await supabase
        .from('agent_skills')
        .update(payload as never)
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['agent-skills'] });
      toast.success(`${vars.enabled ? 'Enabled' : 'Disabled'} ${vars.ids.length} skills`);
    },
    onError: () => toast.error('Failed to bulk update skills'),
  });
}

export function useToggleMcpExposed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, mcp_exposed }: { id: string; mcp_exposed: boolean }) => {
      // MCP invariant: exposing a skill implies enabling it — an exposed but
      // disabled skill is an orphan tool (system-sweep finding #A3).
      const payload = mcp_exposed ? { mcp_exposed, enabled: true } : { mcp_exposed };
      const { error } = await supabase
        .from('agent_skills')
        .update(payload as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-skills'] }),
    onError: () => toast.error('Failed to update MCP exposure'),
  });
}

export function useUpsertSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skill: Partial<AgentSkill> & { name: string; handler: string }) => {
      const payload = {
        name: skill.name,
        description: skill.description ?? null,
        category: skill.category ?? 'content',
        scope: skill.scope ?? 'internal',
        handler: skill.handler,
        enabled: skill.enabled ?? true,
        tool_definition: skill.tool_definition ?? {},
        // Unify trust_level with requires_staging — the flag agent-execute reads to
        // gate a skill behind the staged-approval (HIL) envelope. Writing only
        // trust_level left requires_staging stale, so admins would flip a skill
        // to "notify" but it kept staging. Keep them in lockstep.
        ...(skill.trust_level
          ? { trust_level: skill.trust_level, requires_staging: skill.trust_level === 'approve' }
          : {}),
      };

      if (skill.id) {
        const { error } = await supabase
          .from('agent_skills')
          .update(payload)
          .eq('id', skill.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agent_skills')
          .insert({ ...payload, origin: 'user' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-skills'] });
      toast.success('Skill saved');
    },
    onError: () => toast.error('Failed to save skill'),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agent_skills').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-skills'] });
      toast.success('Skill deleted');
    },
    onError: () => toast.error('Failed to delete skill'),
  });
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export function useActivity(filters?: { status?: string; agent?: string }) {
  return useQuery({
    queryKey: ['agent-activity', filters],
    queryFn: async () => {
      let q = supabase
        .from('agent_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters?.status) q = q.eq('status', filters.status as any);
      if (filters?.agent) q = q.eq('agent', filters.agent as any);

      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as AgentActivity[];
    },
  });
}

export function useApproveActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const { data: activity, error: fetchErr } = await supabase
        .from('agent_activity')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr || !activity) throw new Error('Activity not found');
      const requestId = (activity as { approval_request_id?: string | null }).approval_request_id ?? null;

      if (!approved) {
        // Reject: the decision lives on the approval request (one ledger);
        // its trigger marks the activity rejected. Legacy rows without a
        // request are marked failed directly.
        if (requestId) {
          const { error } = await supabase.rpc('resolve_approval', {
            p_request_id: requestId, p_decision: 'reject', p_comment: 'Rejected in Skill Hub',
          });
          if (error && !/already resolved/i.test(error.message)) throw error;
        }
        const { error } = await supabase
          .from('agent_activity')
          .update({ status: 'failed' } as any)
          .eq('id', id)
          .in('status', ['pending_approval', 'approved']);
        if (error) throw error;
        return;
      }

      // Approve = decide on the request, then redeem it ONCE. agent-execute
      // consumes the request (claim_skill_approval, atomic) and settles this
      // activity row itself — a second Approve, a polling MCP client or the
      // follow-through sweep is refused with 409, never a second run.
      if (requestId) {
        const { error } = await supabase.rpc('resolve_approval', {
          p_request_id: requestId, p_decision: 'approve', p_comment: 'Approved in Skill Hub',
        });
        if (error && !/already resolved/i.test(error.message)) throw error;
      }
      const { error: execErr } = await supabase.functions.invoke('agent-execute', {
        body: {
          skill_name: activity.skill_name,
          arguments: {
            ...(activity.input as any || {}),
            _approved: true,
            ...(requestId ? { _approval_request_id: requestId } : { _approval_activity_id: id }),
          },
          agent_type: (activity as any).agent || 'flowpilot',
          conversation_id: activity.conversation_id,
        },
      });
      if (execErr) {
        const body = await (execErr as { context?: Response }).context?.clone().json().catch(() => null);
        if (body?.reason === 'already_executed') return; // the work happened — by another executor
        throw new Error(body?.message ?? execErr.message);
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['agent-activity'] });
      toast.success(vars.approved ? 'Approved & executed' : 'Activity rejected');
    },
    onError: (err: any) => toast.error('Failed', { description: err.message }),
  });
}
