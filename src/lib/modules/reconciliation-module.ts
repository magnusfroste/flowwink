import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import { supabase } from '@/integrations/supabase/client';

const inputSchema = z.object({
  action: z.enum(['sync_stripe', 'import_file', 'auto_match', 'list_unmatched']),
  fileName: z.string().optional(),
  content: z.string().optional(),
  format: z.enum(['csv', 'camt053', 'sie']).optional(),
});
const outputSchema = z.object({
  success: z.boolean(),
  result: z.any().optional(),
  error: z.string().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/**
 * Reconciliation — bank-to-books matching.
 *
 * Imports Stripe payouts, CSV/CAMT.053/SIE bank files, and matches
 * transactions against invoices, expenses and orders. Manual review
 * for partial / ambiguous matches via /admin/reconciliation.
 *
 * Live bank connectivity (GoCardless/Tink/Plaid) is planned for v0.5.
 */
export const reconciliationModule = defineModule<Input, Output>({
  id: 'reconciliation' as any,
  name: 'Reconciliation',
  version: '1.0.0',
  description:
    'Bank reconciliation: Stripe payout sync, CSV/CAMT.053/SIE import, auto-match against invoices/expenses/orders.',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: ['sync_stripe_payouts', 'import_bank_file', 'auto_match_transactions', 'list_unmatched_transactions'],

  async publish(input: Input): Promise<Output> {
    try {
      const v = inputSchema.parse(input);
      if (v.action === 'list_unmatched') {
        const { data, error } = await supabase
          .from('bank_transactions')
          .select('id, transaction_date, amount_cents, currency, counterparty, reference, status')
          .eq('status', 'unmatched')
          .order('transaction_date', { ascending: false })
          .limit(100);
        if (error) throw error;
        return { success: true, result: data };
      }
      const fnMap: Record<string, string> = {
        sync_stripe: 'reconciliation-sync-stripe',
        import_file: 'reconciliation-import-file',
        auto_match: 'reconciliation-auto-match',
      };
      const { data, error } = await supabase.functions.invoke(fnMap[v.action], {
        body: v.action === 'import_file' ? { fileName: v.fileName, content: v.content, format: v.format } : {},
      });
      if (error) throw error;
      return { success: true, result: data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown' };
    }
  },
});
