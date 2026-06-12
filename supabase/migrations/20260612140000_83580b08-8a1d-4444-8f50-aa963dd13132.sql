-- Sprint P1 Subscribe-to-Renew · P1.1 (docs/parity/sprint-p1-subscribe-to-renew.md):
-- Proration on mid-cycle change. change_subscription updates quantity and/or
-- unit price on a manual (invoice-billed) subscription and — when the change is
-- mid-period — creates a prorated adjustment:
--   upgrade   → adjustment invoice for delta × remaining-period fraction
--   downgrade → credit_cents returned + recorded on the subscription metadata
--               (no negative invoices in v1; apply the credit on the next cycle
--               manually or via the noted amount)
-- Mirrors generate_subscription_invoice's invoice shape. Idempotent.

CREATE OR REPLACE FUNCTION "public"."change_subscription"(
  "p_subscription_id" "uuid",
  "p_new_quantity" integer DEFAULT NULL,
  "p_new_unit_amount_cents" integer DEFAULT NULL,
  "p_generate_adjustment" boolean DEFAULT true,
  "p_tax_rate" numeric DEFAULT 0.25
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
  _old_per_period bigint;
  _new_per_period bigint;
  _delta bigint;
  _fraction numeric;
  _prorated bigint;
  _invoice_id uuid;
  _invoice_number text;
  _tax integer;
  _total integer;
  _line jsonb;
  _total_days numeric;
  _remaining_days numeric;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can change subscriptions';
  END IF;
  IF p_new_quantity IS NULL AND p_new_unit_amount_cents IS NULL THEN
    RAISE EXCEPTION 'Provide p_new_quantity and/or p_new_unit_amount_cents';
  END IF;
  IF p_new_quantity IS NOT NULL AND p_new_quantity < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1 (cancel instead of zeroing)';
  END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', p_subscription_id; END IF;
  IF _sub.provider <> 'manual' THEN
    RAISE EXCEPTION 'change_subscription only applies to manual subscriptions (got %); card subscriptions change at the provider', _sub.provider;
  END IF;
  IF _sub.status <> 'active'::subscription_status THEN
    RAISE EXCEPTION 'Cannot change subscription in status %', _sub.status;
  END IF;

  _old_per_period := _sub.unit_amount_cents::bigint * COALESCE(_sub.quantity, 1);
  _new_per_period := COALESCE(p_new_unit_amount_cents, _sub.unit_amount_cents)::bigint
                   * COALESCE(p_new_quantity, _sub.quantity, 1);
  _delta := _new_per_period - _old_per_period;

  -- Remaining-period fraction (days-based); 0 when period boundaries are unknown
  IF _sub.current_period_start IS NOT NULL AND _sub.current_period_end IS NOT NULL
     AND _sub.current_period_end > _sub.current_period_start THEN
    _total_days := EXTRACT(EPOCH FROM (_sub.current_period_end - _sub.current_period_start)) / 86400.0;
    _remaining_days := GREATEST(EXTRACT(EPOCH FROM (_sub.current_period_end - now())) / 86400.0, 0);
    _fraction := LEAST(_remaining_days / _total_days, 1);
  ELSE
    _fraction := 0;
  END IF;

  _prorated := round(_delta * _fraction);

  UPDATE public.subscriptions
     SET quantity = COALESCE(p_new_quantity, quantity),
         unit_amount_cents = COALESCE(p_new_unit_amount_cents, unit_amount_cents),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'last_change', jsonb_build_object(
             'at', now(), 'old_per_period_cents', _old_per_period,
             'new_per_period_cents', _new_per_period,
             'prorated_cents', _prorated, 'fraction', round(_fraction::numeric, 4)))
   WHERE id = p_subscription_id;

  -- Upgrade mid-period: prorated adjustment invoice
  IF _prorated > 0 AND p_generate_adjustment THEN
    _tax := round(_prorated * COALESCE(p_tax_rate, 0.25))::integer;
    _total := _prorated + _tax;
    _invoice_number := 'SUB-ADJ-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');
    _line := jsonb_build_array(jsonb_build_object(
      'description', 'Prorated adjustment: ' || _sub.product_name || ' (' ||
        round(_fraction * 100) || '% of period remaining)',
      'quantity', 1,
      'unit_price_cents', _prorated,
      'total_cents', _prorated
    ));
    INSERT INTO public.invoices (
      invoice_number, customer_email, customer_name, status, line_items,
      subtotal_cents, tax_rate, tax_cents, total_cents, currency,
      due_date, issue_date, payment_terms, notes
    ) VALUES (
      _invoice_number, _sub.customer_email, _sub.customer_name, 'draft'::invoice_status, _line,
      _prorated::integer, COALESCE(p_tax_rate, 0.25), _tax, _total, upper(_sub.currency),
      CURRENT_DATE + 30, CURRENT_DATE, 'Net 30 days',
      'Prorated adjustment for subscription ' || _sub.id::text
    ) RETURNING id INTO _invoice_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'old_per_period_cents', _old_per_period,
    'new_per_period_cents', _new_per_period,
    'remaining_fraction', round(_fraction::numeric, 4),
    'prorated_cents', _prorated,
    'adjustment_invoice_id', _invoice_id,
    'credit_cents', CASE WHEN _prorated < 0 THEN -_prorated ELSE 0 END,
    'note', CASE WHEN _prorated < 0 THEN 'Downgrade credit recorded on subscription metadata — apply on next invoice' ELSE NULL END
  );
END $$;
ALTER FUNCTION "public"."change_subscription"("uuid",integer,integer,boolean,numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."change_subscription"("uuid",integer,integer,boolean,numeric) TO "anon", "authenticated", "service_role";
