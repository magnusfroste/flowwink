import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to journal_entries + journal_entry_lines and invalidates all
 * accounting-related queries when anything changes. Mount once per accounting
 * page (JournalTab, LedgerTab, ProfitLossTab, BalanceSheetTab, etc).
 */
export function useAccountingRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      qc.invalidateQueries({ queryKey: ['journal-entry'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
      qc.invalidateQueries({ queryKey: ['account-ledger'] });
      qc.invalidateQueries({ queryKey: ['analytic-lines'] });
      qc.invalidateQueries({ queryKey: ['analytic-balances'] });
    };

    const channel = supabase
      .channel('accounting-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entry_lines' }, invalidate)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
