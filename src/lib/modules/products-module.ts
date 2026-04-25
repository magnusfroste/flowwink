import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { triggerWebhook } from '@/lib/webhook-utils';
import type { SkillSeed } from '@/lib/module-bootstrap';
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
  skillSeeds: PRODUCTS_SKILLS,

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
});// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const PRODUCTS_SKILLS: SkillSeed[] = [
  {
    name: 'browse_products',
    description: 'Browse the product catalog. Returns active products with prices, images, and stock info. Use when: a customer asks for available products; displaying items for sale; needing product details for an order. NOT for: managing products (manage_product); checking order status (check_order_status).',
    category: 'commerce',
    handler: 'module:products',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'browse_products',
        description: 'Browse the product catalog. Returns active products with prices, images, and stock info. Use when: a customer asks for available products; displaying items for sale; needing product details for an order. NOT for: managing products (manage_product); checking order status (check_order_status).',
        parameters: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
            },
            type: {
              type: 'string',
              enum: [
                'physical',
                'digital',
                'service',
              ],
            },
          },
        },
      },
    },
    instructions: `## browse_products
### What
Browse products in the catalog (visitor-facing, read-only).
### When to use
- Visitor asks about products or pricing in chat
- Need product info for recommendations
- NOT for admin management (use manage_product)
### Parameters
- **search**: Optional text search.
- **type**: Filter by type: physical, digital, service.
### Edge cases
- Only returns active products. Archived products excluded.
- Visitor-safe: shows public pricing and descriptions.`,
  },
  {
    name: 'manage_product',
    description: 'Manage products: create, update, delete, manage variants. Use when: adding a new item to the store; updating product details or pricing; handling product options (size, color). NOT for: managing inventory (manage_inventory); browsing products (browse_products).',
    category: 'commerce',
    handler: 'module:products',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_product',
        description: 'Manage products: create, update, delete, manage variants. Use when: adding a new item to the store; updating product details or pricing; handling product options (size, color). NOT for: managing inventory (manage_inventory); browsing products (browse_products).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'create',
                'update',
                'delete',
              ],
            },
            product_id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            price_cents: {
              type: 'number',
            },
            description: {
              type: 'string',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_product
### What
Manages products in the catalog: create, update, delete, manage variants.
### When to use
- Admin asks to add or edit products
- E-commerce setup workflows
### Parameters
- **action**: Required. list, get, create, update, delete.
- **name**: Product name (create/update).
- **price_cents**: Price in cents (create/update).
- **description**: Product description.
### Edge cases
- Price is in cents (e.g., 9900 = $99.00 or 99 SEK).
- Use manage_inventory for stock levels.`,
  },
  {
    name: 'manage_inventory',
    description: 'Manage product inventory: list stock, update quantities, set low-stock alerts. Use when: adjusting stock levels; setting up low-stock notifications; auditing inventory counts. NOT for: managing product details (manage_product); browsing products (browse_products).',
    category: 'commerce',
    handler: 'module:products',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_inventory',
        description: 'Manage product inventory: list stock, update quantities, set low-stock alerts. Use when: adjusting stock levels; setting up low-stock notifications; auditing inventory counts. NOT for: managing product details (manage_product); browsing products (browse_products).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list_stock',
                'update_stock',
                'low_stock',
              ],
            },
            product_id: {
              type: 'string',
            },
            quantity: {
              type: 'number',
            },
            threshold: {
              type: 'number',
              description: 'Low stock threshold (default 5)',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_inventory
### What
Manages product inventory: list stock levels, update quantities, check low-stock alerts.
### When to use
- Admin asks about stock levels
- Automated low-stock alerts
- After order fulfillment
### Parameters
- **action**: Required. list_stock, update_stock, low_stock.
- **product_id**: For update_stock.
- **quantity**: New stock quantity.
- **threshold**: Low stock threshold (default 5).
### Edge cases
- low_stock action returns all products below threshold.
- Stock can go negative if not checked before order.`,
  },
  {
    name: 'inventory_report',
    description: 'Generates product inventory status report. Use when: checking stock levels, reviewing inventory health. NOT for: updating inventory (use manage_inventory), managing products (use manage_product).',
    category: 'analytics',
    handler: 'module:products',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'inventory_report',
        parameters: {
          type: 'object',
          properties: {
            category_filter: {
              type: 'string',
            },
            low_stock_threshold: {
              type: 'number',
            },
          },
        },
        description: 'Generates product inventory status report. Use when: checking stock levels, reviewing inventory health. NOT for: updating inventory (use manage_inventory), managing products (use manage_product).',
      },
    },
    instructions: 'Get a product catalog snapshot. Identify items to promote or restock.',
  },
];


