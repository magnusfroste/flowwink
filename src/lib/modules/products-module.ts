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

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
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
    name: 'manage_variant',
    description:
      'Manage product variants (attribute combinations like size/color with their own SKU, price delta and stock). Use when: a product comes in multiple options; generating the variant set from attributes; updating a variant SKU or price. NOT for: product-level details (manage_product); stock adjustments (manage_inventory).',
    category: 'commerce',
    handler: 'rpc:manage_product_variant',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_variant',
        description:
          'Manage product variants: list, get, create, update, deactivate, or generate the cartesian variant set from attributes (e.g. Color × Size).',
        parameters: {
          type: 'object',
          properties: {
            p_action: {
              type: 'string',
              enum: ['list', 'get', 'create', 'update', 'deactivate', 'generate'],
            },
            p_product_id: { type: 'string', description: 'Product UUID (list/create/generate)' },
            p_variant_id: { type: 'string', description: 'Variant UUID (get/update/deactivate)' },
            p_sku: { type: 'string' },
            p_barcode: { type: 'string' },
            p_price_delta_cents: { type: 'number', description: 'Price difference vs the product base price, in cents' },
            p_stock_quantity: { type: 'number' },
            p_is_active: { type: 'boolean' },
            p_attribute_value_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Attribute value UUIDs defining the variant (create)',
            },
            p_attributes: {
              type: 'array',
              description: 'For generate: [{"name":"Color","values":["Red","Blue"]}, ...]',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  values: { type: 'array', items: { type: 'string' } },
                },
                required: ['name', 'values'],
              },
            },
          },
          required: ['p_action'],
        },
      },
    },
    instructions: `## manage_variant
### What
Manages product variants — attribute combinations (size, color, material) with their own SKU, price delta and stock.
### When to use
- A product comes in multiple options
- Generating all combinations: action=generate with p_attributes [{"name":"Color","values":["Red","Blue"]},{"name":"Size","values":["S","M","L"]}] creates the cartesian set with auto SKUs
### Parameters
- **p_action**: Required. list, get, create, update, deactivate, generate.
- **p_price_delta_cents**: difference vs product base price (0 = same price).
### Edge cases
- generate is idempotent: existing identical value-combinations are skipped.
- Variant price = product price_cents + price_delta_cents.
- Deactivate instead of delete to preserve order history.`,
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
  {
    name: 'lookup_order',
    description: 'Look up order status by order ID or customer email. Use when: a customer inquires about their order; verifying order progress; retrieving order details for support. NOT for: managing orders (manage_orders); browsing products (browse_products).',
    category: 'crm',
    handler: 'module:orders',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'lookup_order',
        description: 'Look up order status by order ID or customer email. Use when: a customer inquires about their order; verifying order progress; retrieving order details for support. NOT for: managing orders (manage_orders); browsing products (browse_products).',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'Order ID',
            },
            email: {
              type: 'string',
              description: 'Customer email',
            },
          },
        },
      },
    },
    instructions: `## lookup_order
### What
Looks up order status by order ID or customer email.
### When to use
- Visitor asks about their order status in chat
- Admin needs to check a specific order
- CRM workflow needs order context
### Parameters
- **order_id**: Direct lookup by UUID.
- **email**: Lookup all orders for a customer email.
- At least one parameter should be provided.
### Edge cases
- Returns multiple orders when searching by email — present the most recent first.
- Sensitive data: only share order details with the order owner in visitor chat.`,
  },
  {
    name: 'manage_orders',
    description: 'Manage orders: list, get details, update status, view stats. Use when: reviewing customer orders; changing fulfillment status; analyzing sales trends. NOT for: checking status by ID (check_order_status); browsing products (browse_products).',
    category: 'commerce',
    handler: 'module:orders',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_orders',
        description: 'Manage orders: list, get details, update status, view stats. Use when: reviewing customer orders; changing fulfillment status; analyzing sales trends. NOT for: checking status by ID (check_order_status); browsing products (browse_products).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'update_status',
                'stats',
              ],
            },
            order_id: {
              type: 'string',
            },
            status: {
              type: 'string',
            },
            period: {
              type: 'string',
              enum: [
                'today',
                'week',
                'month',
                'quarter',
              ],
            },
            limit: {
              type: 'number',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_orders
### What
Manages e-commerce orders: list, get details, update status, view stats.
### When to use
- Admin asks about orders or order status
- Order fulfillment workflow
- Business reporting (order stats)
### Parameters
- **action**: Required. list, get, update_status, stats.
- **order_id**: For get/update_status.
- **status**: New status for update_status.
- **period**: For stats: today, week, month, quarter.
### Edge cases
- Status transitions: pending → processing → shipped → delivered.
- Stats action returns aggregated revenue and order counts.`,
  },
  {
    name: 'place_order',
    description: 'Place an order as a customer — resolves products server-side, creates the order + line items. Accepts product_id or product_name per item. Use when: external agent creates an order programmatically, tests the purchase flow. NOT for: managing existing orders (use manage_orders), browsing products (use manage_products), Stripe-hosted storefront checkout (that is the website flow, not this skill).',
    category: 'commerce',
    handler: 'module:orders',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'place_order',
        description: 'Place an order via the checkout API with sandbox mode support. Use when: external agent tests purchase flow, programmatic order creation, automated testing of checkout pipeline. NOT for: managing existing orders (use manage_orders), browsing products (use manage_products), payment configuration (use site_settings).',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: {
                    type: 'string',
                  },
                  productName: {
                    type: 'string',
                  },
                  priceCents: {
                    type: 'number',
                  },
                  quantity: {
                    type: 'number',
                  },
                },
                required: [
                  'productId',
                  'productName',
                  'priceCents',
                  'quantity',
                ],
              },
              description: 'Cart items',
            },
            customerName: {
              type: 'string',
              description: 'Customer name',
            },
            customerEmail: {
              type: 'string',
              description: 'Customer email',
            },
            currency: {
              type: 'string',
              description: 'Currency code (default SEK)',
            },
          },
          required: [
            'items',
            'customerName',
            'customerEmail',
          ],
        },
      },
    },
    instructions: `## place_order
### What
Places an order through the create-checkout edge function. In sandbox mode, completes immediately without payment.
### When to use
- External agent (OpenClaw) tests the full purchase flow
- Programmatic order creation for testing or automation
### Parameters
- **items**: Array of {productId, productName, priceCents, quantity}.
- **customerName**: Buyer name.
- **customerEmail**: Buyer email.
- **currency**: ISO currency code (default SEK).
### Edge cases
- Sandbox mode auto-detected from module config — no Stripe needed.
- Always use notify trust level so admin sees orders.`,
  },
  {
    name: 'check_order_status',
    description: 'Check the status of an existing order by ID. Use when: a user inquires about their purchase; verifying order progress; providing delivery updates. NOT for: managing orders (manage_orders); looking up orders by email (lookup_order).',
    category: 'commerce',
    handler: 'module:orders',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'check_order_status',
        description: 'Check the status of an existing order by ID. Use when: a user inquires about their purchase; verifying order progress; providing delivery updates. NOT for: managing orders (manage_orders); looking up orders by email (lookup_order).',
        parameters: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'Order UUID',
            },
            email: {
              type: 'string',
              description: 'Customer email (for guest verification)',
            },
          },
          required: [
            'order_id',
          ],
        },
      },
    },
    instructions: `## check_order_status
### What
Checks the current status of an order via the order-status edge function.
### When to use
- External agent wants to verify an order went through
- Visitor asks about their order in chat
- Automated follow-up workflows checking fulfillment
### Parameters
- **order_id**: The UUID of the order.
- **email**: Optional email for guest verification.`,
  },
  {
    name: 'cart_recovery_check',
    description: 'Lists orders with abandoned or incomplete status. Use when: reviewing abandoned carts, recovery campaigns, checking incomplete orders. NOT for: checking specific order status (use check_order).',
    category: 'crm',
    handler: 'module:orders',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'cart_recovery_check',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
            },
            days_back: {
              type: 'number',
            },
          },
        },
        description: 'Lists orders with abandoned or incomplete status. Use when: reviewing abandoned carts, recovery campaigns, checking incomplete orders. NOT for: checking specific order status (use check_order).',
      },
    },
    instructions: 'Identify orders needing follow-up. After listing, create a recovery campaign.',
  },
  {
    name: 'send_invoice_for_order',
    description: 'Convert an existing order into a sent invoice and email the customer a link. Closes the quote-to-cash loop. Use when: order is fulfilled or ready to bill, "fakturera order X", "send invoice for order". NOT for: creating manual invoices (use manage_invoice), draft invoices only, or invoicing time entries (use invoice_from_timesheets). Idempotent — reuses existing invoice for the same order.',
    category: 'commerce',
    handler: 'module:orders',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_invoice_for_order',
        description: 'Generate and send an invoice for an existing order. Reuses any existing invoice for the same order.',
        parameters: {
          type: 'object',
          required: [
            'order_id',
          ],
          properties: {
            order_id: {
              type: 'string',
              description: 'Order UUID to invoice',
            },
            due_days: {
              type: 'number',
              description: 'Days until due date (default 14)',
            },
            tax_rate: {
              type: 'number',
              description: 'Tax rate as decimal e.g. 0.25 for 25% (default 0.25)',
            },
            payment_terms: {
              type: 'string',
              description: 'Payment terms text (default "Net <due_days>")',
            },
            notes: {
              type: 'string',
              description: 'Extra notes prepended to the invoice',
            },
            dry_run: {
              type: 'boolean',
              description: 'If true, returns preview totals without creating the invoice or sending email',
            },
          },
        },
      },
    },
    instructions: 'Builds an invoice from order_items (qty × price_cents), applies tax_rate (default 0.25), marks status=sent, and emails the customer a link to /functions/v1/generate-invoice-pdf. Idempotent via notes "order:<id>". Use dry_run=true to preview totals before sending. Logs invoice_sent to audit_logs.',
  },
  {
    name: 'fulfill_order_line',
    description: 'Record fulfillment of an order line (full or partial). Use when: shipping part of an order; marking a line picked/shipped. The order flips to shipped only once every line is fully fulfilled. NOT for: refunds/returns (use create_return); whole-order status edits (use manage_orders).',
    category: 'commerce',
    handler: 'rpc:fulfill_order_line',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'fulfill_order_line',
        description: 'Add fulfilled quantity to one order line (clamped to the ordered quantity). Supports partial shipments; marks the order shipped when all lines are complete.',
        parameters: {
          type: 'object',
          required: ['p_line_id'],
          properties: {
            p_line_id: { type: 'string', format: 'uuid', description: 'order_items.id' },
            p_qty: { type: 'number', description: 'Quantity to fulfill now; omit to fulfill the remaining quantity' },
          },
        },
      },
    },
    instructions: 'Accumulates order_items.qty_fulfilled (clamped to quantity). Omitting p_qty fulfills the line\'s remaining quantity. When no line has remaining quantity, the order is set to fulfillment_status=shipped with shipped_at. Admin/service-role only.',
  },
];

export const productsModule = defineModule<ProductModuleInput, ProductModuleOutput>({
  id: 'ecommerce',
  name: 'Products',
  version: '1.0.0',
  processes: ['order-to-delivery', 'content-to-conversion'],
  maturity: 'L3',
  description: 'Create and manage e-commerce products',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  tier: 'extended',
  inputSchema: productModuleInputSchema,
  outputSchema: productModuleOutputSchema,

  skills: [
    'browse_products',
    'manage_product',
    'manage_variant',
    'manage_inventory',
    'manage_orders',
    'lookup_order',
    'check_order_status',
    'place_order',
    'cart_recovery_check',
    'inventory_report',
    'fulfill_order_line',
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
});
