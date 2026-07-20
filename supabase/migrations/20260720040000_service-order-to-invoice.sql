-- service_order_to_invoice — the skill the field-service automation has been
-- calling since it was written, and which never existed.
--
-- Platform-health finding (2026-07-20, rebuilt demo): the health test reported
-- "1 automations reference missing skills:
--  invoice_completed_service_orders→create_invoice_from_service_order".
-- Genuine, not a false positive: 1 of 23 automation seeds pointed at a name
-- with no skill seed, no RPC and no DB row anywhere. The automation fires on
-- service_order.completed — an event manage_service_order really does emit —
-- so every completed service order kicked off an automation that could only
-- fail. The module even advertises "auto-generate invoices on completion".
--
-- Modelled on pos_sale_to_invoice (same shape: source document → draft
-- invoice), including its staff-or-service_role gate and its
-- already-linked short-circuit, which makes re-runs idempotent — required,
-- since an event-triggered automation may fire more than once.

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
  -- Agent-callable: the MCP gateway runs RPC skills with the service key, so
  -- auth.uid() is NULL there — hence the service_role escape.
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Only staff can create invoices from service orders';
  END IF;

  SELECT * INTO v_order FROM public.service_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service order % not found', p_order_id; END IF;

  -- Idempotent: an event automation can fire repeatedly for the same order.
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

-- Repoint the seeded automation on instances that already carry the dangling
-- name (idempotent; new installs get the corrected seed from the module).
UPDATE public.agent_automations
   SET skill_name = 'service_order_to_invoice'
 WHERE skill_name = 'create_invoice_from_service_order';
