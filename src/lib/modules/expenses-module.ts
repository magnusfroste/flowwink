import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

const expensesInputSchema = z.object({
  action: z.enum(['create', 'list', 'submit_report', 'approve_report', 'analyze_receipt']),
  user_id: z.string().optional(),
  expense_date: z.string().optional(),
  description: z.string().optional(),
  amount_cents: z.number().int().optional(),
  vat_cents: z.number().int().optional(),
  currency: z.string().optional(),
  category: z.enum(['travel', 'meals', 'office', 'software', 'representation', 'other']).optional(),
  vendor: z.string().optional(),
  account_code: z.string().optional(),
  is_representation: z.boolean().optional(),
  attendees: z.array(z.object({
    name: z.string(),
    company: z.string(),
  })).optional(),
  receipt_url: z.string().optional(),
  period: z.string().optional(),
  report_id: z.string().optional(),
});

const expensesOutputSchema = z.object({
  success: z.boolean(),
  expense_id: z.string().optional(),
  report_id: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type ExpensesInput = z.infer<typeof expensesInputSchema>;
type ExpensesOutput = z.infer<typeof expensesOutputSchema>;

export const expensesModule: ModuleDefinition<ExpensesInput, ExpensesOutput> = {
  id: 'expenses',
  name: 'Expense Reporting',
  version: '1.0.0',
  description: 'Employee expense reporting with receipt scanning, monthly report submission, approval workflow, and autonomous journal entry booking via FlowPilot',
  capabilities: ['data:write', 'data:read'],
  inputSchema: expensesInputSchema,
  outputSchema: expensesOutputSchema,

  async publish(input: ExpensesInput): Promise<ExpensesOutput> {
    const validated = expensesInputSchema.parse(input);

    if (validated.action === 'create') {
      if (validated.is_representation && (!validated.attendees || validated.attendees.length === 0)) {
        return { success: false, error: 'Representation expenses require attendees (name + company)' };
      }

      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_id: validated.user_id || null,
          expense_date: validated.expense_date || new Date().toISOString().slice(0, 10),
          description: validated.description || '',
          amount_cents: validated.amount_cents || 0,
          vat_cents: validated.vat_cents || 0,
          currency: validated.currency || 'SEK',
          category: validated.category || 'other',
          vendor: validated.vendor || null,
          account_code: validated.account_code || null,
          is_representation: validated.is_representation || false,
          attendees: validated.attendees || null,
          receipt_url: validated.receipt_url || null,
          status: 'draft',
        })
        .select('id')
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, expense_id: data.id, message: 'Expense created' };
    }

    if (validated.action === 'list') {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
        .limit(100);

      if (error) return { success: false, error: error.message };
      return { success: true, message: `Found ${data.length} expenses` };
    }

    return { success: false, error: `Unknown action: ${validated.action}` };
  },
};
