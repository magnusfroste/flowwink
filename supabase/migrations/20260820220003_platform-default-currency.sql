-- The instance's currency has ONE source, and a hardcoded fallback is not it.
--
-- create_manual_subscription defaulted _currency to 'EUR'. subscriptions.currency
-- defaults to 'usd'. The instance runs in SEK. Three answers to one question, and
-- which one a subscription got depended on whether the caller happened to pass the
-- parameter — the same class as the client-side `|| 'USD'` that once beat the
-- database's own SEK column default and gave a Swedish instance dollar rows.
--
-- The rule (platform format layer): when the caller made no choice, ASK THE
-- PLATFORM; never invent. The platform's answer is site_settings.platform_locale
-- → default_currency, the same setting usePlatformFormat reads on the front end.
-- Where that has not been configured, the last word belongs to the database's own
-- money-column default — read from the catalog, not retyped here, so this function
-- can never disagree with the tables it writes into.
--
-- A second, quieter bug goes with it: the plan-override branch detected "caller
-- left the default" by comparing the argument to the literal 'EUR'. A customer who
-- explicitly wanted EUR had their choice silently replaced by the plan's currency.
-- With a NULL default the question becomes the one actually being asked — did the
-- caller pass a currency at all.

CREATE OR REPLACE FUNCTION public.platform_default_currency()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT upper(COALESCE(
    -- 1. The operator's explicit platform setting (usePlatformFormat reads this).
    NULLIF((SELECT value->>'default_currency' FROM public.site_settings WHERE key = 'platform_locale'), ''),
    -- 2. Older instances kept it on the general settings blob.
    NULLIF((SELECT value->>'currency' FROM public.site_settings WHERE key = 'general'), ''),
    -- 3. The database's own convention for money rows: invoices.currency's column
    --    default. Per-instance, set by provisioning — not a constant typed here.
    NULLIF((SELECT (regexp_match(pg_get_expr(ad.adbin, ad.adrelid), '''([A-Za-z]{3})'''))[1]
              FROM pg_attrdef ad
              JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
             WHERE ad.adrelid = 'public.invoices'::regclass AND a.attname = 'currency'), '')
  ));
$$;

COMMENT ON FUNCTION public.platform_default_currency() IS
  'The instance currency to use when a caller omitted one: platform_locale.default_currency → general.currency → the invoices.currency column default. Never a hardcoded literal.';

GRANT EXECUTE ON FUNCTION public.platform_default_currency() TO authenticated, anon, service_role;

-- ── create_manual_subscription: omitted currency asks the platform ───────────
-- Same 17-argument signature as the live function (plan/trial/commitment
-- extension). Both older signatures are dropped so no ambiguous overload can
-- survive on an instance that has one of them.
DROP FUNCTION IF EXISTS public.create_manual_subscription(text, text, text, integer, text, text, integer, integer, text, date, text, text, uuid, boolean);
DROP FUNCTION IF EXISTS public.create_manual_subscription(text, text, text, integer, text, text, integer, integer, text, date, text, text, uuid, boolean, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.create_manual_subscription(
  _customer_email text,
  _customer_name text,
  _product_name text DEFAULT NULL,
  _unit_amount_cents integer DEFAULT NULL,
  _currency text DEFAULT NULL,
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
  _caller_currency text := NULLIF(trim(_currency), '');
  _cur text := lower(_caller_currency);
  _cur_source text := CASE WHEN _caller_currency IS NULL THEN 'platform' ELSE 'caller' END;
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
    -- The plan speaks only where the caller stayed silent. This used to compare
    -- the argument to 'EUR', so a caller who genuinely wanted EUR was overridden.
    IF _caller_currency IS NULL AND NULLIF(trim(_plan.currency), '') IS NOT NULL THEN
      _cur := lower(_plan.currency);
      _cur_source := 'plan';
    END IF;
    IF _billing_interval = 'month' THEN _int := lower(_plan.billing_interval); END IF;
    IF _billing_interval_count = 1 THEN _intc := GREATEST(1, _plan.billing_interval_count); END IF;
    IF _trial = 0 THEN _trial := _plan.trial_days; END IF;
    IF _commit = 0 THEN _commit := _plan.commitment_months; END IF;
  END IF;

  -- Still nothing? Ask the platform. No literal lives in this function.
  IF _cur IS NULL THEN
    _cur := lower(public.platform_default_currency());
  END IF;
  IF _cur IS NULL THEN
    RAISE EXCEPTION 'No currency given and the instance has no platform currency configured (site_settings.platform_locale.default_currency)';
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
      'auto_finalize', COALESCE(_auto_finalize, false),
      'currency_source', _cur_source
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
    'currency', _cur,
    'currency_source', _cur_source,
    'plan_id', _plan_id,
    'pricelist_id', _pricelist
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.create_manual_subscription(text, text, text, integer, text, text, integer, integer, text, date, text, text, uuid, boolean, uuid, integer, integer) TO authenticated, service_role;
