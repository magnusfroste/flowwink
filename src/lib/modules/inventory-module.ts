import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const inventoryInputSchema = z.object({
  action: z.enum(['check_stock', 'list_low_stock', 'get_movements']),
  product_id: z.string().uuid().optional(),
  threshold: z.number().int().optional(),
});

const inventoryOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

type InventoryInput = z.infer<typeof inventoryInputSchema>;
type InventoryOutput = z.infer<typeof inventoryOutputSchema>;

export const inventoryModule = defineModule<InventoryInput, InventoryOutput>({
  id: 'inventory',
  name: 'Inventory',
  version: '1.0.0',
  description: 'Stock level monitoring, low-stock alerts, and movement history for products',
  capabilities: ['data:read'],
  inputSchema: inventoryInputSchema,
  outputSchema: inventoryOutputSchema,

  skills: [
    'check_stock',
    'adjust_stock',
    'low_stock_report',
  ],

  webhookEvents: [
    { event: 'stock.adjusted', description: 'Stock was adjusted' },
    { event: 'stock.low', description: 'Stock fell below threshold' },
  ],

  async publish(input: InventoryInput): Promise<InventoryOutput> {
    const validated = inventoryInputSchema.parse(input);

    if (validated.action === 'list_low_stock') {
      const threshold = validated.threshold ?? 5;
      const { data, error } = await supabase
        .from('product_stock')
        .select('product_id, quantity_on_hand, reorder_point')
        .lt('quantity_on_hand', threshold)
        .limit(50);

      if (error) {
        logger.error('[inventory] list_low_stock failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} products below threshold ${threshold}` };
    }

    if (validated.action === 'get_movements') {
      let query = supabase
        .from('stock_moves')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (validated.product_id) {
        query = query.eq('product_id', validated.product_id);
      }

      const { data, error } = await query;
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} stock movements` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
