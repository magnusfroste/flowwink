import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

const accountingInputSchema = z.object({
  action: z.enum(['create_entry', 'list_entries', 'balance_sheet', 'profit_loss']),
  entry_date: z.string().optional(),
  description: z.string().optional(),
  reference_number: z.string().optional(),
  lines: z.array(z.object({
    account_code: z.string(),
    account_name: z.string(),
    debit_cents: z.number().int(),
    credit_cents: z.number().int(),
    description: z.string().optional(),
  })).optional(),
});

const accountingOutputSchema = z.object({
  success: z.boolean(),
  entry_id: z.string().optional(),
  message: z.string().optional(),
});

type AccountingInput = z.infer<typeof accountingInputSchema>;
type AccountingOutput = z.infer<typeof accountingOutputSchema>;

export const accountingModule: ModuleDefinition<AccountingInput, AccountingOutput> = {
  id: 'accounting',
  name: 'Accounting',
  version: '1.0.0',
  description: 'Double-entry bookkeeping with BAS 2024 chart of accounts, journal entries, general ledger, balance sheet and P&L reports',
  capabilities: ['data:write', 'data:read'],
  inputSchema: accountingInputSchema,
  outputSchema: accountingOutputSchema,

  async publish(input: AccountingInput): Promise<AccountingOutput> {
    const validated = accountingInputSchema.parse(input);

    if (validated.action === 'create_entry') {
      if (!validated.lines || validated.lines.length === 0) {
        return { success: false, message: 'lines are required' };
      }

      const totalDebit = validated.lines.reduce((s, l) => s + l.debit_cents, 0);
      const totalCredit = validated.lines.reduce((s, l) => s + l.credit_cents, 0);
      if (totalDebit !== totalCredit) {
        return { success: false, message: `Unbalanced: debit ${totalDebit} ≠ credit ${totalCredit}` };
      }

      const { data, error } = await supabase
        .from('journal_entries')
        .insert({
          entry_date: validated.entry_date || new Date().toISOString().split('T')[0],
          description: validated.description || '',
          reference_number: validated.reference_number || null,
          status: 'posted',
          source: 'flowpilot',
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[accounting] create entry failed', error);
        return { success: false, message: error.message };
      }

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(
          validated.lines.map((l) => ({
            journal_entry_id: data.id,
            ...l,
          }))
        );

      if (linesError) {
        logger.error('[accounting] create lines failed', linesError);
        return { success: false, message: linesError.message };
      }

      return { success: true, entry_id: data.id, message: 'Journal entry created' };
    }

    return { success: false, message: 'Unsupported action' };
  },
};
