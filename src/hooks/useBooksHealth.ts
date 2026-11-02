import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BooksHealth } from '@/components/admin/accounting/dashboard/BooksAttentionCard';

/** check_books — the same "what needs attention in the books" list an agent reads. */
export function useBooksHealth() {
  return useQuery({
    queryKey: ['dash', 'books-health'],
    queryFn: async (): Promise<BooksHealth> => {
      const { data, error } = await supabase.rpc('check_books' as never);
      if (error) throw error;
      return data as unknown as BooksHealth;
    },
    staleTime: 60_000,
  });
}
