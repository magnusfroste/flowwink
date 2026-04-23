
-- 1. bulk_invoice_from_timesheets
CREATE OR REPLACE FUNCTION public.bulk_invoice_from_timesheets(
  p_project_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'entry',
  p_due_days INTEGER DEFAULT 30
)
RETURNS TABLE(invoice_id UUID, invoice_number TEXT, line_count INTEGER, total_cents BIGINT, hours_billed NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_project public.projects;
  v_invoice_id UUID;
  v_invoice_num TEXT;
  v_line_items JSONB := '[]'::jsonb;
  v_subtotal BIGINT := 0;
  v_tax_rate NUMERIC := 0.25;
  v_tax_cents BIGINT;
  v_total_hours NUMERIC := 0;
  v_line_count INTEGER := 0;
  v_count INTEGER;
  v_entry RECORD;
  v_entry_ids UUID[] := '{}';
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'approver'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins/approvers can bulk-invoice timesheets';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF v_project.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF NOT v_project.is_billable THEN RAISE EXCEPTION 'Project is not billable'; END IF;
  IF COALESCE(v_project.hourly_rate_cents, 0) <= 0 THEN RAISE EXCEPTION 'Project has no hourly rate set'; END IF;

  IF p_group_by = 'user' THEN
    FOR v_entry IN
      SELECT te.user_id, COALESCE(e.name, 'User') AS user_name, SUM(te.hours) AS total_hours, ARRAY_AGG(te.id) AS ids
      FROM public.time_entries te
      LEFT JOIN public.employees e ON e.user_id = te.user_id
      WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date
        AND te.is_billable = true AND te.is_invoiced = false
      GROUP BY te.user_id, e.name
    LOOP
      v_line_items := v_line_items || jsonb_build_object(
        'description', v_entry.user_name || ' — hours ' || to_char(p_start_date,'YYYY-MM-DD') || ' to ' || to_char(p_end_date,'YYYY-MM-DD'),
        'qty', v_entry.total_hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.total_hours * v_project.hourly_rate_cents);
      v_total_hours := v_total_hours + v_entry.total_hours;
      v_line_count := v_line_count + 1;
      v_entry_ids := v_entry_ids || v_entry.ids;
    END LOOP;
  ELSIF p_group_by = 'week' THEN
    FOR v_entry IN
      SELECT date_trunc('week', te.entry_date)::date AS week_start, SUM(te.hours) AS total_hours, ARRAY_AGG(te.id) AS ids
      FROM public.time_entries te
      WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date
        AND te.is_billable = true AND te.is_invoiced = false
      GROUP BY date_trunc('week', te.entry_date) ORDER BY week_start
    LOOP
      v_line_items := v_line_items || jsonb_build_object(
        'description', 'Week of ' || to_char(v_entry.week_start, 'YYYY-MM-DD'),
        'qty', v_entry.total_hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.total_hours * v_project.hourly_rate_cents);
      v_total_hours := v_total_hours + v_entry.total_hours;
      v_line_count := v_line_count + 1;
      v_entry_ids := v_entry_ids || v_entry.ids;
    END LOOP;
  ELSE
    FOR v_entry IN
      SELECT te.id, te.entry_date, te.hours, te.description
      FROM public.time_entries te
      WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date
        AND te.is_billable = true AND te.is_invoiced = false
      ORDER BY te.entry_date
    LOOP
      v_line_items := v_line_items || jsonb_build_object(
        'description', to_char(v_entry.entry_date,'YYYY-MM-DD') || ' — ' || COALESCE(v_entry.description, 'Hours'),
        'qty', v_entry.hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.hours * v_project.hourly_rate_cents);
      v_total_hours := v_total_hours + v_entry.hours;
      v_line_count := v_line_count + 1;
      v_entry_ids := v_entry_ids || v_entry.id;
    END LOOP;
  END IF;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'No billable, uninvoiced hours found for project in given period';
  END IF;

  v_tax_cents := ROUND(v_subtotal * v_tax_rate);
  SELECT COUNT(*) INTO v_count FROM public.invoices;
  v_invoice_num := 'INV-' || LPAD((v_count + 1)::TEXT, 5, '0');

  INSERT INTO public.invoices (
    invoice_number, customer_name, project_id, line_items,
    subtotal_cents, tax_rate, tax_cents, total_cents,
    currency, issue_date, due_date, status, created_by, notes)
  VALUES (
    v_invoice_num, COALESCE(v_project.client_name, v_project.name), p_project_id, v_line_items,
    v_subtotal, v_tax_rate, v_tax_cents, v_subtotal + v_tax_cents,
    v_project.currency, CURRENT_DATE, CURRENT_DATE + p_due_days, 'draft', auth.uid(),
    'Auto-generated from timesheets ' || p_start_date || ' → ' || p_end_date)
  RETURNING id INTO v_invoice_id;

  UPDATE public.time_entries
  SET is_invoiced = true, invoice_id = v_invoice_id, updated_at = now()
  WHERE id = ANY(v_entry_ids);

  invoice_id := v_invoice_id;
  invoice_number := v_invoice_num;
  line_count := v_line_count;
  total_cents := v_subtotal + v_tax_cents;
  hours_billed := v_total_hours;
  RETURN NEXT;
END;
$$;

-- 2. send_dunning_reminders
CREATE OR REPLACE FUNCTION public.send_dunning_reminders(p_dry_run BOOLEAN DEFAULT false)
RETURNS TABLE(invoice_id UUID, invoice_number TEXT, customer_email TEXT, days_overdue INTEGER, dunning_step TEXT, total_cents BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inv RECORD; v_step TEXT; v_days INTEGER;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'approver'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins/approvers can send dunning reminders';
  END IF;

  FOR v_inv IN
    SELECT i.id, i.invoice_number, i.customer_email, i.due_date, i.total_cents, i.status
    FROM public.invoices i
    WHERE i.status IN ('sent', 'overdue') AND i.due_date < CURRENT_DATE AND i.paid_at IS NULL
    ORDER BY i.due_date ASC
  LOOP
    v_days := (CURRENT_DATE - v_inv.due_date)::INTEGER;
    v_step := CASE
      WHEN v_days >= 30 THEN 'final_notice'
      WHEN v_days >= 14 THEN 'formal_reminder'
      WHEN v_days >= 7  THEN 'friendly_reminder'
      ELSE 'pre_reminder' END;

    IF NOT p_dry_run THEN
      UPDATE public.invoices SET status = 'overdue', updated_at = now()
      WHERE id = v_inv.id AND status = 'sent';

      INSERT INTO public.dunning_actions (invoice_id, step_name, action_type, status, executed_at, metadata)
      SELECT v_inv.id, v_step, 'email', 'sent', now(),
             jsonb_build_object('days_overdue', v_days, 'auto', true)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.dunning_actions
        WHERE invoice_id = v_inv.id AND step_name = v_step AND executed_at::date = CURRENT_DATE
      );
    END IF;

    invoice_id := v_inv.id;
    invoice_number := v_inv.invoice_number;
    customer_email := v_inv.customer_email;
    days_overdue := v_days;
    dunning_step := v_step;
    total_cents := v_inv.total_cents;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 3. auto_mark_invoice_paid trigger
CREATE OR REPLACE FUNCTION public.auto_mark_invoice_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_invoice public.invoices; v_total_matched BIGINT;
BEGIN
  IF NEW.entity_type <> 'invoice' OR NEW.entity_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.entity_id;
  IF v_invoice.id IS NULL OR v_invoice.status = 'paid' THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(ABS(amount_cents)), 0) INTO v_total_matched
  FROM public.reconciliation_matches
  WHERE entity_type = 'invoice' AND entity_id = NEW.entity_id;

  IF v_total_matched >= v_invoice.total_cents THEN
    UPDATE public.invoices SET status = 'paid', paid_at = now(), updated_at = now()
    WHERE id = NEW.entity_id AND status <> 'paid';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_mark_invoice_paid ON public.reconciliation_matches;
