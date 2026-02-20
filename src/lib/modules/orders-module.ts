import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { triggerWebhook } from '@/lib/webhook-utils';
import {
  ModuleDefinition,
  OrderModuleInput,
  OrderModuleOutput,
  orderModuleInputSchema,
  orderModuleOutputSchema,
} from '@/types/module-contracts';

export const ordersModule: ModuleDefinition<OrderModuleInput, OrderModuleOutput> = {
  id: 'orders',
  name: 'Orders',
  version: '1.0.0',
  description: 'Create and manage orders',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: orderModuleInputSchema,
  outputSchema: orderModuleOutputSchema,

  async publish(input: OrderModuleInput): Promise<OrderModuleOutput> {
    try {
      const validated = orderModuleInputSchema.parse(input);

      const totalCents = validated.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_email: validated.customer_email,
          customer_name: validated.customer_name || null,
          total_cents: totalCents,
          currency: validated.currency,
          stripe_checkout_id: validated.stripe_checkout_id || null,
          stripe_payment_intent: validated.stripe_payment_intent || null,
          status: 'pending',
        })
        .select('id, status')
        .single();

      if (orderError) {
        logger.error('[OrdersModule] Insert error:', orderError);
        return { success: false, error: orderError.message };
      }

      // Insert order items
      const items = validated.items.map(item => ({
        order_id: order.id,
        product_id: item.product_id || null,
        product_name: item.product_name,
        quantity: item.quantity,
        price_cents: item.price_cents,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(items);
      if (itemsError) {
        logger.warn('[OrdersModule] Items insert error:', itemsError);
      }

      try {
        await triggerWebhook({
          event: 'order.created',
          data: { id: order.id, total_cents: totalCents, customer_email: validated.customer_email, source_module: validated.meta?.source_module },
        });
      } catch (webhookError) {
        logger.warn('[OrdersModule] Webhook failed:', webhookError);
      }

      return { success: true, id: order.id, total_cents: totalCents, status: order.status };
    } catch (error) {
      logger.error('[OrdersModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
