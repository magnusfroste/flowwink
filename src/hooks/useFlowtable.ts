import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type FlowtableFieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'url'
  | 'email'
  | 'phone'
  | 'link'
  | 'lookup'
  | 'rollup';

export interface FlowtableBase {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string | null;
  owner_id: string;
  workspace_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface FlowtableViewFilter {
  field: string;
  op: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'empty' | 'not_empty';
  value?: string;
}
export interface FlowtableViewConfig {
  filters?: FlowtableViewFilter[];
  sort?: { field: string; dir: 'asc' | 'desc' } | null;
  group_by?: string | null;   // grid grouping (optional)
  kanban_field?: string | null; // field grouped into columns in kanban view
}

export interface FlowtableTable {
  id: string;
  base_id: string;
  name: string;
  slug: string;
  view_mode: 'grid' | 'list' | 'card' | 'kanban';
  position: number;
  view_config?: FlowtableViewConfig;
}

export interface FlowtableField {
  id: string;
  table_id: string;
  name: string;
  key: string;
  type: FlowtableFieldType;
  options: Record<string, unknown>;
  position: number;
  width: number;
}

export interface FlowtableRecord {
  id: string;
  table_id: string;
  values: Record<string, unknown>;
  position: number;
  created_at: string;
  updated_at: string;
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || `item-${Date.now().toString(36)}`;

export const fieldKeyify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || `field_${Math.random().toString(36).slice(2, 6)}`;

// ---------- Bases ----------
export function useFlowtableBases() {
  return useQuery({
    queryKey: ['flowtable-bases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flowtable_bases' as never)
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FlowtableBase[];
    },
  });
}

export function useCreateBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; icon?: string; color?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Not authenticated');
      const slug = slugify(input.name);
      const { data, error } = await supabase
        .from('flowtable_bases' as never)
        .insert({
          name: input.name,
          slug,
          icon: input.icon ?? 'Table2',
          color: input.color ?? '#3b82f6',
          owner_id: auth.user.id,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as FlowtableBase;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flowtable-bases'] }),
  });
}

export function useUpdateBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<FlowtableBase> }) => {
      const { error } = await supabase
        .from('flowtable_bases' as never)
        .update(input.patch as never)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flowtable-bases'] }),
  });
}

export function useDeleteBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('flowtable_bases' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flowtable-bases'] }),
  });
}

// ---------- Tables ----------
export function useFlowtableTables(baseId: string | undefined) {
  return useQuery({
    queryKey: ['flowtable-tables', baseId],
    enabled: !!baseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flowtable_tables' as never)
        .select('*')
        .eq('base_id', baseId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FlowtableTable[];
    },
  });
}

export function useCreateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { base_id: string; name: string }) => {
      const slug = slugify(input.name);
      const { data, error } = await supabase
        .from('flowtable_tables' as never)
        .insert({
          base_id: input.base_id,
          name: input.name,
          slug,
          view_mode: 'grid',
        } as never)
        .select()
        .single();
      if (error) throw error;
      // seed 3 default fields
      const tableId = (data as { id: string }).id;
      await supabase.from('flowtable_fields' as never).insert([
        { table_id: tableId, name: 'Name', key: 'name', type: 'text', position: 0, width: 240 },
        { table_id: tableId, name: 'Notes', key: 'notes', type: 'longtext', position: 1, width: 320 },
        { table_id: tableId, name: 'Status', key: 'status', type: 'select', position: 2, width: 140, options: { choices: ['New', 'In Progress', 'Done'] } },
      ] as never);
      return data as unknown as FlowtableTable;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['flowtable-tables', vars.base_id] }),
  });
}

export function useUpdateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; base_id: string; patch: Partial<FlowtableTable> }) => {
      const { error } = await supabase
        .from('flowtable_tables' as never)
        .update(input.patch as never)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['flowtable-tables', v.base_id] }),
  });
}

export function useDeleteTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; base_id: string }) => {
      const { error } = await supabase.from('flowtable_tables' as never).delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['flowtable-tables', v.base_id] }),
  });
}

