DO $$
DECLARE
  r RECORD;
  new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN
      SELECT jobid, jobname, schedule, command FROM cron.job
       WHERE command LIKE '%/functions/v1/send-booking-reminders%'
          OR command LIKE '%/functions/v1/send-calendar-reminders%'
          OR command LIKE '%/functions/v1/csat-dispatch%'
          OR command LIKE '%/functions/v1/send-webinar-reminders%'
          OR command LIKE '%/functions/v1/survey-send%'
          OR command LIKE '%/functions/v1/send-order-confirmation%'
    LOOP
      new_cmd := replace(replace(replace(replace(replace(replace(r.command,
        '/functions/v1/send-booking-reminders',  '/functions/v1/comms-send?kind=booking_reminders'),
        '/functions/v1/send-calendar-reminders', '/functions/v1/comms-send?kind=calendar_reminders'),
        '/functions/v1/csat-dispatch',           '/functions/v1/comms-send?kind=csat_dispatch'),
        '/functions/v1/send-webinar-reminders',  '/functions/v1/comms-send?kind=webinar_reminders'),
        '/functions/v1/survey-send',             '/functions/v1/comms-send?kind=survey_send'),
        '/functions/v1/send-order-confirmation', '/functions/v1/comms-send?kind=order_confirmation');
      PERFORM cron.unschedule(r.jobid);
      PERFORM cron.schedule(r.jobname, r.schedule, new_cmd);
      RAISE NOTICE 'repointed cron job % to comms-send', r.jobname;
    END LOOP;
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
  new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN
      SELECT jobid, jobname, schedule, command FROM cron.job
       WHERE command LIKE '%/functions/v1/flowpilot-learn%'
          OR command LIKE '%/functions/v1/flowpilot-followthrough%'
          OR command LIKE '%/functions/v1/flowpilot-briefing%'
          OR command LIKE '%/functions/v1/flowpilot-distill%'
          OR command LIKE '%/functions/v1/skill-curator%'
          OR command LIKE '%/functions/v1/cron-health%'
    LOOP
      new_cmd := replace(replace(replace(replace(replace(replace(r.command,
        '/functions/v1/flowpilot-learn',         '/functions/v1/flowpilot-lifecycle?task=learn'),
        '/functions/v1/flowpilot-followthrough', '/functions/v1/flowpilot-lifecycle?task=followthrough'),
        '/functions/v1/flowpilot-briefing',      '/functions/v1/flowpilot-lifecycle?task=briefing'),
        '/functions/v1/flowpilot-distill',       '/functions/v1/flowpilot-lifecycle?task=distill'),
        '/functions/v1/skill-curator',           '/functions/v1/flowpilot-lifecycle?task=curator'),
        '/functions/v1/cron-health',             '/functions/v1/instance-health?check=cron');
      PERFORM cron.unschedule(r.jobid);
      PERFORM cron.schedule(r.jobname, r.schedule, new_cmd);
      RAISE NOTICE 'repointed cron job % to flowpilot-lifecycle', r.jobname;
    END LOOP;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'auth' AND c.relname = 'users'
       AND NOT t.tgisinternal
       AND t.tgfoid = 'public.handle_new_user'::regproc
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    RAISE NOTICE 'created on_auth_user_created trigger on auth.users';
  END IF;
END $$;

INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data ->> 'full_name', u.email)
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
       CASE COALESCE(u.raw_user_meta_data ->> 'signup_type', 'admin')
         WHEN 'customer' THEN 'customer'::app_role
         WHEN 'admin'    THEN 'admin'::app_role
         ELSE 'writer'::app_role
       END
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.service_order_to_invoice(
  p_order_id uuid,
  p_due_in_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.service_orders%ROWTYPE;
  v_invoice_id uuid;
  v_invoice_number text;
  v_lines jsonb;
  v_subtotal_cents integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Only staff can create invoices from service orders';
  END IF;

  SELECT * INTO v_order FROM public.service_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service order % not found', p_order_id; END IF;

  IF v_order.invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'invoice_id', v_order.invoice_id,
      'already_linked', true,
      'invoice_number', (SELECT invoice_number FROM public.invoices WHERE id = v_order.invoice_id));
  END IF;

  IF v_order.customer_email IS NULL THEN
    RAISE EXCEPTION 'customer_email is required on the service order';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'description', l.description,
      'quantity', l.quantity,
      'unit_price_cents', round(l.unit_price * 100)::integer,
      'total_cents', round(COALESCE(l.total, l.quantity * l.unit_price) * 100)::integer
    ) ORDER BY l.position), '[]'::jsonb),
    COALESCE(sum(round(COALESCE(l.total, l.quantity * l.unit_price) * 100)::integer), 0)
  INTO v_lines, v_subtotal_cents
  FROM public.service_order_lines l WHERE l.service_order_id = p_order_id;

  IF v_subtotal_cents = 0 THEN
    RAISE EXCEPTION 'Service order % has no billable lines', v_order.order_number;
  END IF;

  v_invoice_number := 'SO-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');

  INSERT INTO public.invoices
    (invoice_number, customer_email, customer_name, status, line_items,
     subtotal_cents, tax_rate, tax_cents, total_cents, currency,
     due_date, issue_date, payment_terms, notes)
  VALUES
    (v_invoice_number, v_order.customer_email, v_order.customer_name, 'draft', v_lines,
     v_subtotal_cents, 0, 0, v_subtotal_cents, COALESCE(v_order.currency,'SEK'),
     CURRENT_DATE + COALESCE(p_due_in_days,30), CURRENT_DATE,
     'Net ' || COALESCE(p_due_in_days,30) || ' days',
     'Generated from service order ' || v_order.order_number)
  RETURNING id INTO v_invoice_id;

  UPDATE public.service_orders SET invoice_id = v_invoice_id WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number, 'service_order_id', p_order_id,
    'total_cents', v_subtotal_cents);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.service_order_to_invoice(uuid, integer) TO authenticated, service_role;

UPDATE public.agent_automations
   SET skill_name = 'service_order_to_invoice'
 WHERE skill_name = 'create_invoice_from_service_order';