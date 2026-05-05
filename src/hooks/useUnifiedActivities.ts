import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CrmTask } from './useCrmTasks';

export type UnifiedActivitySource = 'crm_task' | 'activity';

export interface UnifiedActivity {
  id: string;
  source: UnifiedActivitySource;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  // Contextual links
  lead_id: string | null;
  deal_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  activity_type: string | null;
  created_at: string;
}

function fromCrmTask(t: CrmTask): UnifiedActivity {
  return {
    id: t.id,
    source: 'crm_task',
    title: t.title,
    description: t.description,
    due_date: t.due_date,
    priority: t.priority ?? 'medium',
    lead_id: t.lead_id,
    deal_id: t.deal_id,
    entity_type: t.deal_id ? 'deal' : t.lead_id ? 'lead' : null,
    entity_id: t.deal_id ?? t.lead_id ?? null,
    activity_type: 'todo',
    created_at: t.created_at,
  };
}

interface RawActivity {
  id: string;
  entity_type: string;
  entity_id: string;
  activity_type: string;
  subject: string | null;
  body: string | null;
  due_at: string | null;
  done_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function fromActivity(a: RawActivity): UnifiedActivity {
  return {
    id: a.id,
    source: 'activity',
    title: a.subject || `${a.activity_type[0].toUpperCase()}${a.activity_type.slice(1)}`,
    description: a.body,
    due_date: a.due_at,
    priority: (a.metadata && (a.metadata as { priority?: string }).priority) || 'medium',
    lead_id: a.entity_type === 'lead' ? a.entity_id : null,
    deal_id: a.entity_type === 'deal' ? a.entity_id : null,
    entity_type: a.entity_type,
    entity_id: a.entity_id,
    activity_type: a.activity_type,
    created_at: a.created_at,
  };
}

export function useUnifiedPendingActivities() {
  return useQuery({
    queryKey: ['unified-activities', 'pending'],
    queryFn: async () => {
      const [tasksRes, actsRes] = await Promise.all([
        supabase
          .from('crm_tasks')
          .select('*')
          .is('completed_at', null)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(100),
        supabase
          .from('activities')
          .select('*')
          .is('done_at', null)
          .in('activity_type', ['todo', 'call', 'meeting'])
          .order('due_at', { ascending: true, nullsFirst: false })
          .limit(100),
      ]);
      if (tasksRes.error) throw tasksRes.error;
      if (actsRes.error) throw actsRes.error;
      const merged: UnifiedActivity[] = [
        ...(tasksRes.data ?? []).map((t) => fromCrmTask(t as CrmTask)),
        ...(actsRes.data ?? []).map((a) => fromActivity(a as RawActivity)),
      ];
      merged.sort((a, b) => {
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return b.created_at.localeCompare(a.created_at);
      });
      return merged;
    },
  });
}

export function useCompleteUnifiedActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, source }: { id: string; source: UnifiedActivitySource }) => {
      if (source === 'crm_task') {
        const { error } = await supabase
          .from('crm_tasks')
          .update({ completed_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('activities')
          .update({ done_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unified-activities'] });
      qc.invalidateQueries({ queryKey: ['crm-tasks'] });
      qc.invalidateQueries({ queryKey: ['entity-activities'] });
    },
  });
}
