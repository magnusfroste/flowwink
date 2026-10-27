import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { businessToday } from '@/lib/platform-fallbacks';
import { addDaysYmd } from '@/lib/calendar-date';

/** One line of statutory_deadlines (20261027130000): the calendar joined with the register. */
export interface StatutoryDeadline {
  id: string;
  kind: string;
  label: string;
  period_from: string;
  period_to: string;
  due_date: string;
  days_left: number;
  status: 'filed' | 'overdue' | 'due_soon' | 'upcoming';
  basis: string;
  filed: boolean;
  filing_id?: string | null;
  filed_at?: string | null;
  reference?: string | null;
  amount_cents?: number | null;
}

interface Calendar {
  country: string | null;
  deadlines: StatutoryDeadline[];
  overdue: number;
  filed: number;
  note?: string | null;
}

export const FILINGS_QUERY_KEY = ['statutory-deadlines', 'register'] as const;

/** The calendar a year back and a year ahead, with the register's verdict on each line. */
export function useStatutoryCalendar() {
  const today = businessToday();
  return useQuery({
    queryKey: [...FILINGS_QUERY_KEY, today],
    queryFn: async (): Promise<Calendar> => {
      const { data, error } = await supabase.rpc('statutory_deadlines' as never, {
        p_from: addDaysYmd(today, -400), p_days: 765, p_today: today,
      } as never);
      if (error) throw error;
      return data as unknown as Calendar;
    },
    staleTime: 60_000,
  });
}

