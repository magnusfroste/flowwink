import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BusinessHourRow {
  id: string;
  weekday: number; // 0=Sun … 6=Sat
  is_open: boolean;
  open_time: string | null;   // "HH:MM:SS"
  close_time: string | null;
  created_at?: string;
}

export interface BusinessHoliday {
  id: string;
  holiday: string;      // YYYY-MM-DD
  name: string | null;
  created_at?: string;
}

export interface BusinessHoursData {
  success: true;
  hours: BusinessHourRow[];
  holidays: BusinessHoliday[];
}

export function useBusinessHours() {
  return useQuery({
    queryKey: ['business_hours'],
    queryFn: async (): Promise<BusinessHoursData> => {
      const { data, error } = await supabase.rpc('manage_business_hours' as any, {
        p_action: 'list',
      });
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        success: true,
        hours: (d.hours ?? []) as BusinessHourRow[],
        holidays: (d.holidays ?? []) as BusinessHoliday[],
      };
    },
  });
}

export function useSetBusinessHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      p_weekday: number;
      p_open_time: string;   // HH:MM
      p_close_time: string;  // HH:MM
      p_is_open?: boolean;
    }) => {
      const { data, error } = await supabase.rpc('manage_business_hours' as any, {
        p_action: 'set_hours',
        p_weekday: input.p_weekday,
        p_open_time: input.p_open_time,
        p_close_time: input.p_close_time,
        p_is_open: input.p_is_open ?? true,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business_hours'] });
      toast.success('Hours saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useClearBusinessDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekday: number) => {
      const { data, error } = await supabase.rpc('manage_business_hours' as any, {
        p_action: 'clear_day',
        p_weekday: weekday,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business_hours'] });
      toast.success('Day marked closed');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddBusinessHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { p_holiday: string; p_holiday_name?: string }) => {
      const { data, error } = await supabase.rpc('manage_business_hours' as any, {
        p_action: 'add_holiday',
        p_holiday: input.p_holiday,
        p_holiday_name: input.p_holiday_name || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business_hours'] });
      toast.success('Holiday added');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveBusinessHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (holiday: string) => {
      const { data, error } = await supabase.rpc('manage_business_hours' as any, {
        p_action: 'remove_holiday',
        p_holiday: holiday,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business_hours'] });
      toast.success('Holiday removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