CREATE TRIGGER trg_auto_mark_invoice_paid
  AFTER INSERT OR UPDATE ON public.reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION public.auto_mark_invoice_paid();

-- 4. Add unique constraint on agent_skills.name (idempotent) so seeds can upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_skills_name_key'
  ) THEN
    -- Dedupe before adding constraint
    DELETE FROM public.agent_skills a USING public.agent_skills b
    WHERE a.id < b.id AND a.name = b.name;
    ALTER TABLE public.agent_skills ADD CONSTRAINT agent_skills_name_key UNIQUE (name);
  END IF;
END $$;

-- 5. Seed MCP skills (now safe with unique constraint)
INSERT INTO public.agent_skills (name, description, category, handler, scope, mcp_exposed, tool_definition, instructions)
VALUES
  ('bulk_invoice_from_timesheets',
   'Bulk-generate invoice draft from billable, uninvoiced time entries for a project + period. Use when: month-end billing, "skapa månadsfaktura från timmar". NOT for: single manual invoices (use manage_invoice).',
   'commerce', 'rpc:bulk_invoice_from_timesheets', 'external', true,
   jsonb_build_object('type','function','function', jsonb_build_object(
     'name','bulk_invoice_from_timesheets',
     'description','Aggregate billable hours into one invoice draft',
     'parameters', jsonb_build_object('type','object',
       'properties', jsonb_build_object(
         'project_id', jsonb_build_object('type','string'),
         'start_date', jsonb_build_object('type','string','description','YYYY-MM-DD'),
         'end_date', jsonb_build_object('type','string','description','YYYY-MM-DD'),
         'group_by', jsonb_build_object('type','string','enum', jsonb_build_array('entry','user','week')),
         'due_days', jsonb_build_object('type','integer','description','Default 30')),
       'required', jsonb_build_array('project_id','start_date','end_date')))),
   'Calls RPC bulk_invoice_from_timesheets. Marks each used time_entry as invoiced. Creates invoice in draft status.'),

  ('send_dunning_reminders',
   'Sweep overdue invoices and dispatch graduated dunning (friendly 7d, formal 14d, final 30d). Use when: daily AR run, "kör påminnelser". NOT for: single invoice reminders.',
   'commerce', 'rpc:send_dunning_reminders', 'external', true,
   jsonb_build_object('type','function','function', jsonb_build_object(
     'name','send_dunning_reminders',
     'description','Run dunning sweep across all overdue invoices',
     'parameters', jsonb_build_object('type','object',
       'properties', jsonb_build_object(
         'dry_run', jsonb_build_object('type','boolean','description','Preview without writing, default false'))))),
   'Returns one row per overdue invoice with assigned dunning step. Logs to dunning_actions and flips sent→overdue. Idempotent per step per day.'),

  ('auto_mark_invoice_paid',
   'Reference: when a bank tx is reconciled to an invoice covering full total, the invoice flips to paid automatically via trigger. Read-only / informational.',
   'commerce', 'doc:auto_mark_invoice_paid', 'external', true,
   jsonb_build_object('type','function','function', jsonb_build_object(
     'name','auto_mark_invoice_paid',
     'description','Documentation of the auto-paid trigger behavior',
     'parameters', jsonb_build_object('type','object','properties', jsonb_build_object()))),
   'Trigger trg_auto_mark_invoice_paid runs on reconciliation_matches AFTER INSERT/UPDATE. No direct invocation — automatic.')
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  tool_definition = EXCLUDED.tool_definition,
  instructions = EXCLUDED.instructions,
  handler = EXCLUDED.handler,
  scope = EXCLUDED.scope,
  category = EXCLUDED.category,
  mcp_exposed = true,
  updated_at = now();
