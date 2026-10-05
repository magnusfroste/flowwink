import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Per-staff booking calendars: weekly hours, time off and the services a
 * person performs. The admin panel and the agent share one RPC
 * (manage_staff_calendar); the table rule and booking_free_slots read the
 * same booking_staff_conflict, so what the panel sets is what the widget offers.
 */

export interface StaffHoursWindow {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface StaffCalendar {
  employee: { id: string; name: string; title: string | null };
  timezone: string;
  hours: StaffHoursWindow[];
  follows_opening_hours: boolean;
  time_off: Array<{ id: string; starts_at: string; ends_at: string; reason: string | null }>;
  services: Array<{ id: string; name: string }>;
  bookings: Array<{ id: string; start_time: string; end_time: string; status: string; service_id: string | null }>;
}

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

async function call<T>(args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as Rpc)('manage_staff_calendar', args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function useStaffCalendar(employeeId: string | null) {
  return useQuery({
    queryKey: ['staff-calendar', employeeId],
    enabled: !!employeeId,
    queryFn: () => call<StaffCalendar>({ p_action: 'get', p_employee_id: employeeId }),
  });
}

export function useStaffCalendarMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Record<string, unknown> & { p_action: string; p_employee_id?: string }) => call<Record<string, unknown>>(args),
    onSuccess: (r, args) => {
      qc.invalidateQueries({ queryKey: ['staff-calendar', args.p_employee_id] });
      qc.invalidateQueries({ queryKey: ['booking-free-slots'] });
      const conflicts = Number((r as { conflicting_bookings?: number }).conflicting_bookings ?? 0);
      if (conflicts > 0) {
        toast.warning(`Saved — ${conflicts} existing booking${conflicts === 1 ? '' : 's'} fall in this time off. Reassign or cancel them.`);
      } else {
        toast.success('Saved');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
