
-- ============================================================================
-- Subscriptions parity r7: plan templates + trial conversion + commitment lock-in
-- ============================================================================

-- 1) PLAN TEMPLATES ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  unit_amount_cents integer NOT NULL CHECK (unit_amount_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  billing_interval text NOT NULL DEFAULT 'month',
  billing_interval_count integer NOT NULL DEFAULT 1 CHECK (billing_interval_count > 0),
  trial_days integer NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  commitment_months integer NOT NULL DEFAULT 0 CHECK (commitment_months >= 0),
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscription_plans_all_auth" ON public.subscription_plans;
CREATE POLICY "subscription_plans_all_auth" ON public.subscription_plans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) EXTEND subscriptions with plan + commitment columns --------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS commitment_start date;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS commitment_months integer;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS commitment_end date;
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_commitment_end ON public.subscriptions(commitment_end);

-- 3) EXTEND create_manual_subscription --------------------------------------
-- Adds _plan_id, _trial_days, _commitment_months. Plan fills product/amount/interval
-- when the caller omits them (or leaves defaults). Trial starts subscription in
-- 'trialing' with next_invoice_date pushed to trial end. Commitment computes
-- commitment_end = start + commitment_months and stores commitment_start/_months.
DROP FUNCTION IF EXISTS public.create_manual_subscription(text, text, text, integer, text, text, integer, integer, text, date, text, text, uuid, boolean, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.create_manual_subscription(text, text, text, integer, text, text, integer, integer, text, date, text, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.create_manual_subscription(
  _customer_email text,
  _customer_name text,
  _product_name text DEFAULT NULL,
  _unit_amount_cents integer DEFAULT NULL,
  _currency text DEFAULT 'EUR',
  _billing_interval text DEFAULT 'month',
  _billing_interval_count integer DEFAULT 1,
  _quantity integer DEFAULT 1,
  _payment_terms text DEFAULT 'invoice_30',
  _start_date date DEFAULT CURRENT_DATE,
  _billing_contact_email text DEFAULT NULL,
  _po_number text DEFAULT NULL,
  _product_id uuid DEFAULT NULL,
  _auto_finalize boolean DEFAULT false,
  _plan_id uuid DEFAULT NULL,
  _trial_days integer DEFAULT 0,
  _commitment_months integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
  _plan public.subscription_plans%ROWTYPE;
  _amount integer := _unit_amount_cents;
  _pname text := _product_name;
  _cur text := lower(_currency);
  _int text := lower(_billing_interval);
  _intc integer := GREATEST(1, _billing_interval_count);
  _pid uuid := _product_id;
  _trial integer := GREATEST(0, COALESCE(_trial_days, 0));
  _commit integer := GREATEST(0, COALESCE(_commitment_months, 0));
  _lead record;
  _resolved record;
  _pricelist uuid;
  _first_invoice date := _start_date;
  _status public.subscription_status := 'active'::public.subscription_status;
  _trial_start_ts timestamptz := NULL;
  _trial_end_ts timestamptz := NULL;
  _commit_end date := NULL;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only admins can create manual subscriptions';
  END IF;
  IF _customer_email IS NULL OR length(trim(_customer_email)) = 0 THEN
    RAISE EXCEPTION 'customer_email is required';
  END IF;

  -- Load plan (if given) and fill missing fields
  IF _plan_id IS NOT NULL THEN
    SELECT * INTO _plan FROM public.subscription_plans WHERE id = _plan_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plan % not found', _plan_id; END IF;
    _pname := COALESCE(NULLIF(trim(_pname), ''), _plan.product_name);
    IF _amount IS NULL THEN _amount := _plan.unit_amount_cents; END IF;
    IF _pid IS NULL THEN _pid := _plan.product_id; END IF;
    -- Only override currency/interval if caller left defaults
    IF _currency = 'EUR' THEN _cur := lower(_plan.currency); END IF;
    IF _billing_interval = 'month' THEN _int := lower(_plan.billing_interval); END IF;
    IF _billing_interval_count = 1 THEN _intc := GREATEST(1, _plan.billing_interval_count); END IF;
    IF _trial = 0 THEN _trial := _plan.trial_days; END IF;
    IF _commit = 0 THEN _commit := _plan.commitment_months; END IF;
  END IF;

  IF _pname IS NULL OR length(trim(_pname)) = 0 THEN
    RAISE EXCEPTION 'product_name is required (either directly or via plan_id)';
  END IF;

  -- Resolve amount via pricelist if still missing
  IF _amount IS NULL THEN
    IF _pid IS NULL THEN
      RAISE EXCEPTION 'unit_amount_cents is required unless product_id or plan_id supplies price';
    END IF;
    SELECT l.id, l.company_id INTO _lead
    FROM public.leads l WHERE lower(l.email) = lower(trim(_customer_email))
    ORDER BY l.created_at DESC LIMIT 1;
    SELECT r.price_cents, r.pricelist_id INTO _resolved
    FROM public.resolve_pricelist_price(_pid, _lead.id, _lead.company_id,
      GREATEST(1,_quantity)::numeric, _start_date, upper(_cur)) r;
    _amount := _resolved.price_cents;
    _pricelist := _resolved.pricelist_id;
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'unit_amount_cents must be > 0';
  END IF;

  -- Trial handling
  IF _trial > 0 THEN
    _status := 'trialing'::public.subscription_status;
    _trial_start_ts := _start_date::timestamptz;
    _trial_end_ts := (_start_date + (_trial || ' days')::interval)::timestamptz;
    _first_invoice := (_start_date + (_trial || ' days')::interval)::date;
  END IF;

  -- Commitment handling
  IF _commit > 0 THEN
    _commit_end := (_start_date + (_commit || ' months')::interval)::date;
  END IF;

  INSERT INTO public.subscriptions (
    customer_email, customer_name, product_name, product_id, plan_id,
    unit_amount_cents, currency, quantity,
    billing_interval, billing_interval_count,
    payment_terms, billing_contact_email, po_number,
    provider, status,
    current_period_start, current_period_end, next_invoice_date,
    trial_start, trial_end,
    commitment_start, commitment_months, commitment_end,
    auto_finalize, metadata
  ) VALUES (
    lower(trim(_customer_email)), _customer_name, _pname, _pid, _plan_id,
    _amount, _cur, GREATEST(1, _quantity),
    _int, _intc,
    _payment_terms, _billing_contact_email, _po_number,
    'manual', _status,
    _start_date::timestamptz,
    advance_billing_date(_start_date, _int, _intc)::timestamptz,
    _first_invoice,
    _trial_start_ts, _trial_end_ts,
    CASE WHEN _commit > 0 THEN _start_date ELSE NULL END,
    NULLIF(_commit, 0),
    _commit_end,
    COALESCE(_auto_finalize, false),
    jsonb_build_object(
      'created_via', 'create_manual_subscription',
      'created_by', auth.uid(),
      'auto_finalize', COALESCE(_auto_finalize, false)
    )
    || CASE WHEN _pricelist IS NOT NULL
         THEN jsonb_build_object('pricelist_id', _pricelist, 'price_source', 'pricelist')
         ELSE '{}'::jsonb END
    || CASE WHEN _plan_id IS NOT NULL
         THEN jsonb_build_object('plan_id', _plan_id, 'plan_name', _plan.name)
         ELSE '{}'::jsonb END
  ) RETURNING id INTO _new_id;

  PERFORM public.emit_platform_event(
    'subscription.created',
    jsonb_build_object(
      'subscription_id', _new_id,
      'provider', 'manual',
      'customer_email', _customer_email,
      'auto_finalize', COALESCE(_auto_finalize, false),
      'trialing', (_trial > 0),
      'commitment_months', _commit
    ),
    'create_manual_subscription'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'subscription_id', _new_id,
    'status', _status,
    'next_invoice_date', _first_invoice,
    'trial_end', _trial_end_ts,
    'commitment_end', _commit_end,
    'unit_amount_cents', _amount,
    'plan_id', _plan_id,
    'pricelist_id', _pricelist
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.create_manual_subscription(text, text, text, integer, text, text, integer, integer, text, date, text, text, uuid, boolean, uuid, integer, integer)
  TO authenticated, service_role;

-- 4) TRIAL CONVERSION -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_trial_to_active(_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only admins can convert trials';
  END IF;
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', _subscription_id; END IF;
  IF _sub.status <> 'trialing'::public.subscription_status THEN
    RAISE EXCEPTION 'Subscription is not in trialing status (current: %)', _sub.status;
  END IF;

  UPDATE public.subscriptions
     SET status = 'active'::public.subscription_status,
         next_invoice_date = COALESCE(next_invoice_date, CURRENT_DATE),
         current_period_start = COALESCE(current_period_start, now()),
         metadata = metadata || jsonb_build_object('trial_converted_at', now(), 'trial_converted_by', auth.uid()),
         updated_at = now()
   WHERE id = _subscription_id;

  PERFORM public.emit_platform_event(
    'subscription.trial_converted',
    jsonb_build_object('subscription_id', _subscription_id),
    'convert_trial_to_active'
  );

  RETURN jsonb_build_object('ok', true, 'subscription_id', _subscription_id, 'status', 'active');
END $$;

GRANT EXECUTE ON FUNCTION public.convert_trial_to_active(uuid) TO authenticated, service_role;

-- 5) TRIAL SWEEP (auto-convert or expire) -----------------------------------
-- Convert trials whose trial_end is past AND the subscription is manual +
-- auto-finalize (they will bill nightly). Otherwise leave them for manual review.
CREATE OR REPLACE FUNCTION public.run_trial_conversions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row record;
  _converted integer := 0;
  _expired integer := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  FOR _row IN
    SELECT id, provider, auto_finalize
      FROM public.subscriptions
     WHERE status = 'trialing'::public.subscription_status
       AND trial_end IS NOT NULL
       AND trial_end <= now()
  LOOP
    IF _row.provider = 'manual' AND _row.auto_finalize THEN
      UPDATE public.subscriptions
         SET status = 'active'::public.subscription_status,
             next_invoice_date = CURRENT_DATE,
             current_period_start = COALESCE(current_period_start, now()),
             metadata = metadata || jsonb_build_object('trial_converted_at', now(), 'trial_converted_by', 'sweep'),
             updated_at = now()
       WHERE id = _row.id;
      _converted := _converted + 1;
      PERFORM public.emit_platform_event(
        'subscription.trial_converted',
        jsonb_build_object('subscription_id', _row.id, 'source', 'sweep'),
        'run_trial_conversions'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'converted', _converted, 'expired', _expired);
END $$;

GRANT EXECUTE ON FUNCTION public.run_trial_conversions() TO authenticated, service_role;

-- 6) EXTEND cancel_manual_subscription: record early termination when
--    canceled before commitment_end. Keeps same 3-arg signature.
CREATE OR REPLACE FUNCTION public.cancel_manual_subscription(
  _subscription_id uuid,
  _reason text DEFAULT NULL,
  _effective_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _eff date := COALESCE(_effective_date, CURRENT_DATE);
  _sub public.subscriptions%ROWTYPE;
  _months_remaining integer := 0;
  _early boolean := false;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only admins can cancel manual subscriptions';
  END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id AND provider = 'manual';
  IF NOT FOUND THEN RAISE EXCEPTION 'Manual subscription % not found', _subscription_id; END IF;

  IF _sub.commitment_end IS NOT NULL AND _eff < _sub.commitment_end THEN
    _early := true;
    _months_remaining := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM (_sub.commitment_end::timestamptz - _eff::timestamptz)) / (86400 * 30))::integer
    );
  END IF;

  UPDATE public.subscriptions
     SET status = 'canceled'::public.subscription_status,
         canceled_at = now(),
         ended_at = _eff::timestamptz,
         cancel_at = _eff::timestamptz,
         next_invoice_date = NULL,
         metadata = metadata || jsonb_build_object(
           'cancel_reason', _reason,
           'canceled_by', auth.uid(),
           'early_termination', _early,
           'months_remaining_at_cancel', _months_remaining
         ),
         updated_at = now()
   WHERE id = _subscription_id;

  PERFORM public.emit_platform_event(
    'subscription.canceled',
    jsonb_build_object(
      'subscription_id', _subscription_id,
      'reason', _reason,
      'effective_date', _eff,
      'early_termination', _early,
      'months_remaining', _months_remaining
    ),
    'cancel_manual_subscription'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'subscription_id', _subscription_id,
    'effective_date', _eff,
    'early_termination', _early,
    'months_remaining', _months_remaining
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.cancel_manual_subscription(uuid, text, date) TO authenticated, service_role;
