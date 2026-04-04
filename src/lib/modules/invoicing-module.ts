import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

const invoicingInputSchema = z.object({
  action: z.enum(['create', 'update', 'list']),
  customer_email: z.string().email().optional(),
  customer_name: z.string().optional(),
  deal_id: z.string().uuid().optional(),
  line_items: z.array(z.object({
    description: z.string(),
    qty: z.number().int().positive(),
    unit_price_cents: z.number().int(),
  })).optional(),
  invoice_id: z.string().uuid().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'cancelled']).optional(),
});

const invoicingOutputSchema = z.object({
  success: z.boolean(),
  invoice_id: z.string().optional(),
  message: z.string().optional(),
});

type InvoicingInput = z.infer<typeof invoicingInputSchema>;
type InvoicingOutput = z.infer<typeof invoicingOutputSchema>;

export const invoicingModule: ModuleDefinition<InvoicingInput, InvoicingOutput> = {
  id: 'invoicing',
  name: 'Invoicing',
  version: '1.0.0',
  description: 'Create and manage invoices with line items, tax computation, and status tracking',
  capabilities: ['data:write', 'data:read'],
  inputSchema: invoicingInputSchema,
  outputSchema: invoicingOutputSchema,

  async publish(input: InvoicingInput): Promise<InvoicingOutput> {
    const validated = invoicingInputSchema.parse(input);

    if (validated.action === 'create') {
      if (!validated.customer_email) {
        return { success: false, message: 'customer_email is required' };
      }

      const lineItems = validated.line_items || [];
      const subtotal = lineItems.reduce((s, i) => s + i.qty * i.unit_price_cents, 0);
      const taxRate = 0.25;
      const taxCents = Math.round(subtotal * taxRate);

      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });
      const num = `INV-${String((count || 0) + 1).padStart(4, '0')}`;

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: num,
          customer_email: validated.customer_email,
          customer_name: validated.customer_name || '',
          deal_id: validated.deal_id || null,
          line_items: lineItems as any,
          subtotal_cents: subtotal,
          tax_rate: taxRate,
          tax_cents: taxCents,
          total_cents: subtotal + taxCents,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[invoicing] create failed', error);
        return { success: false, message: error.message };
      }

      return { success: true, invoice_id: data.id, message: `Invoice ${num} created` };
    }

    return { success: false, message: 'Unsupported action' };
  },
};
