import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type ServiceOrderStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'invoiced' | 'cancelled';

export interface ServiceOrder {
  id: string;
  order_number: string | null;
  title: string;
  description: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  service_address: string | null;
  status: ServiceOrderStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  scheduled_start: string | null;
  scheduled_end: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  total_amount: number;
  currency: string;
  notes: string | null;
  created_at: string;
}

export interface ServiceOrderLine {
  id: string;
  service_order_id: string;
  kind: 'labor' | 'material' | 'expense' | 'other';
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  position: number;
}

export interface ServiceVisit {
  id: string;
  service_order_id: string;
  technician_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  status: 'scheduled' | 'in_progress' | 'done' | 'no_show' | 'cancelled';
  technician_notes: string | null;
  signature_url: string | null;
  signed_at: string | null;
}

export const useServiceOrders = (statusFilter?: ServiceOrderStatus) => {
  return useQuery({
    queryKey: ['service-orders', statusFilter ?? 'all'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from('service_orders').select('*').order('created_at', { ascending: false }).limit(200);
      if (statusFilter) q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ServiceOrder[];
    },
  });
};

export const useServiceOrder = (id: string | undefined) => {
  return useQuery({
    queryKey: ['service-order', id],
    enabled: !!id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('service_orders').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as ServiceOrder;
    },
  });
};

export const useServiceOrderLines = (id: string | undefined) => {
  return useQuery({
    queryKey: ['service-order-lines', id],
    enabled: !!id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('service_order_lines')
        .select('*')
        .eq('service_order_id', id!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ServiceOrderLine[];
    },
  });
};

export const useServiceVisits = (id: string | undefined) => {
  return useQuery({
    queryKey: ['service-visits', id],
    enabled: !!id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('service_visits')
        .select('*')
        .eq('service_order_id', id!)
        .order('scheduled_start', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ServiceVisit[];
    },
  });
};

export const useCreateServiceOrder = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { title: string; customer_name: string; customer_email?: string; service_address?: string; priority?: string; description?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('service_orders').insert(input).select().single();
      if (error) throw error;
      return data as ServiceOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-orders'] });
      toast({ title: 'Service order created' });
    },
    onError: (e) => toast({ title: 'Failed', description: String(e), variant: 'destructive' }),
  });
};

export const useUpdateServiceOrderStatus = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ServiceOrderStatus }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('service_orders').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['service-orders'] });
      qc.invalidateQueries({ queryKey: ['service-order', vars.id] });
      toast({ title: 'Status updated' });
    },
  });
};

export const useCompleteServiceOrder = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('complete_service_order', { _order_id: id, _completion_notes: notes ?? null });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['service-orders'] });
      qc.invalidateQueries({ queryKey: ['service-order', vars.id] });
      toast({ title: 'Order completed' });
    },
  });
};

export const useAddServiceOrderLine = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (line: { service_order_id: string; kind?: string; description: string; quantity: number; unit_price: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('service_order_lines').insert(line).select().single();
      if (error) throw error;
      return data as ServiceOrderLine;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['service-order-lines', vars.service_order_id] });
      qc.invalidateQueries({ queryKey: ['service-order', vars.service_order_id] });
      qc.invalidateQueries({ queryKey: ['service-orders'] });
      toast({ title: 'Line added' });
    },
  });
};

export const useScheduleServiceOrder = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, scheduled_start, scheduled_end, technician_id }: { id: string; scheduled_start: string; scheduled_end: string; technician_id?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e1 } = await (supabase as any)
        .from('service_orders')
        .update({ status: 'scheduled', scheduled_start, scheduled_end, assigned_to: technician_id })
        .eq('id', id);
      if (e1) throw e1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e2 } = await (supabase as any)
        .from('service_visits')
        .insert({ service_order_id: id, technician_id, scheduled_start, scheduled_end })
        .select()
        .single();
      if (e2) throw e2;
      return data as ServiceVisit;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['service-orders'] });
      qc.invalidateQueries({ queryKey: ['service-order', vars.id] });
      qc.invalidateQueries({ queryKey: ['service-visits', vars.id] });
      toast({ title: 'Visit scheduled' });
    },
  });
};
