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
            weight_grams: {
              type: 'number',
              description: 'Product weight in grams. Omit/null = non-shippable (service/digital). A weighted product participates in the checkout shipping calculation.',
            },
            track_inventory: {
              type: 'boolean',
              description: 'Whether stock is counted for this product. Set true at create time for physical goods — a product created without it is untracked and never appears in stock lists, low-stock alerts or the reorder loop.',
            },
            stock_quantity: {
              type: 'number',
              description: 'Opening on-hand quantity. Only meaningful with track_inventory: true.',
            },
            low_stock_threshold: {
              type: 'number',
              description: 'Stock level at or below which the product counts as low (default 5). Also the reorder point when no product_stock override exists.',
            },
            allow_backorder: {
              type: 'boolean',
              description: 'Accept orders beyond the on-hand quantity (default false). With false, an order line larger than the available stock is refused.',
            },
            cost_cents: {
              type: 'number',
              description: 'Purchase/unit cost in cents. Used for inventory valuation when a receipt carries no PO price.',
            },
            barcode: { type: 'string' },
            category_id: {
              type: 'string',
              description: 'product_categories UUID. Drives the costing method used for valuation.',
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
- **weight_grams**: Weight in grams (create/update). null/omitted = non-shippable service or digital product; set it for physical goods so checkout can offer weight-based delivery options.
- **track_inventory / stock_quantity / low_stock_threshold / allow_backorder / cost_cents / barcode / category_id**: accepted on create as well as update — a physical product should be born stocked rather than created and patched.
### Edge cases
- Price is in cents (e.g., 9900 = $99.00 or 99 SEK).
- track_inventory defaults to false. A product created without it is untracked: it never shows in list_stock, never triggers a low-stock alert and is never a reorder candidate.
- allow_backorder=false (the default) makes order lines above the on-hand quantity fail with the available number in the error. Set it true to accept backorders — stock_quantity then goes negative, and the negative IS the backorder depth.
- SKU lives on variants, not products — use manage_variant (p_sku) for it.
- weight_grams drives shipping at checkout: carts with any weighted product require a delivery address and get carrier options from the shipping_rates weight bands.
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
    name: 'manage_uom',
    description: 'Manage units of measure: list/get/create/update UoMs and their categories (Weight, Length, Unit, …). Each UoM converts to its category reference unit via a factor (kg=1, g=0.001). Use when: setting up sales units; checking which units exist before converting or assigning products.sales_uom_id. NOT for: converting a quantity between units (convert_uom); product details (manage_product).',
    category: 'commerce',
    handler: 'db:uoms',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_uom',
        description: 'CRUD for units of measure (uoms table). list returns all units with their category_id and factor-to-reference.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update'] },
            id: { type: 'string', description: 'UoM UUID (get/update)' },
            name: { type: 'string', description: 'Unit name, e.g. "kg", "hour", "box of 12"' },
            category_id: { type: 'string', description: 'uom_categories UUID the unit belongs to (create)' },
            factor: { type: 'number', description: 'Multiplier to the category reference unit (reference itself = 1; g in Weight = 0.001)' },
            is_reference: { type: 'boolean', description: 'True for the category reference unit (exactly one per category)' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['name', 'category_id'],
          },
        },
      },
    },
    instructions: `## manage_uom
### What
CRUD over the uoms table (units of measure). Categories live in uom_categories; every unit stores a factor to its category's reference unit.
### When to use
- action=list first to discover unit UUIDs before calling convert_uom or setting products.sales_uom_id
- Adding a purchasing/sales unit (e.g. "box of 12" with factor 12 in the Unit category)
### Edge cases
- Conversion only works within one category — cross-category (kg → meter) is rejected by convert_uom.
- Do not create a second is_reference unit in a category.`,
  },
  {
    name: 'convert_uom',
    description: 'Convert a quantity between two units of measure in the same category (e.g. 2500 g → 2.5 kg). Use when: normalizing quantities for stock, pricing or shipping weight. NOT for: listing/creating units (manage_uom).',
    category: 'commerce',
    handler: 'rpc:convert_uom',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'convert_uom',
        description: 'Convert a quantity between two UoMs in the same category via their factor-to-reference.',
        parameters: {
          type: 'object',
          properties: {
            p_qty: { type: 'number', description: 'Quantity to convert' },
            p_from_uom: { type: 'string', description: 'Source UoM UUID' },
            p_to_uom: { type: 'string', description: 'Target UoM UUID' },
          },
          required: ['p_qty', 'p_from_uom', 'p_to_uom'],
        },
      },
    },
    instructions: 'Both units must belong to the same uom_categories row — cross-category conversion raises an error. Get unit UUIDs via manage_uom action=list first. Param names are exactly p_qty, p_from_uom, p_to_uom (matching the Postgres signature).',
  },
  {
    name: 'manage_inventory',
    description: 'Manage product inventory on the e-commerce catalog: list stock, update quantities and thresholds, read low-stock alerts and back-in-stock waitlists. Actions: list_stock, update_stock, low_stock_alerts, back_in_stock_requests. Use when: adjusting stock levels; checking which products are below their reorder threshold; auditing inventory counts. NOT for: managing product details (manage_product); browsing products (browse_products); warehouse-location stock moves (manage_quant, adjust_quant).',
    category: 'commerce',
    handler: 'module:products',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_inventory',
        description: 'Manage product inventory on the e-commerce catalog: list stock, update quantities and thresholds, read low-stock alerts and back-in-stock waitlists. Actions: list_stock, update_stock, low_stock_alerts, back_in_stock_requests. Use when: adjusting stock levels; checking which products are below their reorder threshold; auditing inventory counts. NOT for: managing product details (manage_product); browsing products (browse_products); warehouse-location stock moves (manage_quant, adjust_quant).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              // The handler's ACTUAL branches (agent-execute →
              // executeProductsAction). This enum used to declare `low_stock`,
              // which no branch answers to — the skill's own contract sent
              // agents into "Unknown inventory action". `low_stock` is kept
              // alive as a handler alias for callers that read the old enum,
              // but it is no longer advertised.
              enum: [
                'list_stock',
                'update_stock',
                'low_stock_alerts',
                'back_in_stock_requests',
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
            reason: {
              type: 'string',
              description: 'Why the stock is being corrected (stocktake, breakage, found units…). Recorded on the adjustment stock_move that update_stock writes.',
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
- **action**: Required. list_stock, update_stock, low_stock_alerts, back_in_stock_requests.
- **product_id**: For update_stock.
- **quantity**: New stock quantity. ABSOLUTE, not a delta.
- **threshold**: Low stock threshold (default 5).
- **reason**: Why the correction is being made — lands on the adjustment stock_move.
### Edge cases
- low_stock_alerts returns every tracked, active product at or below its threshold (default 5). The legacy name \`low_stock\` still works as an alias.
- back_in_stock_requests lists un-notified customer waitlist rows.
- update_stock writes an adjustment stock_move for the difference, so a corrected balance always says who moved it and why. Pass **reason**; the fallback is 'manual adjustment via agent'.
- Stock goes negative only for products with allow_backorder — otherwise an order line above the on-hand quantity is refused outright.`,
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
    description: 'Look up order status. A signed-in customer sees only their OWN orders (resolved from the verified session — never ask for or trust an email typed in chat); pass order_id to filter to one, or omit it to list recent. Internal callers (FlowPilot, admin) may also pass email to look up any customer. Use when: a customer asks about their order; support checks order progress. NOT for: managing orders (manage_orders); browsing products (browse_products).',
    category: 'crm',
    handler: 'module:orders',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'lookup_order',
        description: 'Look up order status. A signed-in customer sees only their OWN orders (resolved from the verified session — never ask for or trust an email typed in chat); pass order_id to filter to one, or omit it to list recent. Internal callers (FlowPilot, admin) may also pass email to look up any customer. Use when: a customer asks about their order; support checks order progress. NOT for: managing orders (manage_orders); browsing products (browse_products).',
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
Order status for the caller. Identity is enforced by the server, not by you.
### When to use
- A customer asks about their order in chat
- FlowPilot/admin needs order context
### Parameters
- **order_id** (optional): full id OR the short prefix the customer sees (e.g. "ce8d1746" or "#ce8d1746"). Omit to list the caller's recent orders.
- **email** (internal callers only): look up a specific customer's orders. IGNORED for public chat — a signed-in customer is always pinned to their own verified email, and an anonymous visitor is asked to sign in. Never ask a chat visitor for their email to look up orders.
### Edge cases
- Public chat + not signed in → returns a sign-in prompt, not a lookup.
- Prefix that matches nothing on the account → a clear "no order found" note, not an error.`,
  },
  {
    name: 'manage_orders',
    description: 'Manage orders: list, get details, move an order along one of its TWO status axes (payment: pending/paid/refunded/cancelled/completed/failed — fulfillment: unfulfilled/picked/packed/shipped/delivered), view stats. The value you pass decides the axis: shipping an order never changes whether it is paid, and paying never changes where the goods are. Pass tracking_number with a shipped update. Use when: reviewing customer orders; advancing fulfillment; recording payment state; analyzing sales trends. NOT for: checking status by ID (check_order_status); browsing products (browse_products); invoicing an order (send_invoice_for_order).',
    category: 'commerce',
    handler: 'module:orders',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_orders',
        description: 'Manage orders: list, get details, move an order along one of its two status axes (payment or fulfillment), view stats. The value decides the axis — a fulfillment value never touches the payment status and vice versa. Use when: reviewing customer orders; advancing fulfillment; recording payment state; analyzing sales trends. NOT for: checking status by ID (check_order_status); browsing products (browse_products).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'update_status',
                'timeline',
                'stats',
              ],
            },
            order_id: {
              type: 'string',
            },
            status: {
              type: 'string',
              description: "New status. Payment/lifecycle axis (orders.status): pending, processing, paid, completed, cancelled, refunded, failed. Fulfillment axis (orders.fulfillment_status): unfulfilled, picked, packed, shipped, delivered — these also stamp picked_at/packed_at/shipped_at/delivered_at. Anything else is rejected with the valid values per axis.",
            },
            fulfillment_status: {
              type: 'string',
              description: 'Explicit fulfillment value (alternative to status): unfulfilled, picked, packed, shipped, delivered.',
            },
            tracking_number: {
              type: 'string',
              description: 'Carrier tracking number — written to orders.tracking_number on the same call (typically with shipped).',
            },
            tracking_url: { type: 'string' },
            fulfillment_notes: { type: 'string', description: 'Internal note stored on the order.' },
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
Manages e-commerce orders: list, get details, update either status axis, timeline, stats.
### The two axes (this is the thing to get right)
An order answers two independent questions and they live in two columns:
- **Money — orders.status**: pending → paid → (refunded / cancelled / failed / completed)
- **Goods — orders.fulfillment_status**: unfulfilled → picked → packed → shipped → delivered
The VALUE you pass picks the axis. \`status: "delivered"\` moves fulfillment and leaves
\`paid\` alone; \`status: "paid"\` moves the money axis and leaves the shipment alone.
Fulfillment values also stamp picked_at / packed_at / shipped_at / delivered_at.
An unknown value is rejected with the valid list for each axis — do not retry it on the other axis.
### When to use
- Admin asks about orders or order status
- Order fulfillment workflow (ship / deliver, with tracking)
- Business reporting (order stats)
### Parameters
- **action**: Required. list, get, update_status, timeline, stats.
- **order_id**: For get/update_status/timeline.
- **status** or **fulfillment_status**: The new value (see the axes above).
- **tracking_number** / **tracking_url** / **fulfillment_notes**: Written on the same update_status call.
- **period**: For stats: today, week, month, quarter.
### Edge cases
- Verbs work as actions: ship, deliver, fulfill (→ shipped), pay, cancel, refund.
- \`list\` with a fulfillment value filters the fulfillment column, not the payment one.
- stats counts revenue from the MONEY axis only (status paid|completed).
- A full refund driven by an RMA is owned by refund_return, not by this skill.`,
  },
  {
    name: 'place_order',
    description: 'Place a NEW customer order in the webshop — resolves products server-side, creates the order + line items. Accepts product_id or product_name per item. Use when: staff registers an order on behalf of a customer (phone, email, counter); an external agent creates an order programmatically; testing the purchase flow. NOT for: managing existing orders (use manage_orders), browsing products (use browse_products), returns/RMAs (use create_return), purchase orders to a vendor (use create_purchase_order), on-site service jobs (use manage_service_order), Stripe-hosted storefront checkout (that is the website flow, not this skill).',
    category: 'commerce',
    handler: 'module:orders',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'place_order',
        description: 'Place a NEW customer order via the checkout API with sandbox mode support. Resolves products server-side (by id or name), computes cart weight from products.weight_grams, and auto-selects the cheapest shipping option for the total weight/country when the cart contains weighted products. Use when: staff registers an order for a customer (phone, email, counter); an external agent creates an order programmatically; automated testing of the checkout pipeline. NOT for: managing existing orders (use manage_orders), browsing products (use browse_products), returns/RMAs (use create_return), purchase orders to a vendor (use create_purchase_order), payment configuration (use manage_site_settings).',
        parameters: {
          type: 'object',
          required: ['items', 'customer_email'],
          properties: {
            customer_email: { type: 'string', description: 'Customer email (also accepts customerEmail)' },
            customer_name: { type: 'string', description: 'Customer name (also accepts customerName)' },
            currency: { type: 'string', description: 'ISO currency code, default SEK' },
            notes: { type: 'string', description: 'Free-text notes stored on order.metadata' },
            items: {
              type: 'array',
              description: 'Cart items',
              items: {
                type: 'object',
                required: ['quantity'],
                properties: {
                  product_id: { type: 'string', description: 'UUID of the product (preferred)' },
                  product_name: { type: 'string', description: 'Fuzzy product name fallback' },
                  quantity: { type: 'number' },
                },
              },
            },
            shipping_address: {
              type: 'object',
              description: 'Optional delivery address. If country is set, the auto-cheapest lookup is scoped to carriers serving that country.',
              properties: {
                name: { type: 'string' },
                line1: { type: 'string' },
                line2: { type: 'string' },
                postal_code: { type: 'string' },
                city: { type: 'string' },
                country: { type: 'string', description: 'ISO country code (e.g. SE, DE)' },
                phone: { type: 'string' },
              },
            },
            shipping_rate_id: {
              type: 'string',
              description: 'Optional UUID of a specific shipping_rates row to use. Validated against active status and weight band. If omitted and the cart has weighted products, list_shipping_options is called and the cheapest option is selected automatically.',
            },
          },
        },
      },
    },
    instructions: `## place_order
### What
Places an order as a customer. Accepts snake_case and camelCase. Resolves products server-side by product_id (UUID) or product_name (fuzzy). Computes total cart weight from products.weight_grams (NULL = non-shippable, excluded from sum) and wires shipping when the cart has any weighted product.
### Shipping selection
- If **shipping_rate_id** is provided → validated against shipping_rates (must be active and weight band must cover total weight).
- Otherwise → calls list_shipping_options(total_weight, currency, country) and auto-selects the cheapest option.
- If no options exist → order is created without shipping (graceful degrade).
- Weightless / service carts → no shipping fields written (unchanged).
### Order total
total_cents = Σ(price × qty) + shipping_cost_cents. shipping_cost_cents and shipping_method are written to the order row and returned in the response so the caller can verify the math.
### Parameters
- **customer_email** (required), **customer_name**
- **items[]**: {product_id | product_name, quantity}
- **currency**: default SEK
- **shipping_address**: {name, line1, line2, postal_code, city, country, phone}
- **shipping_rate_id**: UUID from shipping_rates (optional; overrides auto-cheapest)
### Response
Returns order_id, total_cents, total_weight_grams, shipping_method, shipping_cost_cents.`,
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
    description: 'Lists orders with abandoned or incomplete status. Use when: reviewing abandoned carts, recovery campaigns, checking incomplete orders. NOT for: checking specific order status (use check_order_status).',
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
        description: 'Lists orders with abandoned or incomplete status. Use when: reviewing abandoned carts, recovery campaigns, checking incomplete orders. NOT for: checking specific order status (use check_order_status).',
      },
    },
    instructions: 'Identify orders needing follow-up. After listing, create a recovery campaign.',
  },
  {
    name: 'send_invoice_for_order',
    description: 'Convert an existing order into a sent invoice and email the customer a link. Closes the quote-to-cash loop. Use when: order is fulfilled or ready to bill, "fakturera order X", "send invoice for order". NOT for: creating manual invoices (use manage_invoice), draft invoices only, or invoicing time entries (use invoice_from_timesheets). Idempotent on invoices.order_id — an order that already has an invoice reuses it and reports reused_existing_invoice, so calling twice never creates a second receivable.',
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
              description: "Tax rate as decimal e.g. 0.25 for 25%. Omit it: an order converted from a quote carries the accepted rate on the order (metadata.tax_rate) and it is used automatically; otherwise 0.25.",
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
    instructions: 'Builds an invoice from order_items (qty × price_cents), applies the tax rate (explicit tax_rate → the order\'s own metadata.tax_rate when it came from a quote → 0.25), marks status=sent, and emails the customer a link. IDEMPOTENCY: keyed on the invoices.order_id column — one invoice per order. It used to key on the text "order:<id>" inside invoices.notes, which an edited note silently defeated: the next call issued a SECOND live invoice for an already-paid order. Pre-migration invoices are still found by the old note and are repaired to use the column. The reply carries reused_existing_invoice — if it is true, no new invoice was created and total_cents is the existing document\'s. Use dry_run=true to preview totals (and whether an invoice already exists) before sending. Logs invoice_sent to audit_logs.\n\nREAD THE RESULT, do not assume it: `invoice_created` and `sent` are two different facts. `sent:false` means the EMAIL did not leave — either no email provider is configured (email.simulated) or the outbound allowlist withheld the recipient (email.blocked_by_allowlist). The invoice still exists and is marked sent in the ledger. When sent is false, tell the user the invoice was created but NOT emailed, and say why from the `email` object.',
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
  {
    name: 'manage_discount_code',
    description:
      'Manage checkout discount codes: list, get, create, update, deactivate. Codes give a percent or fixed-amount discount at checkout, with optional validity window, usage limit and minimum order. Use when: setting up a promotion or campaign code; deactivating an expired code; checking how often a code was used. NOT for: product pricing (manage_product); per-line quote/invoice discounts; loyalty programs.',
    category: 'commerce',
    handler: 'rpc:manage_discount_code',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_discount_code',
        description:
          'Manage discount codes redeemable at checkout: list, get, create, update, deactivate.',
        parameters: {
          type: 'object',
          properties: {
            p_action: {
              type: 'string',
              enum: ['list', 'get', 'create', 'update', 'deactivate'],
            },
            p_code_id: { type: 'string', description: 'Discount code UUID (get/update/deactivate)' },
            p_code: { type: 'string', description: 'The code customers type, e.g. SUMMER10 (create; also accepted for get)' },
            p_type: { type: 'string', enum: ['percent', 'fixed'], description: 'percent = value is a whole percent (10 = 10%); fixed = value is an amount in cents' },
            p_value: { type: 'number', description: 'Percent (1-100) for percent codes, amount in cents for fixed codes' },
            p_currency: { type: 'string', description: 'ISO currency for fixed codes, e.g. SEK (required for type=fixed)' },
            p_active: { type: 'boolean' },
            p_valid_from: { type: 'string', description: 'ISO timestamp the code becomes valid' },
            p_valid_until: { type: 'string', description: 'ISO timestamp the code expires' },
            p_max_uses: { type: 'number', description: 'Total redemption cap; omit for unlimited' },
            p_min_order_cents: { type: 'number', description: 'Minimum order subtotal in cents' },
          },
          required: ['p_action'],
        },
      },
    },
    instructions: `## manage_discount_code
### What
Manages discount codes for the storefront checkout (discount_codes table).
### When to use
- Setting up a promotion: action=create with p_code, p_type, p_value
- Ending a promotion: action=deactivate with p_code_id
- Reviewing usage: action=list (includes use_count per code)
### Parameters
- **p_action**: Required. list, get, create, update, deactivate.
- **p_type/p_value**: percent → p_value is a whole percent (10 = 10%); fixed → p_value is cents (5000 = 50.00) and p_currency is required.
- **p_max_uses / p_min_order_cents / p_valid_from / p_valid_until**: optional constraints, all enforced server-side at checkout.
### Edge cases
- Codes are case-insensitive and unique (SUMMER10 == summer10).
- use_count increments automatically when an order with the code is placed (sandbox) or paid (Stripe webhook) — never set it manually.
- Deactivate instead of delete so use history stays intact.`,
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
    'manage_uom',
    'convert_uom',
    'manage_inventory',
    'manage_orders',
    'lookup_order',
    'check_order_status',
    'place_order',
    'cart_recovery_check',
    'inventory_report',
    'fulfill_order_line',
    'manage_discount_code',
    'send_invoice_for_order',
  ],
  data: {
    // children first (FK-safe order)
    tables: [
      'product_variant_values',
      'product_attribute_values',
      'product_variants',
      'product_attributes',
      'product_stock',
      'products',
      'product_categories',
      'discount_codes',
    ],
  },
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
