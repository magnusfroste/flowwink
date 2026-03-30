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
      const { error } = await supabase
        .from('agent_skills')
        .update({ enabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-skills'] }),
    onError: () => toast.error('Failed to toggle skill'),
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
        requires_approval: skill.requires_approval ?? false,
        enabled: skill.enabled ?? true,
        tool_definition: skill.tool_definition ?? {},
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
      if (!approved) {
        // Reject: just mark as failed
        const { error } = await supabase
          .from('agent_activity')
          .update({ status: 'failed' } as any)
          .eq('id', id);
        if (error) throw error;
        return;
      }

      // Approve: fetch activity details, then re-execute via agent-execute
      const { data: activity, error: fetchErr } = await supabase
        .from('agent_activity')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr || !activity) throw new Error('Activity not found');

      // Mark as approved first
      await supabase
        .from('agent_activity')
        .update({ status: 'success' } as any)
        .eq('id', id);

      // Re-execute the skill
      const { error: execErr } = await supabase.functions.invoke('agent-execute', {
        body: {
          skill_name: activity.skill_name,
          arguments: activity.input || {},
          agent_type: (activity as any).agent || 'flowpilot',
          conversation_id: activity.conversation_id,
        },
      });
      if (execErr) throw new Error(execErr.message);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['agent-activity'] });
      toast.success(vars.approved ? 'Approved & executed' : 'Activity rejected');
    },
    onError: (err: any) => toast.error('Failed', { description: err.message }),
  });
}
