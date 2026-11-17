import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The name the business trades under, for a page a customer opens without a
 * session (a quote, an agreement to sign). One reader, the database's
 * business_name() — the same precedence as the name every mail goes out under
 * (Branding's organisation name, Business Identity's company name, the site
 * name). Empty when nothing is configured: the page then names no seller
 * rather than a made-up one.
 */
export function useBusinessName(): string {
  const { data } = useQuery({
    queryKey: ['business-name'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('business_name' as never);
      if (error) return '';
      return String((data as unknown as string | null) ?? '');
    },
  });
  return data ?? '';
}
