import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * What actually happened to each newsletter, from the delivery ledger
 * (newsletter_deliveries): how many the provider accepted, how many it
 * rejected, how many are still unknown, and WHICH provider carried them. With
 * Resend, SMTP and Composio/Gmail all possible, "sent" alone stopped saying
 * what happened — this is the admin's view of the same rows the sender writes.
 */
export interface NewsletterDeliverySummary {
  newsletter_id: string;
  sent: number;
  failed: number;
  pending: number;
  /** provider → accepted count, e.g. { composio: 42 }. "simulated" when no provider was active. */
  providers: Record<string, number>;
  last_error: string | null;
}

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export function useNewsletterDeliveries() {
  return useQuery({
    queryKey: ['newsletter-deliveries-summary'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as Rpc)('newsletter_delivery_summary');
      if (error) throw new Error(error.message);
      const rows = (Array.isArray(data) ? data : []) as NewsletterDeliverySummary[];
      return new Map(rows.map((r) => [r.newsletter_id, r]));
    },
    staleTime: 30_000,
  });
}

/** "via Composio (Gmail)" / "via Resend + SMTP" / "simulated — reached nobody". */
export function describeCarriers(summary: NewsletterDeliverySummary | undefined, label: (p: string) => string): string | null {
  if (!summary) return null;
  const names = Object.keys(summary.providers).filter((p) => summary.providers[p] > 0);
  if (names.length === 0) return null;
  if (names.length === 1 && names[0] === 'simulated') return 'simulated — reached nobody';
  return `via ${names.filter((p) => p !== 'simulated').map(label).join(' + ')}`;
}
