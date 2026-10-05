import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Newsletter mailing lists (newsletter_subscribers.lists,
 * newsletters.audience_lists). The table trigger normalises names
 * (lower-case, trimmed, deduped); normalizeListName mirrors it in the UI.
 */

export interface NewsletterListSummary {
  list: string;
  subscribers: number;
  confirmed: number;
}

export function normalizeListName(name: string): string {
  return name.trim().toLowerCase();
}

export function useNewsletterLists() {
  return useQuery({
    queryKey: ['newsletter-lists'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>)('newsletter_list_summary');
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []) as NewsletterListSummary[];
    },
    staleTime: 30_000,
  });
}

/** Who a newsletter reaches: every confirmed subscriber, or the confirmed ones on any of the lists. */
export function audienceReach(audience: string[], lists: NewsletterListSummary[] | undefined, totalConfirmed: number): string {
  if (audience.length === 0) return `Everyone confirmed (${totalConfirmed})`;
  const known = (lists ?? []).filter((l) => audience.includes(l.list));
  const upper = known.reduce((sum, l) => sum + l.confirmed, 0);
  return `${audience.join(', ')} — up to ${upper} confirmed`;
}
