import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

const purchasingInputSchema = z.object({
  action: z.enum(['create_po', 'list_pos', 'list_vendors', 'get_vendor']),
  vendor_id: z.string().uuid().optional(),
  po_id: z.string().uuid().optional(),
  lines: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    unit_cost_cents: z.number().int(),
  })).optional(),
  notes: z.string().optional(),
});

const purchasingOutputSchema = z.object({
  success: z.boolean(),
  po_id: z.string().optional(),
  po_number: z.string().optional(),
  message: z.string().optional(),
});

type PurchasingInput = z.infer<typeof purchasingInputSchema>;
type PurchasingOutput = z.infer<typeof purchasingOutputSchema>;

export const purchasingModule: ModuleDefinition<PurchasingInput, PurchasingOutput> = {
  id: 'purchasing',
  name: 'Purchasing',
  version: '1.0.0',
  description: 'Procure-to-pay lifecycle: purchase orders, vendor management, and goods receipt',
  capabilities: ['data:write', 'data:read'],
  inputSchema: purchasingInputSchema,
  outputSchema: purchasingOutputSchema,

  async publish(input: PurchasingInput): Promise<PurchasingOutput> {
    const validated = purchasingInputSchema.parse(input);

    if (validated.action === 'list_vendors') {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) {
        logger.error('[purchasing] list_vendors failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} active vendors` };
    }

    if (validated.action === 'list_pos') {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} purchase orders` };
    }

    return { success: false, message: 'Unsupported action' };
  },
};
