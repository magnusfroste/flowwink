import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * The outbound allowlist — an instance that is installed but not live yet.
 *
 * Every FlowWink instance passes through a period where someone rehearses
 * order-to-cash on real data. The guard holds customer mail during that period
 * so the rehearsal cannot reach a customer, and it is the only shape that works:
 * "remember to use a test address" is a convention, and conventions fail the
 * first time somebody — or an agent being realistic with a real CRM record —
 * forgets.
 *
 * The riskier failure is the OTHER direction: going live and forgetting to turn
 * it off, so invoices quietly never arrive. That is why this hook also reads the
 * held-back count. A guard nobody can see is a guard nobody switches off.
 */
export interface EmailAllowlist {
  enabled: boolean;
  domains: string[];
  addresses: string[];
  reason?: string;
  scope?: 'all' | 'customer_facing';
}

const SETTING_KEY = 'email_allowlist';

export function useEmailAllowlist() {
  return useQuery({
    queryKey: ['email-allowlist'],
    queryFn: async (): Promise<EmailAllowlist | null> => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      return (data?.value ?? null) as unknown as EmailAllowlist | null;
    },
  });
}

/** What the guard actually held back, so the panel shows consequence, not config. */
export function useWithheldEmails(limit = 10) {
  return useQuery({
    queryKey: ['email-allowlist-withheld', limit],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('outbound_communications')
        .select('id, recipient, subject, source, created_at', { count: 'exact' })
        .eq('status', 'blocked')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
}

export function useUpdateEmailAllowlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: EmailAllowlist) => {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: SETTING_KEY, value: next as never }, { onConflict: 'key' });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      qc.invalidateQueries({ queryKey: ['email-allowlist'] });
      toast.success(next.enabled
        ? 'Outbound guard updated'
        : 'This instance is live — outbound mail is no longer held back');
    },
    onError: (e: Error) => toast.error(`Could not save: ${e.message}`),
  });
}
