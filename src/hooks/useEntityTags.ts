import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as unknown as {
  from: (table: string) => any;
  auth: typeof supabase.auth;
};

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string;
  scope: string;
  description: string | null;
}

export interface EntityTagRow {
  id: string;
  tag_id: string;
  entity_type: string;
  entity_id: string;
  tag: Tag;
}

const tagsKey = ['tags'] as const;
const entityTagsKey = (t: string, id: string) => ['entity-tags', t, id] as const;

export function useTags(scope?: string) {
  return useQuery({
    queryKey: [...tagsKey, scope ?? '*'],
    queryFn: async () => {
      let q = sb.from('tags').select('*').order('name');
      if (scope) q = q.in('scope', [scope, '*']);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
  });
}

export function useEntityTags(entityType: string, entityId: string | null | undefined) {
  return useQuery({
    queryKey: entityTagsKey(entityType, entityId ?? ''),
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await sb
        .from('entity_tags')
        .select('id, tag_id, entity_type, entity_id, tag:tags(*)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!);
      if (error) throw error;
      return (data ?? []) as EntityTagRow[];
    },
  });
}

export function useAttachTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entity_type: string; entity_id: string; tag_id: string }) => {
      const { data: { user } } = await sb.auth.getUser();
      const { error } = await sb
        .from('entity_tags')
        .insert({ ...input, created_by: user?.id ?? null });
      if (error && !`${error.message}`.includes('duplicate')) throw error;
      return input;
    },
    onSuccess: ({ entity_type, entity_id }) =>
      qc.invalidateQueries({ queryKey: entityTagsKey(entity_type, entity_id) }),
  });
}

export function useDetachTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, entity_type, entity_id }: { id: string; entity_type: string; entity_id: string }) => {
      const { error } = await sb.from('entity_tags').delete().eq('id', id);
      if (error) throw error;
      return { entity_type, entity_id };
    },
    onSuccess: ({ entity_type, entity_id }) =>
      qc.invalidateQueries({ queryKey: entityTagsKey(entity_type, entity_id) }),
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color?: string; scope?: string }) => {
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data, error } = await sb
        .from('tags')
        .insert({ name: input.name, slug, color: input.color ?? '#64748b', scope: input.scope ?? '*' })
        .select()
        .single();
      if (error) throw error;
      return data as Tag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tagsKey }),
  });
}
