import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type EntityActivityType = 'note' | 'call' | 'meeting' | 'todo' | 'email' | 'status_change';

export interface EntityActivity {
  id: string;
  entity_type: string;
  entity_id: string;
  activity_type: EntityActivityType;
  subject: string | null;
  body: string | null;
  due_at: string | null;
  done_at: string | null;
  assigned_to: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const entityActivitiesKey = (entityType: string, entityId: string) =>
  ['entity-activities', entityType, entityId] as const;

export function useEntityActivities(entityType: string, entityId: string | null | undefined) {
  return useQuery({
    queryKey: entityActivitiesKey(entityType, entityId ?? ''),
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EntityActivity[];
    },
  });
}

export interface CreateEntityActivityInput {
  entity_type: string;
  entity_id: string;
  activity_type: EntityActivityType;
  subject?: string | null;
  body?: string | null;
  due_at?: string | null;
  assigned_to?: string | null;
}

export function useCreateEntityActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEntityActivityInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('activities')
        .insert({ ...input, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as EntityActivity;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: entityActivitiesKey(row.entity_type, row.entity_id) });
    },
  });
}

export function useToggleActivityDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { data, error } = await supabase
        .from('activities')
        .update({ done_at: done ? new Date().toISOString() : null })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as EntityActivity;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: entityActivitiesKey(row.entity_type, row.entity_id) });
    },
  });
}

export function useDeleteEntityActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, entity_type, entity_id }: { id: string; entity_type: string; entity_id: string }) => {
      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (error) throw error;
      return { entity_type, entity_id };
    },
    onSuccess: ({ entity_type, entity_id }) => {
      qc.invalidateQueries({ queryKey: entityActivitiesKey(entity_type, entity_id) });
    },
  });
}
