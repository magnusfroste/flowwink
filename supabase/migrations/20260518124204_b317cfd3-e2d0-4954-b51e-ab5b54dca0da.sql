DO $$
DECLARE
  patch RECORD;
BEGIN
  FOR patch IN
    SELECT * FROM (VALUES
      ('manage_saved_views'::text, jsonb_build_array('scope','name')),
      ('manage_tags', jsonb_build_array('name'))
    ) AS p(skill_name, cols)
  LOOP
    -- Flat shape: tool_definition.parameters (no function wrapper)
    UPDATE public.agent_skills
       SET tool_definition = jsonb_set(
             tool_definition,
             '{parameters,x-action-required}',
             COALESCE(tool_definition #> '{parameters,x-action-required}', '{}'::jsonb)
               || jsonb_build_object('create', patch.cols),
             true
           )
     WHERE name = patch.skill_name
       AND tool_definition #> '{parameters}' IS NOT NULL
       AND tool_definition #> '{function,parameters}' IS NULL;

    -- Nested shape (in case schema was migrated to function.parameters meanwhile)
    UPDATE public.agent_skills
       SET tool_definition = jsonb_set(
             tool_definition,
             '{function,parameters,x-action-required}',
             COALESCE(tool_definition #> '{function,parameters,x-action-required}', '{}'::jsonb)
               || jsonb_build_object('create', patch.cols),
             true
           )
     WHERE name = patch.skill_name
       AND tool_definition #> '{function,parameters}' IS NOT NULL;
  END LOOP;
END $$;