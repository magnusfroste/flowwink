-- Register consultant check-in skill
-- Allows FlowPilot to update a consultant's own profile during check-in.
-- Scope 'external' so it's available in public/visitor chat (check-in mode).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'consultant_checkin_update') THEN
    INSERT INTO public.agent_skills (
      name, description, handler, category, scope,
      requires_approval, enabled, instructions, tool_definition
    ) VALUES (
      'consultant_checkin_update',
      'Update a consultant''s own profile during a check-in interview. Updates bio, summary, skills, availability, and experience.',
      'module:resume',
      'content',
      'external',
      false,
      true,
      E'# Consultant Check-in Update\n\nCall this after gathering enough information from the consultant (3-5 exchanges).\n\n## Fields\n- **profile_id** (required): the consultant''s UUID\n- **bio**: short personal summary\n- **summary**: longer professional summary including latest project\n- **skills**: array of skill strings e.g. ["React","TypeScript","AWS"]\n- **availability**: "available", "unavailable", or "soon"\n- **experience_years**: total years of experience\n- **experience_json**: array of experience objects [{title, company, start_date, end_date, description}]\n\nOnly include fields you have information about.',
      '{"type":"function","function":{"name":"consultant_checkin_update","description":"Save updated consultant profile information gathered during a check-in interview.","parameters":{"type":"object","properties":{"profile_id":{"type":"string","description":"The consultant UUID"},"bio":{"type":"string","description":"Short personal bio"},"summary":{"type":"string","description":"Professional summary including latest project and highlights"},"skills":{"type":"array","items":{"type":"string"},"description":"List of skills and technologies"},"availability":{"type":"string","enum":["available","unavailable","soon"],"description":"Current availability status"},"experience_years":{"type":"number","description":"Total years of professional experience"},"experience_json":{"type":"array","description":"Work experience entries","items":{"type":"object","properties":{"title":{"type":"string"},"company":{"type":"string"},"start_date":{"type":"string"},"end_date":{"type":"string"},"description":{"type":"string"}}}}},"required":["profile_id"]}}}'::jsonb
    );
  END IF;
END $$;
