/**
 * Shipping Module — Carriers + Shipments (parcels) for outbound orders.
 *
 * Carriers: PostNord, DHL, Bring (extensible).
 * One order can have many shipments (parcels). Each shipment can carry a
 * tracking number + label URL. Carrier-specific label generation is delegated
 * to edge functions per carrier (TODO: postnord-label).
 */

import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['list_carriers', 'list_shipments', 'create_shipment']),
  order_id: z.string().uuid().optional(),
});
const outputSchema = z.object({ success: z.boolean(), data: z.unknown().optional(), message: z.string().optional() });
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const SKILLS: SkillSeed[] = [
  {
    name: 'manage_carrier',
    description:
      'CRUD for shipping carriers (PostNord, DHL, Bring, custom). Use when: enabling/disabling a carrier, updating tracking-URL templates, or rotating API credentials. NOT for: creating shipments (use manage_shipment).',
    category: 'commerce',
    handler: 'db:carriers',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_carrier',
        description: 'Create, list, update, or deactivate carriers',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'delete'] },
            id: { type: 'string' },
            code: { type: 'string', description: 'Lowercase identifier — postnord, dhl, bring, etc.' },
            name: { type: 'string' },
            tracking_url_template: { type: 'string', description: 'Use {tracking_number} placeholder' },
            api_credentials_secret_ref: { type: 'string', description: 'Edge-function secret name holding API key' },
            is_active: { type: 'boolean' },
          },
          required: ['action'],
          'x-action-required': { create: ['code', 'name'] },
        },
      },
    },
  },
  {
    name: 'manage_shipment',
    description:
      'Create/list/update shipments (parcels) for an order. Use when: warehouse books a parcel with a carrier and gets a tracking number. NOT for: marking the whole order as shipped (use manage_orders with fulfillment_status=shipped).',
    category: 'commerce',
    handler: 'db:shipments',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_shipment',
        description: 'CRUD for shipments (parcels) attached to orders',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'get', 'update', 'delete'] },
            id: { type: 'string' },
            order_id: { type: 'string' },
            carrier_id: { type: 'string' },
            carrier_code: { type: 'string' },
            tracking_number: { type: 'string' },
            tracking_url: { type: 'string' },
            label_url: { type: 'string', description: 'Storage URL of generated PDF label' },
            status: { type: 'string', enum: ['pending', 'labeled', 'shipped', 'delivered', 'cancelled'] },
            weight_grams: { type: 'integer' },
            cost_cents: { type: 'integer' },
            shipped_at: { type: 'string' },
            delivered_at: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': { create: ['order_id'] },
        },
      },
    },
    instructions:
      'After creating a shipment with a tracking_number, populate tracking_url by formatting the carrier.tracking_url_template (replace {tracking_number}). When status transitions to shipped/delivered, also update orders.fulfillment_status via manage_orders.',
  },
  {
    name: 'manage_shipping_rate',
    description: 'Manage a carrier\'s weight-band shipping rates (price per weight bracket). Use when: setting up shipping prices, editing rate cards. NOT for: computing a shipment cost (use calc_shipping_rate) or carrier records (manage_carrier).',
    category: 'commerce',
    handler: 'rpc:manage_shipping_rate',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_shipping_rate',
        description: 'List/create/update/delete weight-band rates for a carrier (min/max grams → price). NULL max = no upper bound. Bands can be scoped to destination countries.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
            p_rate_id: { type: 'string', format: 'uuid' },
            p_carrier_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string' },
            p_min_weight_grams: { type: 'number' },
            p_max_weight_grams: { type: 'number', description: 'Omit for no upper bound' },
            p_price_cents: { type: 'number' },
            p_currency: { type: 'string' },
            p_dim_divisor: { type: 'number', description: 'cm³/kg for dimensional weight (default 5000)' },
            p_countries: { type: 'array', items: { type: 'string' }, description: 'ISO-3166 alpha-2 destination codes this band serves (e.g. ["NO","DK"]). Omit for all destinations.' },
            p_allow_overlap: { type: 'boolean', description: 'Overlapping active bands (same carrier/currency/destination) are rejected by default; pass true for a deliberate secondary tier (e.g. express).' },
          },
        },
      },
    },
    instructions: 'Weight bands are [min_weight_grams, max_weight_grams] → price_cents per carrier. Leave p_max_weight_grams null for the top band. Overlapping active bands for the same carrier + currency + intersecting destination scope are rejected unless p_allow_overlap=true. Admin/service-role only for mutations.',
  },
  {
    name: 'calc_shipping_rate',
    description: 'Compute a shipment\'s price for a carrier from its weight bands, billing on the greater of actual and dimensional weight. Use when: quoting shipping at checkout, estimating a parcel cost. NOT for: editing rates (manage_shipping_rate).',
    category: 'commerce',
    handler: 'rpc:calc_shipping_rate',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'calc_shipping_rate',
        description: 'Pick the cheapest matching weight band for a carrier. Bills on max(actual grams, dimensional grams). Dimensions optional; dimensional weight = L×W×H(cm) / dim_divisor × 1000.',
        parameters: {
          type: 'object',
          required: ['p_carrier_id', 'p_weight_grams'],
          properties: {
            p_carrier_id: { type: 'string', format: 'uuid' },
            p_weight_grams: { type: 'number' },
            p_length_cm: { type: 'number' },
            p_width_cm: { type: 'number' },
            p_height_cm: { type: 'number' },
            p_dim_divisor: { type: 'number', description: 'cm³/kg (default 5000)' },
            p_country: { type: 'string', description: 'ISO-3166 alpha-2 destination (e.g. NO). Filters country-scoped bands; omit for worldwide bands only.' },
          },
        },
      },
    },
    instructions: 'Returns price_cents + billable_grams + billed_on (actual|dimensional). Give all three dimensions to trigger dimensional-weight billing (e.g. light but bulky parcels). Pass p_country to include destination-scoped bands. success:false with reason no_matching_rate when no band covers the weight.',
  },
  {
    name: 'list_shipping_options',
    description: 'Rate-shop across ALL active carriers: cheapest matching weight band per carrier for a parcel, sorted by price. Use when: comparing carriers for a shipment, quoting delivery options at checkout, picking the cheapest carrier. NOT for: a single known carrier (calc_shipping_rate) or editing rates (manage_shipping_rate).',
    category: 'commerce',
    handler: 'rpc:list_shipping_options',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_shipping_options',
        description: 'Returns {options:[{carrier_id, carrier_code, carrier_name, rate_id, rate_name, price_cents, currency}]} sorted cheapest first — one option per active carrier whose band covers the weight (and destination, when given).',
        parameters: {
          type: 'object',
          required: ['p_weight_grams'],
          properties: {
            p_weight_grams: { type: 'number', description: 'Total parcel weight in grams' },
            p_currency: { type: 'string', description: 'Only rates in this currency (e.g. SEK)' },
            p_country: { type: 'string', description: 'ISO-3166 alpha-2 destination; includes country-scoped bands' },
          },
        },
      },
    },
    instructions: 'The same RPC powers the storefront checkout delivery selector, so agent quotes always match what the customer sees. Empty options = no carrier covers the weight/destination (configure rates via manage_shipping_rate).',
  },
  {
    name: 'estimate_delivery_date',
    description:
      'Estimate the delivery-date window for a carrier: ships next business day, then transit_days_min–max business days (weekends + business_holidays skipped). Use when: telling a customer when a parcel arrives, choosing a carrier by speed. NOT for: price quotes (list_shipping_options).',
    category: 'commerce',
    handler: 'rpc:estimate_delivery_date',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'estimate_delivery_date',
        description: 'Returns {ships_on, earliest_delivery, latest_delivery, transit_days} for a carrier, counted in business days.',
        parameters: {
          type: 'object',
          required: ['p_carrier_id'],
          properties: {
            p_carrier_id: { type: 'string', format: 'uuid' },
            p_ship_date: { type: 'string', description: 'YYYY-MM-DD hand-over date (default today); rolls forward to the next business day' },
          },
        },
      },
    },
    instructions:
      'Transit windows live on carriers.transit_days_min/max (edit via manage_carrier). Shares the business_holidays calendar with the SLA module, so public holidays configured once apply here too.',
  },
  {
    name: 'manage_carrier_pickup',
    description:
      'Schedule carrier pickups (book a time window, attach parcels, confirm/cancel). Use when: booking PostNord/DHL to collect parcels from the warehouse. NOT for: customer delivery booking (manage_booking) or creating shipments (manage_shipment).',
    category: 'commerce',
    handler: 'rpc:manage_carrier_pickup',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_carrier_pickup',
        description: 'request/assign_shipments/update_status/cancel/get/list pickups. Status flow: requested → confirmed (set confirmation_ref) → completed.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['request', 'assign_shipments', 'update_status', 'cancel', 'get', 'list'] },
            p_pickup_id: { type: 'string', format: 'uuid' },
            p_carrier_id: { type: 'string', format: 'uuid' },
            p_pickup_date: { type: 'string', description: 'YYYY-MM-DD (today or later)' },
            p_window_start: { type: 'string', description: 'HH:MM' },
            p_window_end: { type: 'string', description: 'HH:MM' },
            p_address: { type: 'string' },
            p_contact_name: { type: 'string' },
            p_contact_phone: { type: 'string' },
            p_instructions: { type: 'string' },
            p_status: { type: 'string', enum: ['requested', 'confirmed', 'completed', 'cancelled'] },
            p_confirmation_ref: { type: 'string', description: 'Carrier booking reference' },
            p_shipment_ids: { type: 'array', items: { type: 'string' }, description: 'Shipments to attach to the pickup' },
          },
        },
      },
    },
    instructions:
      'request needs p_carrier_id + p_pickup_date; attach parcels at request time via p_shipment_ids or later with assign_shipments. When the carrier confirms, update_status confirmed + p_confirmation_ref. cancel detaches all shipments.',
  },
  {
    name: 'record_delivery_proof',
    description:
      'Capture proof of delivery on a shipment: signature URL, signer name, photos. Marks the shipment delivered; when every outbound parcel of the order is delivered the order flips to delivered too. Use when: carrier/customer confirms receipt. NOT for: field-service visit proof (record_visit_proof).',
    category: 'commerce',
    handler: 'rpc:record_delivery_proof',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_delivery_proof',
        description: 'Writes pod_signature_url/pod_signed_by/pod_photo_urls (+pod_signed_at), sets status=delivered + delivered_at, bubbles orders.fulfillment_status when all parcels are delivered.',
        parameters: {
          type: 'object',
          required: ['p_shipment_id'],
          properties: {
            p_shipment_id: { type: 'string', format: 'uuid' },
            p_signature_url: { type: 'string' },
            p_signed_by: { type: 'string', description: 'Name of the person who received the parcel' },
            p_photo_urls: { type: 'array', items: { type: 'string' } },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions:
      'At least one of p_signature_url / p_signed_by / p_photo_urls is required. Upload images first and pass URLs. Returns order_marked_delivered=true when the whole order is now delivered.',
  },
  {
    name: 'create_return_label',
    description:
      'Generate a return shipping label: creates a return-kind shipment linked to the original with a RET- tracking number and a label payload (customer address → merchant). Use when: an RMA/return needs a way back. NOT for: refunds (refund_return) or outbound parcels (manage_shipment).',
    category: 'commerce',
    handler: 'rpc:create_return_label',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_return_label',
        description: 'Creates a kind=return shipment (status labeled) linked via return_of_shipment_id. Carrier defaults to the original shipment\'s, falling back to the highest-priority active carrier.',
        parameters: {
          type: 'object',
          properties: {
            p_shipment_id: { type: 'string', format: 'uuid', description: 'Original outbound shipment (preferred)' },
            p_order_id: { type: 'string', format: 'uuid', description: 'Alternative when no shipment exists' },
            p_carrier_id: { type: 'string', format: 'uuid', description: 'Override carrier' },
            p_weight_grams: { type: 'number' },
            p_reason: { type: 'string' },
          },
        },
      },
    },
    instructions:
      'Give p_shipment_id or p_order_id. The label payload (from-address = order shipping address) is returned and stored in shipment metadata.return_label; the return also appears in batch_shipping_labels for printing.',
  },
  {
    name: 'batch_shipping_labels',
    description:
      'Collect labels for many shipments in one call — the print queue for the warehouse. Use when: printing the day\'s labels, checking which parcels still lack a label. NOT for: creating labels (manage_shipment label_url / create_return_label).',
    category: 'commerce',
    handler: 'rpc:batch_shipping_labels',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'batch_shipping_labels',
        description: 'Returns {labels:[{shipment_id, tracking_number, label_url, …}], missing_label_shipment_ids}. Default selection = pending/labeled shipments.',
        parameters: {
          type: 'object',
          properties: {
            p_shipment_ids: { type: 'array', items: { type: 'string' }, description: 'Explicit shipment set' },
            p_carrier_id: { type: 'string', format: 'uuid' },
            p_status: { type: 'string', enum: ['pending', 'labeled', 'shipped', 'delivered'] },
            p_limit: { type: 'number', description: 'Default 100' },
          },
        },
      },
    },
    instructions:
      'No filters = all pending/labeled shipments (the natural print queue). missing_label_shipment_ids lists parcels that still need a label generated before printing.',
  },
  {
    name: 'select_shipping_carrier',
    description:
      'Pick a carrier with automatic failover: tries the preferred carrier first and falls back through the remaining active carriers by priority until one has a matching rate. Use when: a preferred carrier may not cover a parcel; automated fulfillment that must not fail. NOT for: comparing all prices (list_shipping_options).',
    category: 'commerce',
    handler: 'rpc:select_shipping_carrier',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'select_shipping_carrier',
        description: 'Returns the chosen carrier + rate with fallback_used flag and the attempted list. Order: preferred carrier, then carriers.priority ascending.',
        parameters: {
          type: 'object',
          required: ['p_weight_grams'],
          properties: {
            p_weight_grams: { type: 'number' },
            p_country: { type: 'string', description: 'ISO-3166 alpha-2 destination' },
            p_currency: { type: 'string' },
            p_preferred_carrier_id: { type: 'string', format: 'uuid' },
            p_preferred_carrier_code: { type: 'string', description: 'e.g. postnord — alternative to the id' },
          },
        },
      },
    },
    instructions:
      'Failover order is carriers.priority (lower = tried first; edit via manage_carrier). success:false with attempted[] means no active carrier covers the weight/destination at all.',
  },
  {
    name: 'validate_address',
    description:
      'Validate a shipping address before booking: required fields + per-country postal-code format (16 countries seeded in postal_code_rules). Use when: checking a customer address before creating a shipment or quoting. NOT for: enriching company data (enrich_company).',
    category: 'commerce',
    handler: 'rpc:validate_address',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'validate_address',
        description: 'Returns {valid, issues[], postal_format_known, normalized:{…}}. Postal format checked against postal_code_rules for the destination country.',
        parameters: {
          type: 'object',
          required: ['p_country'],
          properties: {
            p_country: { type: 'string', description: 'ISO-3166 alpha-2, e.g. SE' },
            p_postal_code: { type: 'string' },
            p_city: { type: 'string' },
            p_street: { type: 'string' },
            p_name: { type: 'string' },
          },
        },
      },
    },
    instructions:
      'valid=false comes with human-readable issues[] (missing fields, postal format mismatch with an example). postal_format_known=false means the country has no seeded rule — only required-field checks applied. Add rules via the postal_code_rules table.',
  },
  {
    name: 'manage_shipment_customs',
    description:
      'International shipping customs: set customs data (value, incoterm, contents type, HS-coded items) on a shipment and generate a CN22-style declaration. Use when: shipping outside the customs union; preparing export documents. NOT for: domestic parcels.',
    category: 'commerce',
    handler: 'rpc:manage_shipment_customs',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_shipment_customs',
        description: 'set: store customs fields. declare: validate completeness and generate the CN22 declaration (stored on the shipment). get: read back.',
        parameters: {
          type: 'object',
          required: ['p_action', 'p_shipment_id'],
          properties: {
            p_action: { type: 'string', enum: ['set', 'declare', 'get'] },
            p_shipment_id: { type: 'string', format: 'uuid' },
            p_customs_value_cents: { type: 'number' },
            p_currency: { type: 'string', description: 'e.g. SEK' },
            p_incoterm: { type: 'string', enum: ['DAP', 'DDP', 'DDU', 'EXW', 'FOB', 'CIF', 'CIP', 'FCA'] },
            p_contents_type: { type: 'string', enum: ['merchandise', 'gift', 'documents', 'sample', 'return', 'other'] },
            p_destination_country: { type: 'string', description: 'ISO-3166 alpha-2' },
            p_items: { type: 'array', items: { type: 'object' }, description: '[{description, quantity, value_cents, weight_grams, hs_code, origin_country}]' },
          },
        },
      },
    },
    instructions:
      'Workflow: set (destination_country + contents_type + items with description/quantity/value_cents at minimum) → declare (returns success:false + missing[] if incomplete, otherwise the CN22 payload). declared_value defaults to the item total.',
  },
];

export const shippingModule = defineModule<Input, Output>({
  id: 'shipping' as any,
  name: 'Shipping',
  version: '1.0.0',
  processes: ['order-to-delivery'],
  maturity: 'L4',
  description:
    'Outbound shipping with multi-parcel support and carrier integrations. Built-in: PostNord, DHL, Bring. Tracking URLs are auto-rendered from per-carrier templates.',
  capabilities: ['data:read', 'data:write'],
  tier: 'extended',
  inputSchema,
  outputSchema,
  skills: [
    'manage_carrier', 'manage_shipment', 'manage_shipping_rate', 'calc_shipping_rate', 'list_shipping_options',
    'estimate_delivery_date', 'manage_carrier_pickup', 'record_delivery_proof', 'create_return_label',
    'batch_shipping_labels', 'select_shipping_carrier', 'validate_address', 'manage_shipment_customs',
  ],
  skillSeeds: SKILLS,
  data: {
    // children first (FK-safe order)
    tables: ['shipments', 'shipping_pickups', 'carriers'],
  },
  async publish(input: Input): Promise<Output> {
    const v = inputSchema.parse(input);
    logger.log('[shipping] action:', v.action);
    return { success: true };
  },
});
