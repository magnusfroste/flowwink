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

function extractMentionTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const tokens = new Set<string>();
  const re = /@([a-zA-Z0-9._-]{2,40})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) tokens.add(m[1].toLowerCase());
  return Array.from(tokens);
}

async function autoFollowMentions(entityType: string, entityId: string, tokens: string[]) {
  if (tokens.length === 0) return;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email');
  if (!profiles?.length) return;
  const matches = profiles.filter((p) => {
    const name = (p.full_name ?? '').toLowerCase().replace(/\s+/g, '');
    const email = (p.email ?? '').toLowerCase().split('@')[0];
    return tokens.some((t) => name.includes(t) || email === t);
  });
  if (matches.length === 0) return;
  await supabase.from('entity_followers').upsert(
    matches.map((p) => ({
      entity_type: entityType,
      entity_id: entityId,
      user_id: p.id,
      reason: 'mention',
    })),
    { onConflict: 'entity_type,entity_id,user_id', ignoreDuplicates: true },
  );
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
      const tokens = [
        ...extractMentionTokens(input.subject),
        ...extractMentionTokens(input.body),
      ];
      if (tokens.length > 0) {
        try {
          await autoFollowMentions(input.entity_type, input.entity_id, Array.from(new Set(tokens)));
        } catch (e) {
          console.warn('auto-follow mentions failed', e);
        }
      }
      return data as EntityActivity;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: entityActivitiesKey(row.entity_type, row.entity_id) });
      qc.invalidateQueries({ queryKey: ['entity-followers', row.entity_type, row.entity_id] });
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

/**
 * Research and fit-analysis rows for one company.
 *
 * Lives here rather than in the companies component that renders it: this
 * module owns reads of `activities`, and the table-ownership guardrail is
 * right to insist — a domain reaching into another domain's table is how two
 * readers of the same rows drift apart. (It caught exactly that on the first
 * attempt, 2026-08-29.)
 */
export interface CompanyResearchRow {
  id: string;
  activity_type: string;
  subject: string | null;
  body: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export const COMPANY_RESEARCH_TYPES = ['research', 'fit_analysis'];

export function useCompanyResearch(companyId: string | undefined) {
  return useQuery({
    queryKey: ['company-research', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CompanyResearchRow[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select('id, activity_type, subject, body, metadata, created_at')
        .eq('entity_type', 'company')
        .eq('entity_id', companyId!)
        .in('activity_type', COMPANY_RESEARCH_TYPES)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as CompanyResearchRow[];
    },
  });
}
