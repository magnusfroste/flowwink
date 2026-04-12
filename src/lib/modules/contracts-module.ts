import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

const contractsInputSchema = z.object({
  action: z.enum(['create', 'update', 'list', 'get']),
  id: z.string().uuid().optional(),
  title: z.string().optional(),
  counterparty_name: z.string().optional(),
  counterparty_email: z.string().email().optional(),
  contract_type: z.enum(['client', 'vendor', 'partnership', 'nda', 'employment', 'other']).optional(),
  status: z.enum(['draft', 'active', 'expired', 'terminated']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  value_cents: z.number().int().optional(),
  notes: z.string().optional(),
});

const contractsOutputSchema = z.object({
  success: z.boolean(),
  contract_id: z.string().optional(),
  message: z.string().optional(),
});

type ContractsInput = z.infer<typeof contractsInputSchema>;
type ContractsOutput = z.infer<typeof contractsOutputSchema>;

export const contractsModule: ModuleDefinition<ContractsInput, ContractsOutput> = {
  id: 'contracts',
  name: 'Contracts',
  version: '1.0.0',
  description: 'Contract lifecycle management with renewal tracking and document storage',
  capabilities: ['data:write', 'data:read'],
  inputSchema: contractsInputSchema,
  outputSchema: contractsOutputSchema,

  async publish(input: ContractsInput): Promise<ContractsOutput> {
    const validated = contractsInputSchema.parse(input);

    if (validated.action === 'create') {
      if (!validated.title || !validated.counterparty_name) {
        return { success: false, message: 'title and counterparty_name are required' };
      }

      const { data, error } = await supabase
        .from('contracts')
        .insert({
          counterparty_name: validated.counterparty_name!,
          counterparty_email: validated.counterparty_email,
          contract_type: validated.contract_type || 'other',
          status: validated.status || 'draft',
          start_date: validated.start_date,
          end_date: validated.end_date,
          value_cents: validated.value_cents,
          notes: validated.notes ? `${validated.title ? validated.title + ' — ' : ''}${validated.notes}` : validated.title,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[contracts] create failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, contract_id: data.id, message: 'Contract created' };
    }

    if (validated.action === 'list') {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} contracts` };
    }

    return { success: false, message: 'Unsupported action' };
  },
};
