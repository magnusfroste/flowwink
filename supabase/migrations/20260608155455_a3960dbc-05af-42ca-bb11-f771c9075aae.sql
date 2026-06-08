-- 1) lock_timesheet_period + handler repoints
CREATE TABLE IF NOT EXISTS public.timesheet_period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  notes text,
  locked_by uuid,
  locked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, period_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timesheet_period_locks TO authenticated;
GRANT ALL ON public.timesheet_period_locks TO service_role;

ALTER TABLE public.timesheet_period_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage timesheet period locks" ON public.timesheet_period_locks;
CREATE POLICY "Admins manage timesheet period locks"
  ON public.timesheet_period_locks FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.lock_timesheet_period(
  p_fiscal_year integer,
  p_period_month integer,
  p_notes text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lock_id uuid;
  _entry_count integer;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins can lock timesheet periods';
  END IF;
  IF p_fiscal_year IS NULL OR p_period_month IS NULL THEN
    RAISE EXCEPTION 'fiscal_year and period_month are required';
  END IF;
  IF p_period_month < 1 OR p_period_month > 12 THEN
    RAISE EXCEPTION 'period_month must be 1-12 (got %)', p_period_month;
  END IF;

  INSERT INTO public.timesheet_period_locks (fiscal_year, period_month, notes, locked_by)
  VALUES (p_fiscal_year, p_period_month, p_notes, auth.uid())
  ON CONFLICT (fiscal_year, period_month)
  DO UPDATE SET notes = COALESCE(EXCLUDED.notes, public.timesheet_period_locks.notes),
                locked_at = now(),
                locked_by = auth.uid()
  RETURNING id INTO _lock_id;

  SELECT count(*) INTO _entry_count
  FROM public.time_entries
  WHERE date_part('year', entry_date) = p_fiscal_year
    AND date_part('month', entry_date) = p_period_month;

  PERFORM public.emit_platform_event(
    'timesheet.period_locked',
    jsonb_build_object('fiscal_year', p_fiscal_year, 'period_month', p_period_month, 'entries_locked', _entry_count),
    'lock_timesheet_period'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'lock_id', _lock_id,
    'fiscal_year', p_fiscal_year,
    'period_month', p_period_month,
    'entries_locked', _entry_count
  );
END $function$;

UPDATE public.agent_skills
SET handler = 'rpc:lock_timesheet_period'
WHERE name = 'lock_timesheet_period';

-- 2) fix auto_mark_invoice_paid + list_pos_sales handlers
UPDATE public.agent_skills
SET handler = 'rpc:auto_mark_invoice_paid'
WHERE name = 'auto_mark_invoice_paid'
  AND handler = 'doc:auto_mark_invoice_paid';

UPDATE public.agent_skills
SET handler = 'db:pos_sales'
WHERE name = 'list_pos_sales'
  AND handler = 'edge:agent-execute';

-- 3) repair malformed tool_definitions
UPDATE public.agent_skills
SET tool_definition = jsonb_build_object(
  'type', 'function',
  'function', jsonb_build_object(
    'name', name,
    'description', COALESCE(description, name),
    'parameters', CASE
      WHEN tool_definition ? 'properties' OR tool_definition->>'type' = 'object'
        THEN tool_definition
      ELSE COALESCE(
        tool_definition->'function'->'parameters',
        '{"type":"object","properties":{}}'::jsonb
      )
    END
  )
)
WHERE (tool_definition->'function'->>'name') IS NULL
  AND tool_definition IS NOT NULL;

-- 4) sync skill descriptions with Use when: / NOT for: markers
UPDATE public.agent_skills SET description = CASE name
  WHEN 'learn_from_data' THEN 'Analyze page views, chat feedback, and lead conversions to distill learnings into persistent memory. Use when: heartbeat learning cycle; extracting insights from operational data; building institutional knowledge. NOT for: analyzing analytics directly (analyze_analytics); generating business digests (weekly_business_digest).'
  WHEN 'lookup_order' THEN 'Look up order status by order ID or customer email. Use when: a customer inquires about their order; verifying order progress; retrieving order details for support. NOT for: managing orders (manage_orders); browsing products (browse_products).'
  WHEN 'manage_automations' THEN 'Create and manage agent automations (cron jobs, event triggers, signal handlers). Use when: setting up recurring tasks; defining automatic event responses; implementing signal processing logic. NOT for: creating objectives (create_objective); processing incoming signals (process_signal).'
  WHEN 'manage_consultant_profile' THEN 'Manage consultant/resume profiles: list, create, update, delete, deduplicate. Use when: adding a new consultant; updating skills or availability; cleaning up duplicate entries. NOT for: matching consultants to jobs (match_consultant); managing company profiles (manage_company).'
  WHEN 'media_browse' THEN 'Browse, search, and manage media files in the media library. Supports listing, getting URLs, deleting files, and clearing library. Use when: finding an uploaded image; managing media assets; cleaning up unused files. NOT for: uploading new files (N/A); updating site branding logo (site_branding_update).'
  WHEN 'reset_module_data' THEN 'Removes demo/simulation data previously created by seed_module_demo (only rows registered in demo_run_items). Use when: clearing demo data before going live; resetting a module to a clean state. NOT for: deleting real customer data, templates, or KB articles — it never touches those.'
  WHEN 'scan_gmail_inbox' THEN 'Scan connected Gmail inbox for business signals — new leads, partnership inquiries, support requests. Use when: identifying incoming business opportunities from email; automating email categorization; flagging important emails. NOT for: sending emails (composio_gmail_send); managing leads directly (manage_leads).'
  WHEN 'scrape_url' THEN 'Scrape a single URL and extract content as markdown. Supports Firecrawl and Jina Reader. Use when: extracting content from a public webpage; converting web pages to markdown; needing text from an accessible URL. NOT for: accessing login-walled sites (browser_fetch); searching multiple pages (search_web).'
  WHEN 'support_assign_conversation' THEN 'Assign or reassign a support conversation to an agent. Use when: a customer query needs agent attention; re-routing a conversation to a specialist; ensuring no support ticket is unassigned. NOT for: listing conversations (support_list_conversations); getting feedback (support_get_feedback).'
  ELSE description
END
WHERE name IN (
  'learn_from_data','lookup_order','manage_automations','manage_consultant_profile',
  'media_browse','reset_module_data','scan_gmail_inbox','scrape_url','support_assign_conversation'
);