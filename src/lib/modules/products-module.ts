import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { triggerWebhook } from '@/lib/webhook-utils';
import { defineModule } from '@/lib/module-def';
import {
  ProductModuleInput,
  ProductModuleOutput,
  productModuleInputSchema,
  productModuleOutputSchema,
} from '@/types/module-contracts';

export const productsModule = defineModule<ProductModuleInput, ProductModuleOutput>({
  id: 'ecommerce',
  name: 'Products',
  version: '1.0.0',
  description: 'Create and manage e-commerce products',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: productModuleInputSchema,
  outputSchema: productModuleOutputSchema,

  skills: [
    'browse_products',
    'manage_product',
    'manage_inventory',
    'manage_orders',
    'lookup_order',
    'check_order_status',
    'place_order',
    'cart_recovery_check',
    'inventory_report',
  ],

  webhookEvents: [
    { event: 'order.created', description: 'An order was placed' },
    { event: 'order.paid', description: 'An order was paid' },
    { event: 'order.cancelled', description: 'An order was cancelled' },
    { event: 'order.refunded', description: 'An order was refunded' },
    { event: 'product.created', description: 'A product was created' },
    { event: 'product.updated', description: 'A product was updated' },
    { event: 'product.deleted', description: 'A product was deleted' },
  ],

  async publish(input: ProductModuleInput): Promise<ProductModuleOutput> {
    try {
      const validated = productModuleInputSchema.parse(input);

      const { data, error } = await supabase
        .from('products')
        .insert({
          name: validated.name,
          description: validated.description || null,
          price_cents: validated.price_cents,
          currency: validated.currency,
          image_url: validated.image_url || null,
          type: validated.type,
          is_active: validated.is_active,
          stripe_price_id: validated.stripe_price_id || null,
        })
        .select('id, name, price_cents')
        .single();

      if (error) {
        logger.error('[ProductsModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      try {
        await triggerWebhook({
          event: 'product.created',
          data: { type: 'product_created', id: data.id, name: data.name, price_cents: data.price_cents, source_module: validated.meta?.source_module },
        });
      } catch (webhookError) {
        logger.warn('[ProductsModule] Webhook failed:', webhookError);
      }

      return { success: true, id: data.id, name: data.name, price_cents: data.price_cents };
    } catch (error) {
      logger.error('[ProductsModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
