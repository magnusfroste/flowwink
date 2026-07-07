import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PosTable {
  id: string;
  name: string;
  area: string | null;
  seats: number | null;
  status: 'free' | 'occupied' | 'reserved' | string;
  current_sale_id: string | null;
  register_id: string | null;
  active: boolean;
}

function extractTables(data: any): PosTable[] {
  if (Array.isArray(data)) return data;
  return data?.tables ?? data?.pos_tables ?? [];
}

export function usePosTables() {
  return useQuery({
    queryKey: ['pos-tables'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_pos_table' as any, { p_action: 'list' });
      if (error) throw error;
      return extractTables(data);
    },
  });
}

export function usePosTableMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      action: 'create' | 'update' | 'seat' | 'release' | 'delete';
      table_id?: string;
      name?: string;
      area?: string;
      seats?: number;
      register_id?: string;
      sale_id?: string;
      status?: string;
    }) => {
      const { data, error } = await supabase.rpc('manage_pos_table' as any, {
        p_action: params.action,
        p_table_id: params.table_id ?? null,
        p_name: params.name ?? null,
        p_area: params.area ?? null,
        p_seats: params.seats ?? null,
        p_register_id: params.register_id ?? null,
        p_sale_id: params.sale_id ?? null,
        p_status: params.status ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
