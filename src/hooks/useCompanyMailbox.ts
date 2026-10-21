import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CompanyMailbox } from '../../supabase/functions/_shared/email/sender-identity';

/**
 * The shared company mailbox — the address customer replies come back to.
 * Per-user mailboxes are deliberately out of scope: a reply into a personal
 * inbox is invisible to the CRM and to FlowPilot.
 */
export function useCompanyMailbox() {
  return useQuery({
    queryKey: ['company-mailbox'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inbound_email_accounts')
        .select('email_address, enabled, provider')
        .eq('is_shared', true)
        .eq('enabled', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Every shared, enabled company mailbox with its alias domains — the registry
 * `resolveSenderIdentity` reads. The profile page uses it to tell a seller what
 * their From line will actually be.
 */
export function useCompanyMailboxes() {
  return useQuery({
    queryKey: ['company-mailboxes'],
    queryFn: async (): Promise<CompanyMailbox[]> => {
      const { data, error } = await supabase
        .from('inbound_email_accounts')
        .select('email_address, alias_domains')
        .eq('is_shared', true)
        .eq('enabled', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}