// ---------- Fields ----------
export function useFlowtableFields(tableId: string | undefined) {
  return useQuery({
    queryKey: ['flowtable-fields', tableId],
    enabled: !!tableId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flowtable_fields' as never)
        .select('*')
        .eq('table_id', tableId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FlowtableField[];
    },
  });
}

export function useCreateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { table_id: string; name: string; type: FlowtableFieldType; position?: number; options?: Record<string, unknown> }) => {
      const key = fieldKeyify(input.name);
      const { error } = await supabase.from('flowtable_fields' as never).insert({
        table_id: input.table_id,
        name: input.name,
        key,
        type: input.type,
        position: input.position ?? 999,
        width: input.type === 'longtext' ? 320 : 180,
        options: input.options ?? {},
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['flowtable-fields', v.table_id] }),
  });
}

export function useUpdateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; table_id: string; patch: Partial<FlowtableField> }) => {
      const { error } = await supabase
        .from('flowtable_fields' as never)
        .update(input.patch as never)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['flowtable-fields', v.table_id] }),
  });
}

export function useDeleteField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; table_id: string }) => {
      const { error } = await supabase.from('flowtable_fields' as never).delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['flowtable-fields', v.table_id] }),
  });
}

// ---------- Records ----------
export function useFlowtableRecords(tableId: string | undefined) {
  return useQuery({
    queryKey: ['flowtable-records', tableId],
    enabled: !!tableId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flowtable_records' as never)
        .select('*')
        .eq('table_id', tableId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FlowtableRecord[];
    },
  });
}

export function useCreateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { table_id: string; values?: Record<string, unknown>; position?: number }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('flowtable_records' as never)
        .insert({
          table_id: input.table_id,
          values: input.values ?? {},
          position: input.position ?? Date.now(),
          created_by: auth.user?.id ?? null,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as FlowtableRecord;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['flowtable-records', v.table_id] }),
  });
}

export function useUpdateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; table_id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('flowtable_records' as never)
        .update({ values: input.values } as never)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['flowtable-records', v.table_id] }),
  });
}

export function useDeleteRecords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; table_id: string }) => {
      if (!input.ids.length) return;
      const { error } = await supabase
        .from('flowtable_records' as never)
        .delete()
        .in('id', input.ids);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['flowtable-records', v.table_id] }),
  });
}

export function useBulkInsertRecords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { table_id: string; rows: Array<Record<string, unknown>> }) => {
      if (!input.rows.length) return 0;
      const { data: auth } = await supabase.auth.getUser();
      const payload = input.rows.map((values, i) => ({
        table_id: input.table_id,
        values,
        position: Date.now() + i,
        created_by: auth.user?.id ?? null,
      }));
      // chunk to avoid payload limits
      let inserted = 0;
      for (let i = 0; i < payload.length; i += 500) {
        const slice = payload.slice(i, i + 500);
        const { error } = await supabase.from('flowtable_records' as never).insert(slice as never);
        if (error) throw error;
        inserted += slice.length;
      }
      return inserted;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['flowtable-records', v.table_id] }),
  });
}

// Promote selected Flowtable records to CRM leads
export function usePushToCrmLeads() {
  return useMutation({
    mutationFn: async (input: { rows: FlowtableRecord[]; mapping: { name?: string; email?: string; phone?: string; company?: string; notes?: string } }) => {
      const m = input.mapping;
      const leads = input.rows
        .map((r) => {
          const v = r.values || {};
          const get = (k?: string) => (k ? (v[k] as string | undefined) : undefined);
          const name = (get(m.name) ?? '').toString().trim();
          const email = (get(m.email) ?? '').toString().trim() || null;
          const phone = (get(m.phone) ?? '').toString().trim() || null;
          const company = (get(m.company) ?? '').toString().trim() || null;
          const notes = (get(m.notes) ?? '').toString().trim() || null;
          if (!name && !email && !phone) return null;
          return {
            name: name || email || phone || 'Untitled',
            email,
            phone,
            company,
            notes,
            source: 'flowtable',
            status: 'lead',
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;
      if (!leads.length) return 0;
      const { error } = await supabase.from('leads' as never).insert(leads as never);
      if (error) throw error;
      return leads.length;
    },
  });
}
