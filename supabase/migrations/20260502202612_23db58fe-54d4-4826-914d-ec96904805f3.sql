-- Strip top-level allOf/oneOf/anyOf/if/then/else from agent_skills.tool_definition
-- so OpenAI gpt-4.1 strict tool-calling stops returning HTTP 400.
-- The branches' `required` fields are merged into a top-level `x-action-required` map
-- where possible (action-discriminator pattern). Runtime handlers still validate.

CREATE OR REPLACE FUNCTION public._flatten_skill_schema(td jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  params jsonb;
  branches jsonb;
  branch jsonb;
  if_action_const text;
  if_action_enum jsonb;
  then_required jsonb;
  action_value text;
  x_action_required jsonb := '{}'::jsonb;
  existing_x jsonb;
BEGIN
  IF td IS NULL OR jsonb_typeof(td) <> 'object' THEN
    RETURN td;
  END IF;

  params := td #> '{function,parameters}';
  IF params IS NULL OR jsonb_typeof(params) <> 'object' THEN
    RETURN td;
  END IF;

  -- If no allOf/oneOf/anyOf at top level, nothing to do
  IF NOT (params ? 'allOf' OR params ? 'oneOf' OR params ? 'anyOf') THEN
    RETURN td;
  END IF;

  existing_x := COALESCE(params -> 'x-action-required', '{}'::jsonb);
  x_action_required := existing_x;

  -- Walk allOf branches, harvest if/then required arrays keyed by action const/enum
  branches := params -> 'allOf';
  IF branches IS NOT NULL AND jsonb_typeof(branches) = 'array' THEN
    FOR branch IN SELECT * FROM jsonb_array_elements(branches)
    LOOP
      if_action_const := branch #>> '{if,properties,action,const}';
      if_action_enum  := branch #>  '{if,properties,action,enum}';
      then_required   := branch #>  '{then,required}';

      IF then_required IS NOT NULL AND jsonb_typeof(then_required) = 'array' THEN
        IF if_action_const IS NOT NULL THEN
          x_action_required := jsonb_set(
            x_action_required,
            ARRAY[if_action_const],
            COALESCE(x_action_required -> if_action_const, '[]'::jsonb) || (then_required - 'action'),
            true
          );
        ELSIF if_action_enum IS NOT NULL AND jsonb_typeof(if_action_enum) = 'array' THEN
          FOR action_value IN SELECT jsonb_array_elements_text(if_action_enum)
          LOOP
            x_action_required := jsonb_set(
              x_action_required,
              ARRAY[action_value],
              COALESCE(x_action_required -> action_value, '[]'::jsonb) || (then_required - 'action'),
              true
            );
          END LOOP;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Strip the unsafe keywords
  params := params - 'allOf' - 'oneOf' - 'anyOf' - 'if' - 'then' - 'else';

  -- Attach harvested map (only if non-empty)
  IF x_action_required <> '{}'::jsonb THEN
    params := jsonb_set(params, ARRAY['x-action-required'], x_action_required, true);
  END IF;

  RETURN jsonb_set(td, ARRAY['function','parameters'], params, true);
END;
$$;

-- Apply to all skills that currently have unsafe keywords
UPDATE public.agent_skills
SET tool_definition = public._flatten_skill_schema(tool_definition)
WHERE tool_definition #> '{function,parameters,allOf}' IS NOT NULL
   OR tool_definition #> '{function,parameters,oneOf}' IS NOT NULL
   OR tool_definition #> '{function,parameters,anyOf}' IS NOT NULL;

-- Helper stays around so future bootstraps can re-apply if needed
COMMENT ON FUNCTION public._flatten_skill_schema(jsonb) IS
  'Removes top-level allOf/oneOf/anyOf/if/then/else from a skill tool_definition and harvests action-discriminator required fields into x-action-required. Used to keep schemas compatible with OpenAI gpt-4.1 strict tool-calling.';
