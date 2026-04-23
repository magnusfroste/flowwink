CREATE OR REPLACE FUNCTION public.auto_allocate_vacation(p_year integer, p_dry_run boolean DEFAULT false)
 RETURNS TABLE(employee_id uuid, employee_name text, allocated_days integer, carried_over_days numeric, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp RECORD;
  v_days INTEGER;
  v_max_carry INTEGER;
  v_prev_remaining NUMERIC;
  v_carry NUMERIC;
  v_existing UUID;
  v_action TEXT;
  v_run_id UUID := gen_random_uuid();
  v_total INTEGER := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can auto-allocate vacation';
  END IF;

  FOR v_emp IN
    SELECT id, name FROM public.employees WHERE status = 'active' ORDER BY name
  LOOP
    v_days := public.calculate_vacation_days(v_emp.id, p_year);

    SELECT max_carry_over_days INTO v_max_carry
    FROM public.vacation_policies
    WHERE is_active = true
    ORDER BY priority DESC LIMIT 1;
    v_max_carry := COALESCE(v_max_carry, 5);

    SELECT GREATEST(0,
      COALESCE(la.allocated_days, 0) + COALESCE(la.carried_over_days, 0)
      - COALESCE((
        SELECT SUM(days) FROM public.leave_requests
        WHERE employee_id = v_emp.id AND leave_type = 'vacation' AND status = 'approved'
          AND EXTRACT(YEAR FROM start_date)::INTEGER = p_year - 1
      ), 0)
    )
    INTO v_prev_remaining
    FROM public.leave_allocations la
    WHERE la.employee_id = v_emp.id AND la.leave_type = 'vacation' AND la.year = p_year - 1;

    v_carry := LEAST(COALESCE(v_prev_remaining, 0), v_max_carry);

    SELECT id INTO v_existing FROM public.leave_allocations
    WHERE employee_id = v_emp.id AND leave_type = 'vacation' AND year = p_year;

    v_action := CASE
      WHEN v_existing IS NOT NULL THEN (CASE WHEN p_dry_run THEN 'would_update' ELSE 'updated' END)
      ELSE (CASE WHEN p_dry_run THEN 'would_create' ELSE 'created' END)
    END;

    IF NOT p_dry_run THEN
      INSERT INTO public.leave_allocations (
        employee_id, leave_type, year, allocated_days, carried_over_days, notes
      ) VALUES (
        v_emp.id, 'vacation', p_year, v_days, v_carry,
        'Auto-allocated ' || to_char(now(), 'YYYY-MM-DD')
      )
      ON CONFLICT (employee_id, leave_type, year) DO UPDATE
      SET allocated_days = EXCLUDED.allocated_days,
          carried_over_days = EXCLUDED.carried_over_days,
          notes = EXCLUDED.notes,
          updated_at = now();

      INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
      VALUES (
        'vacation.auto_allocated',
        'employee',
        v_emp.id,
        auth.uid(),
        jsonb_build_object(
          'run_id', v_run_id,
          'year', p_year,
          'employee_name', v_emp.name,
          'allocated_days', v_days,
          'carried_over_days', v_carry,
          'max_carry_over_cap', v_max_carry,
          'previous_year_remaining', v_prev_remaining,
          'action', v_action
        )
      );
      v_total := v_total + 1;
    END IF;

    employee_id := v_emp.id;
    employee_name := v_emp.name;
    allocated_days := v_days;
    carried_over_days := v_carry;
    action := v_action;
    RETURN NEXT;
  END LOOP;

  IF NOT p_dry_run AND v_total > 0 THEN
    INSERT INTO public.audit_logs (action, entity_type, user_id, metadata)
    VALUES (
      'vacation.auto_allocate_run',
      'leave_allocation',
      auth.uid(),
      jsonb_build_object('run_id', v_run_id, 'year', p_year, 'employees_processed', v_total)
    );
  END IF;
END;
$function$;

INSERT INTO public.agent_skills (
  name, description, category, handler, scope, tool_definition, instructions, enabled, mcp_exposed
) VALUES (
  'auto_allocate_vacation',
  'Allocate annual vacation days for all active employees at year-end based on age/tenure policies, including capped carry-over from previous year. Use when: rolling over to a new fiscal year, onboarding HR module mid-year. NOT for: per-employee manual adjustments (use manage_leave or upsert leave_allocations directly).',
  'crm',
  'rpc:auto_allocate_vacation',
  'internal',
  jsonb_build_object(
    'type', 'function',
    'function', jsonb_build_object(
      'name', 'auto_allocate_vacation',
      'description', 'Bulk-allocate vacation days for a fiscal year based on active vacation_policies; writes audit log per employee.',
      'parameters', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'p_year', jsonb_build_object('type', 'integer', 'description', 'Fiscal year to allocate, e.g. 2026'),
          'p_dry_run', jsonb_build_object('type', 'boolean', 'description', 'If true, returns preview without writing')
        ),
        'required', jsonb_build_array('p_year')
      )
    )
  ),
  'Run once per year (typically January 1st) or whenever vacation_policies change. Always preview with p_dry_run=true first. Writes one audit_logs row per employee (action=vacation.auto_allocated) plus a run summary row (action=vacation.auto_allocate_run). Admin-only.',
  true,
  true
) ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    handler = EXCLUDED.handler,
    tool_definition = EXCLUDED.tool_definition,
    instructions = EXCLUDED.instructions,
    enabled = true,
    mcp_exposed = true,
    updated_at = now();