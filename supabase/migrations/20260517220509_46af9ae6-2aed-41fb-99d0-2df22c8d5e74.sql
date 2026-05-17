
UPDATE public.agent_skills SET handler = 'rpc:create_payroll_run'
  WHERE name = 'create_payroll_run' AND handler = 'rpc:mcp_create_payroll_run';
UPDATE public.agent_skills SET handler = 'rpc:approve_payroll_run'
  WHERE name = 'approve_payroll_run' AND handler = 'rpc:mcp_approve_payroll_run';
UPDATE public.agent_skills SET handler = 'rpc:mark_payroll_paid'
  WHERE name = 'mark_payroll_paid' AND handler = 'rpc:mcp_mark_payroll_paid';
UPDATE public.agent_skills SET handler = 'rpc:list_payroll_runs'
  WHERE name = 'list_payroll_runs' AND handler = 'rpc:mcp_list_payroll_runs';
UPDATE public.agent_skills SET handler = 'rpc:list_payroll_lines'
  WHERE name = 'list_payroll_lines' AND handler = 'rpc:mcp_list_payroll_lines';
UPDATE public.agent_skills SET handler = 'rpc:dispose_fixed_asset'
  WHERE name = 'dispose_fixed_asset' AND handler = 'rpc:mcp_dispose_fixed_asset';
UPDATE public.agent_skills SET handler = 'rpc:register_fixed_asset'
  WHERE name = 'register_fixed_asset' AND handler = 'rpc:mcp_register_fixed_asset';
UPDATE public.agent_skills SET handler = 'rpc:run_monthly_depreciation'
  WHERE name = 'run_monthly_depreciation' AND handler = 'rpc:mcp_run_monthly_depreciation';
UPDATE public.agent_skills SET handler = 'rpc:revalue_open_balances'
  WHERE name = 'revalue_open_balances' AND handler = 'rpc:mcp_revalue_open_balances';
UPDATE public.agent_skills SET handler = 'rpc:set_exchange_rate'
  WHERE name = 'set_exchange_rate' AND handler = 'rpc:mcp_set_exchange_rate';

UPDATE public.agent_skills
SET tool_definition = jsonb_set(
  tool_definition #- '{function,parameters,properties,depreciation_method}',
  '{function,parameters,properties,method}',
  COALESCE(
    tool_definition #> '{function,parameters,properties,depreciation_method}',
    '{"type":"string","enum":["straight_line","declining"],"description":"Depreciation method"}'::jsonb
  )
)
WHERE name = 'register_fixed_asset'
  AND tool_definition #> '{function,parameters,properties,depreciation_method}' IS NOT NULL;

UPDATE public.agent_skills
SET tool_definition = jsonb_set(
  jsonb_set(
    tool_definition #- '{function,parameters,properties,base_currency}' #- '{function,parameters,properties,quote_currency}',
    '{function,parameters,properties,base}',
    COALESCE(tool_definition #> '{function,parameters,properties,base_currency}', '{"type":"string","description":"Base currency code (e.g. EUR)"}'::jsonb)
  ),
  '{function,parameters,properties,quote}',
  COALESCE(tool_definition #> '{function,parameters,properties,quote_currency}', '{"type":"string","description":"Quote currency code (e.g. SEK)"}'::jsonb)
)
WHERE name = 'set_exchange_rate'
  AND tool_definition #> '{function,parameters,properties,base_currency}' IS NOT NULL;

UPDATE public.agent_skills SET handler = 'module:timesheets'
  WHERE name IN ('log_time','timesheet_summary') AND handler = 'db:timesheets';

UPDATE public.agent_skills
SET enabled = false, mcp_exposed = false,
    description = COALESCE(description,'') || E'\n\n[DISABLED 2026-05-15: backing edge function field-service-skill not deployed]'
WHERE name = 'manage_service_order' AND handler = 'edge:field-service-skill';

UPDATE public.agent_skills
SET enabled = false, mcp_exposed = false,
    description = COALESCE(description,'') || E'\n\n[DISABLED 2026-05-15: backing edge function sla-check not deployed]'
WHERE name = 'sla_check' AND handler = 'edge:sla-check';
