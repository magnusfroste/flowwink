
CREATE OR REPLACE FUNCTION public.lint_get_rpc_signatures()
RETURNS TABLE (proname text, args text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.proname::text,
         COALESCE(
           array_agg(pa.parameter_name::text ORDER BY pa.ordinal_position)
             FILTER (WHERE pa.parameter_name IS NOT NULL),
           ARRAY[]::text[]
         )
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  LEFT JOIN information_schema.parameters pa
    ON pa.specific_name = p.proname || '_' || p.oid
  GROUP BY p.proname;
$$;

CREATE OR REPLACE FUNCTION public.lint_get_not_null_columns()
RETURNS TABLE (table_name text, column_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.table_name::text, c.column_name::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.is_nullable = 'NO'
    AND c.column_default IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.lint_get_rpc_signatures() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lint_get_not_null_columns() TO anon, authenticated, service_role;

INSERT INTO public.agent_skills (name, handler, category, enabled, mcp_exposed, description, tool_definition)
VALUES (
  'lint_skill',
  'internal:lint_skill',
  'system',
  true,
  true,
  'Use when: user asks to lint, verify, audit, or pre-release-check one or all agent skills against the Agent Contract Integrity checklist (arg-mapping, NOT NULL coverage, description quality, MCP exposure). Returns structured findings with severity and suggested fixes. NOT for: actually fixing the issues — only reports them.',
  jsonb_build_object(
    'type', 'function',
    'function', jsonb_build_object(
      'name', 'lint_skill',
      'description', 'Run the Agent Contract Integrity pre-release checklist on one or all enabled skills. Returns structured findings (error/warn/info) per layer with suggested fixes.',
      'parameters', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'skill_name', jsonb_build_object('type','string','description','Optional: lint only this skill. Omit to lint all enabled skills.'),
          'include_passing', jsonb_build_object('type','boolean','description','If true, include skills with zero findings. Default false.','default', false),
          'auto_filled_columns', jsonb_build_object('type','object','description','Per-skill NOT NULL exemptions: {"skill_name":["col_a"]}','additionalProperties', jsonb_build_object('type','array','items', jsonb_build_object('type','string')))
        ),
        'required', ARRAY[]::text[]
      )
    )
  )
)
ON CONFLICT (name) DO UPDATE SET
  handler = EXCLUDED.handler,
  category = EXCLUDED.category,
  enabled = EXCLUDED.enabled,
  mcp_exposed = EXCLUDED.mcp_exposed,
  description = EXCLUDED.description,
  tool_definition = EXCLUDED.tool_definition;
