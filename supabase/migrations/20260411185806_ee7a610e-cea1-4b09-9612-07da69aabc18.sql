UPDATE agent_skills 
SET handler = 'module:openclaw',
    category = 'system',
    scope = 'external',
    mcp_exposed = true,
    description = 'Place a customer order for products. Use when: an external agent (Claw) wants to simulate or execute a purchase as a customer. NOT for: managing existing orders (use manage_orders); creating purchase orders for suppliers (use create_purchase_order).',
    tool_definition = jsonb_build_object(
      'type', 'function',
      'function', jsonb_build_object(
        'name', 'place_order',
        'description', 'Place a customer order for products. Use when: an external agent (Claw) wants to simulate or execute a purchase as a customer. NOT for: managing existing orders (use manage_orders).',
        'parameters', jsonb_build_object(
          'type', 'object',
          'required', jsonb_build_array('customer_email', 'items'),
          'properties', jsonb_build_object(
            'customer_email', jsonb_build_object('type', 'string', 'description', 'Customer email address'),
            'customer_name', jsonb_build_object('type', 'string', 'description', 'Customer display name'),
            'items', jsonb_build_object('type', 'array', 'description', 'Products to order', 'items', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('product_id', jsonb_build_object('type', 'string'), 'product_name', jsonb_build_object('type', 'string'), 'quantity', jsonb_build_object('type', 'number')))),
            'currency', jsonb_build_object('type', 'string', 'description', 'Currency code (default SEK)'),
            'notes', jsonb_build_object('type', 'string', 'description', 'Optional order notes')
          )
        )
      )
    ),
    updated_at = now()
WHERE name = 'place_order';