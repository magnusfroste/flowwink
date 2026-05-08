-- Fix 1: tag_entity — wrap in proper OpenAI function format + use standard CRUD actions
UPDATE public.agent_skills
SET tool_definition = jsonb_build_object(
  'type', 'function',
  'function', jsonb_build_object(
    'name', 'tag_entity',
    'description', 'Attach or detach a tag to/from any record (lead, deal, order, ticket, project, company, contact). Use when: classifying or labeling a specific record. NOT for: creating new tags (use manage_tags).',
    'parameters', jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('action'),
      'properties', jsonb_build_object(
        'action', jsonb_build_object('type','string','enum',jsonb_build_array('list','create','delete')),
        'tag_id', jsonb_build_object('type','string','description','UUID of the tag from public.tags'),
        'entity_type', jsonb_build_object('type','string','description','e.g. lead, deal, order, ticket, project, company, contact'),
        'entity_id', jsonb_build_object('type','string','description','UUID of the entity to tag')
      ),
      'allOf', jsonb_build_array(
        jsonb_build_object(
          'if', jsonb_build_object('properties', jsonb_build_object('action', jsonb_build_object('const','create'))),
          'then', jsonb_build_object('required', jsonb_build_array('tag_id','entity_type','entity_id'))
        ),
        jsonb_build_object(
          'if', jsonb_build_object('properties', jsonb_build_object('action', jsonb_build_object('const','delete'))),
          'then', jsonb_build_object('required', jsonb_build_array('tag_id','entity_type','entity_id'))
        )
      )
    )
  )
)
WHERE name = 'tag_entity';

-- Fix 2: update_purchase_order — add po_number, mark required for create
UPDATE public.agent_skills
SET tool_definition = jsonb_set(
  jsonb_set(
    tool_definition,
    '{function,parameters,properties,po_number}',
    '{"type":"string","description":"Vendor-facing PO number, e.g. PO-2026-001"}'::jsonb
  ),
  '{function,parameters,allOf}',
  '[
    {"if":{"properties":{"action":{"const":"create"}}},
     "then":{"required":["po_number","vendor_id"]}},
    {"if":{"properties":{"action":{"const":"update"}}},
     "then":{"required":["purchase_order_id"]}},
    {"if":{"properties":{"action":{"const":"get"}}},
     "then":{"required":["purchase_order_id"]}}
  ]'::jsonb
)
WHERE name = 'update_purchase_order';

-- Fix 3: tag_journal_entry_analytics — per-action required for create
UPDATE public.agent_skills
SET tool_definition = jsonb_set(
  tool_definition,
  '{function,parameters,allOf}',
  '[
    {"if":{"properties":{"action":{"const":"create"}}},
     "then":{"required":["journal_entry_line_id","analytic_account_id","entry_date","amount_cents"]}},
    {"if":{"properties":{"action":{"const":"delete"}}},
     "then":{"required":["journal_entry_line_id"]}}
  ]'::jsonb
)
WHERE name = 'tag_journal_entry_analytics';