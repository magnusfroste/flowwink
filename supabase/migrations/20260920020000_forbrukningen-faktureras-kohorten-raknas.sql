-- Förbrukningen faktureras, kohorten räknas.
--
-- Paritetsrunda 2, subscriptions (79 %). Två förmågor saknades helt:
--
--   1. Förbrukningsbaserad debitering. En prenumeration kunde bara bära ett fast
--      belopp × antal. Nu kan den bära MÄTARE (metric, pris per enhet, ingående
--      kvantitet per period) och förbrukningsposter; fakturan för nästa period
--      tar med den förbrukning som ännu inte fakturerats, som egna rader, och
--      stämplar posterna med fakturan. Priset bor på mätaren — en förbruknings-
--      post utan mätare vägras, för ett pris gissas aldrig.
--
--      Samtidighet: generate_subscription_invoice håller prenumerationens rad
--      FOR UPDATE. En ny förbrukningspost tar via sin främmande nyckel FOR KEY
--      SHARE på samma rad, och de två låsen krockar — en post som skrivs medan
--      fakturan skapas väntar tills fakturan är klar och hamnar på nästa. Ingen
--      post kan alltså stämplas utan att ha räknats.
--
--   2. Kohortanalys: av dem som startade månad M, hur många är kvar efter k
--      månader. Räknad ur subscriptions egna datum, aldrig ur en händelselogg
--      som kan ha luckor.
--
-- generate_subscription_invoice ersätts i sin helhet: 20260919160000 gör samma
-- sak, så kroppen är densamma på varje instans när den här migrationen körs
-- (verifierat 2026-09-19: nordbrygg, som kört 160000, har md5 613d337b… = lokalt).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Mätare och förbrukning
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_usage_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric ~ '^[a-z0-9][a-z0-9_.-]{0,62}$'),
  unit_label text,
  unit_amount_cents integer NOT NULL CHECK (unit_amount_cents >= 0),
  included_quantity numeric NOT NULL DEFAULT 0 CHECK (included_quantity >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, metric)
);

CREATE TABLE IF NOT EXISTS public.subscription_usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  metric text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity <> 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  description text,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  billed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_usage_records_idempotency
  ON public.subscription_usage_records (subscription_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscription_usage_records_unbilled
  ON public.subscription_usage_records (subscription_id, metric) WHERE invoice_id IS NULL;
CREATE INDEX IF NOT EXISTS subscription_usage_records_invoice
  ON public.subscription_usage_records (invoice_id) WHERE invoice_id IS NOT NULL;

ALTER TABLE public.subscription_usage_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Subscriptions module manages usage meters" ON public.subscription_usage_meters;
CREATE POLICY "Subscriptions module manages usage meters" ON public.subscription_usage_meters
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'subscriptions'))
  WITH CHECK (can_access_module(auth.uid(), 'subscriptions'));

DROP POLICY IF EXISTS "Subscriptions module manages usage records" ON public.subscription_usage_records;
CREATE POLICY "Subscriptions module manages usage records" ON public.subscription_usage_records
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'subscriptions'))
  WITH CHECK (can_access_module(auth.uid(), 'subscriptions'));

REVOKE ALL ON public.subscription_usage_meters, public.subscription_usage_records FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_usage_meters, public.subscription_usage_records TO authenticated, service_role;

-- Regeln på tabellen: en post behöver en aktiv mätare, och en fakturerad post är slutgiltig.
CREATE OR REPLACE FUNCTION public.subscription_usage_record_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Usage record % is billed on an invoice — it is final. Correct it with a negative usage record on the next invoice.', OLD.id USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.invoice_id IS NOT NULL THEN
    -- Fakturan kan försvinna (ON DELETE SET NULL); i övrigt står posten fast.
    IF NEW.invoice_id IS NULL AND NEW.quantity = OLD.quantity AND NEW.metric = OLD.metric
       AND NEW.subscription_id = OLD.subscription_id THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Usage record % is billed on an invoice — it is final. Correct it with a negative usage record on the next invoice.', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.metric IS DISTINCT FROM OLD.metric OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.subscription_usage_meters m
                    WHERE m.subscription_id = NEW.subscription_id AND m.metric = NEW.metric AND m.is_active) THEN
      RAISE EXCEPTION 'Subscription % has no active meter "%" — define it first with manage_usage_meter (the price per unit lives on the meter; it is never guessed).',
        NEW.subscription_id, NEW.metric USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS subscription_usage_record_rules ON public.subscription_usage_records;
CREATE TRIGGER subscription_usage_record_rules
  BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_usage_records
  FOR EACH ROW EXECUTE FUNCTION public.subscription_usage_record_rules();

CREATE OR REPLACE FUNCTION public.manage_usage_meter(
  p_subscription_id uuid,
  p_metric text,
  p_unit_amount_cents integer DEFAULT NULL,
  p_included_quantity numeric DEFAULT NULL,
  p_unit_label text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_metric text := lower(btrim(COALESCE(p_metric, '')));
  v_row public.subscription_usage_meters;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'subscriptions')) THEN
    RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE id = p_subscription_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
  END IF;
  IF v_metric !~ '^[a-z0-9][a-z0-9_.-]{0,62}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_metric is a short machine name: lowercase letters, digits, "_", "." or "-" (e.g. api_calls, storage_gb).');
  END IF;
  SELECT * INTO v_row FROM public.subscription_usage_meters WHERE subscription_id = p_subscription_id AND metric = v_metric;
  IF v_row.id IS NULL THEN
    IF p_unit_amount_cents IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'A new meter needs p_unit_amount_cents — the price per unit is never guessed.');
    END IF;
    INSERT INTO public.subscription_usage_meters (subscription_id, metric, unit_label, unit_amount_cents, included_quantity, is_active)
    VALUES (p_subscription_id, v_metric, p_unit_label, p_unit_amount_cents, COALESCE(p_included_quantity, 0), COALESCE(p_is_active, true))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.subscription_usage_meters
       SET unit_amount_cents = COALESCE(p_unit_amount_cents, unit_amount_cents),
           included_quantity = COALESCE(p_included_quantity, included_quantity),
           unit_label = COALESCE(p_unit_label, unit_label),
           is_active = COALESCE(p_is_active, is_active),
           updated_at = now()
     WHERE id = v_row.id RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('success', true, 'meter', to_jsonb(v_row),
    'note', 'A price change applies to all usage not yet invoiced — usage is priced when it is billed.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_subscription_usage(
  p_subscription_id uuid,
  p_metric text,
  p_quantity numeric,
  p_occurred_at timestamptz DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_metric text := lower(btrim(COALESCE(p_metric, '')));
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'subscriptions')) THEN
    RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_quantity must be non-zero (negative corrects earlier, not yet invoiced usage).');
  END IF;
  IF COALESCE(p_occurred_at, now()) > now() + interval '1 day' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_occurred_at is in the future — usage is recorded after it happened.');
  END IF;
  IF v_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.subscription_usage_records WHERE subscription_id = p_subscription_id AND idempotency_key = v_key;
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'already_recorded', true, 'usage_record_id', v_id);
    END IF;
  END IF;
  BEGIN
    INSERT INTO public.subscription_usage_records (subscription_id, metric, quantity, occurred_at, idempotency_key, description, created_by)
    VALUES (p_subscription_id, v_metric, p_quantity, COALESCE(p_occurred_at, now()), v_key, p_description, auth.uid())
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_id FROM public.subscription_usage_records WHERE subscription_id = p_subscription_id AND idempotency_key = v_key;
      RETURN jsonb_build_object('success', true, 'already_recorded', true, 'usage_record_id', v_id);
    WHEN foreign_key_violation THEN
      RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
    WHEN sqlstate 'P0001' THEN
      RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  RETURN jsonb_build_object('success', true, 'usage_record_id', v_id, 'metric', v_metric, 'quantity', p_quantity,
                            'unbilled', public.subscription_usage_summary(p_subscription_id)->'meters');
END;
$function$;

CREATE OR REPLACE FUNCTION public.subscription_usage_summary(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'subscriptions')) THEN
    RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('success', true, 'subscription_id', p_subscription_id,
    'meters', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'metric', m.metric, 'unit_label', m.unit_label, 'unit_amount_cents', m.unit_amount_cents,
               'included_quantity', m.included_quantity, 'is_active', m.is_active,
               'unbilled_quantity', u.qty,
               'billable_quantity', GREATEST(u.qty - m.included_quantity, 0),
               'unbilled_amount_cents', round(GREATEST(u.qty - m.included_quantity, 0) * m.unit_amount_cents)::bigint)
             ORDER BY m.metric)
        FROM public.subscription_usage_meters m
        CROSS JOIN LATERAL (SELECT COALESCE(SUM(r.quantity), 0) AS qty FROM public.subscription_usage_records r
                             WHERE r.subscription_id = m.subscription_id AND r.metric = m.metric AND r.invoice_id IS NULL) u
       WHERE m.subscription_id = p_subscription_id), '[]'::jsonb),
    'note', 'Unbilled usage is added to the next subscription invoice as its own lines; included_quantity is per invoice period.');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Fakturan tar med förbrukningen
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_subscription_invoice(_subscription_id uuid, _tax_rate numeric DEFAULT NULL::numeric, _due_in_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _sub public.subscriptions%ROWTYPE; _invoice_id uuid; _invoice_number text; _gross integer; _subtotal integer; _tax integer; _total integer; _rate numeric; _due integer; _due_date date; _base date; _next date; _line jsonb; _status invoice_status; _lead_id uuid;
  _pending bigint; _applied bigint := 0;
  _m record; _usage_lines jsonb := '[]'::jsonb; _usage_total bigint := 0; _usage_cutoff timestamptz := clock_timestamp(); _billable numeric; _amount bigint;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(), 'subscriptions'))) THEN RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', _subscription_id; END IF;
  IF _sub.provider <> 'manual' THEN RAISE EXCEPTION 'generate_subscription_invoice only applies to manual subscriptions (got %)', _sub.provider; END IF;
  IF _sub.status <> 'active'::subscription_status THEN RAISE EXCEPTION 'Cannot invoice subscription in status %', _sub.status; END IF;
  IF _sub.next_invoice_date IS NOT NULL AND _sub.next_invoice_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Subscription % is not due: next invoice date is % (already invoiced through the current period)', _subscription_id, _sub.next_invoice_date;
  END IF;
  _gross := _sub.unit_amount_cents * COALESCE(_sub.quantity, 1);
  -- Krediten från en nedgradering dras här, som en egen rad. Det som inte ryms följer med.
  _pending := COALESCE((_sub.metadata->>'pending_credit_cents')::bigint, 0);
  _applied := LEAST(GREATEST(_pending, 0), _gross);
  -- usage-billed 20260920020000
  -- Förbrukningen faktureras i efterskott: allt som ännu inte fakturerats, per
  -- mätare, minus det som ingår i perioden. Raden under prenumerationens lås —
  -- en post som skrivs nu väntar på fakturan (FK:ns KEY SHARE mot FOR UPDATE).
  FOR _m IN
    SELECT m.metric, m.unit_label, m.unit_amount_cents, m.included_quantity,
           COALESCE(SUM(r.quantity), 0) AS qty
      FROM public.subscription_usage_meters m
      JOIN public.subscription_usage_records r
        ON r.subscription_id = m.subscription_id AND r.metric = m.metric
       AND r.invoice_id IS NULL AND r.occurred_at <= _usage_cutoff
     WHERE m.subscription_id = _subscription_id
     GROUP BY m.metric, m.unit_label, m.unit_amount_cents, m.included_quantity
     ORDER BY m.metric
  LOOP
    _billable := GREATEST(_m.qty - _m.included_quantity, 0);
    _amount := round(_billable * _m.unit_amount_cents)::bigint;
    _usage_total := _usage_total + _amount;
    _usage_lines := _usage_lines || jsonb_build_array(jsonb_build_object(
      'description', 'Usage: ' || _m.metric || ' — ' || trim(to_char(_m.qty, 'FM999999999990.######')) || COALESCE(' ' || _m.unit_label, '')
                     || CASE WHEN _m.included_quantity > 0 THEN ' (' || trim(to_char(_m.included_quantity, 'FM999999999990.######')) || ' included)' ELSE '' END,
      'quantity', _billable, 'unit_price_cents', _m.unit_amount_cents, 'total_cents', _amount,
      'usage_metric', _m.metric, 'usage_quantity', _m.qty));
  END LOOP;
  _subtotal := _gross - _applied::integer + _usage_total::integer;
  _rate := COALESCE(CASE WHEN _tax_rate > 1 THEN _tax_rate / 100.0 ELSE _tax_rate END, public.order_line_vat_rate(NULL) / 100.0);
  _tax := round(_subtotal * _rate)::integer;
  _total := _subtotal + _tax;
  _due := COALESCE(_due_in_days, CASE _sub.payment_terms WHEN 'invoice_30' THEN 30 WHEN 'invoice_14' THEN 14 WHEN 'invoice_7' THEN 7 ELSE 30 END);
  _due_date := CURRENT_DATE + _due;
  _invoice_number := 'SUB-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');
  _line := jsonb_build_array(jsonb_build_object('description', _sub.product_name || ' (' || to_char(COALESCE(_sub.current_period_start, now()), 'YYYY-MM-DD') || ' → ' || to_char(COALESCE(_sub.current_period_end, now()), 'YYYY-MM-DD') || ')', 'quantity', _sub.quantity, 'unit_price_cents', _sub.unit_amount_cents, 'total_cents', _gross));
  IF _applied > 0 THEN
    _line := _line || jsonb_build_array(jsonb_build_object('description', 'Credit for the unused part of the previous period (downgrade)', 'quantity', 1, 'unit_price_cents', -_applied, 'total_cents', -_applied));
  END IF;
  _line := _line || _usage_lines;
  _status := CASE WHEN COALESCE(_sub.auto_finalize, false) THEN 'sent'::invoice_status ELSE 'draft'::invoice_status END;
  SELECT id INTO _lead_id FROM public.leads WHERE lower(email) = lower(_sub.customer_email) ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.invoices (invoice_number, customer_email, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, due_date, issue_date, payment_terms, notes, sent_at, subscription_id, lead_id)
  VALUES (_invoice_number, _sub.customer_email, _sub.customer_name, _status, _line, _subtotal, _rate, _tax, _total, upper(_sub.currency), _due_date, CURRENT_DATE, 'Net ' || _due || ' days', 'Generated from subscription ' || _sub.id::text || CASE WHEN _sub.po_number IS NOT NULL THEN E'\nPO: ' || _sub.po_number ELSE '' END, CASE WHEN _status = 'sent'::invoice_status THEN now() ELSE NULL END, _subscription_id, _lead_id)
  RETURNING id INTO _invoice_id;
  -- Exakt de poster som räknades stämplas — samma predikat, samma lås.
  UPDATE public.subscription_usage_records r SET invoice_id = _invoice_id, billed_at = now()
   WHERE r.subscription_id = _subscription_id AND r.invoice_id IS NULL AND r.occurred_at <= _usage_cutoff
     AND EXISTS (SELECT 1 FROM public.subscription_usage_meters m WHERE m.subscription_id = r.subscription_id AND m.metric = r.metric);
  -- Roll forward from the period boundary. _base = old period end = new period start.
  -- New period [_base, advance(_base)] is non-zero (proration-safe), and next_invoice_date
  -- = _base preserves the invariant next_invoice_date == current_period_start (one invoice
  -- per interval, no skipped/doubled cycles).
  _base := COALESCE(_sub.current_period_end::date, _sub.next_invoice_date, CURRENT_DATE);
  _next := advance_billing_date(_base, _sub.billing_interval, _sub.billing_interval_count);
  UPDATE public.subscriptions SET last_invoice_id = _invoice_id, current_period_start = _base::timestamptz, current_period_end = _next::timestamptz, next_invoice_date = _base, updated_at = now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('pending_credit_cents', GREATEST(_pending - _applied, 0))
   WHERE id = _subscription_id;
  PERFORM public.emit_platform_event('subscription.invoiced', jsonb_build_object('subscription_id', _subscription_id, 'invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'total_cents', _total, 'currency', upper(_sub.currency), 'auto_finalized', COALESCE(_sub.auto_finalize, false), 'status', _status), 'generate_subscription_invoice');
  IF _status = 'sent'::invoice_status THEN
    PERFORM public.emit_platform_event('invoice.finalized', jsonb_build_object('invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'subscription_id', _subscription_id, 'total_cents', _total, 'currency', upper(_sub.currency), 'source', 'subscription_auto_finalize'), 'generate_subscription_invoice');
  END IF;
  -- Return _base (what was written to next_invoice_date), not _next, so the reported
  -- next_invoice_date matches the row.
  RETURN jsonb_build_object('ok', true, 'invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'status', _status, 'auto_finalized', COALESCE(_sub.auto_finalize, false), 'total_cents', _total, 'credit_applied_cents', _applied, 'credit_remaining_cents', GREATEST(_pending - _applied, 0), 'usage_cents', _usage_total, 'next_invoice_date', _base);
END $function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Kohorten
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.subscription_cohort_retention(p_months integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_months integer := GREATEST(1, LEAST(COALESCE(p_months, 12), 36));
  v_this_month date := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'subscriptions')) THEN
    RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH subs AS (
      SELECT s.id,
             date_trunc('month', COALESCE(s.commitment_start::timestamptz, s.trial_start, s.created_at))::date AS cohort,
             -- Slutet läses ur radens egna datum: ended_at, annars canceled_at för en avslutad.
             COALESCE(s.ended_at, CASE WHEN s.status::text IN ('canceled', 'unpaid', 'incomplete_expired') THEN COALESCE(s.canceled_at, s.updated_at) END) AS ended
        FROM public.subscriptions s
    ), cohorts AS (
      SELECT cohort, count(*) AS started FROM subs
       WHERE cohort > (v_this_month - make_interval(months => v_months))::date
       GROUP BY cohort
    )
    SELECT jsonb_build_object('success', true, 'months', v_months,
      'cohorts', COALESCE(jsonb_agg(jsonb_build_object(
        'cohort', to_char(c.cohort, 'YYYY-MM'),
        'started', c.started,
        'retained', (
          SELECT jsonb_agg(jsonb_build_object(
                   'month', k,
                   'active', (SELECT count(*) FROM subs x WHERE x.cohort = c.cohort
                                AND (x.ended IS NULL OR x.ended >= (c.cohort + make_interval(months => k)))),
                   'pct', round(100.0 * (SELECT count(*) FROM subs x WHERE x.cohort = c.cohort
                                AND (x.ended IS NULL OR x.ended >= (c.cohort + make_interval(months => k)))) / c.started, 1))
                 ORDER BY k)
            FROM generate_series(0, v_months) k
           -- Bara månader som har hunnit inträffa: framtiden är inte 100 % kvar, den är okänd.
           WHERE (c.cohort + make_interval(months => k))::date <= v_this_month)
      ) ORDER BY c.cohort), '[]'::jsonb),
      'note', 'retained[k].active = subscriptions from that start month still running k months later. Months that have not happened yet are absent, not 100 %.')
    FROM cohorts c
  );
END;
$function$;

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.manage_usage_meter(uuid, text, integer, numeric, text, boolean)',
    'public.record_subscription_usage(uuid, text, numeric, timestamptz, text, text)',
    'public.subscription_usage_summary(uuid)',
    'public.subscription_cohort_retention(integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$grants$;

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE v_sub uuid; v_r jsonb; v_inv uuid; v_lines jsonb; v_cohort jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO public.subscriptions (customer_email, customer_name, product_name, status, quantity, unit_amount_cents, currency,
                                      billing_interval, billing_interval_count, provider, payment_terms,
                                      current_period_start, current_period_end, next_invoice_date)
    VALUES ('proof-20260920020000@example.test', 'Proof', 'Proof plan', 'active', 1, 100000, 'SEK', 'month', 1, 'manual', 'invoice_30',
            now() - interval '1 month', now(), CURRENT_DATE)
    RETURNING id INTO v_sub;

    v_r := public.record_subscription_usage(v_sub, 'api_calls', 100);
    IF (v_r->>'success')::boolean THEN
      RAISE EXCEPTION 'proof failed: usage was recorded without a meter';
    END IF;
    v_r := public.manage_usage_meter(v_sub, 'api_calls', 50, 1000, 'calls');
    IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'proof failed: meter → %', v_r; END IF;
    PERFORM public.record_subscription_usage(v_sub, 'api_calls', 1200, NULL, 'proof-1');
    PERFORM public.record_subscription_usage(v_sub, 'api_calls', 1200, NULL, 'proof-1');
    PERFORM public.record_subscription_usage(v_sub, 'api_calls', 300, NULL, 'proof-2');
    IF (SELECT count(*) FROM public.subscription_usage_records WHERE subscription_id = v_sub) <> 2 THEN
      RAISE EXCEPTION 'proof failed: the idempotency key did not hold';
    END IF;

    -- 1 500 calls, 1 000 included → 500 × 0,50 kr = 250 kr on top of 1 000 kr.
    v_r := public.generate_subscription_invoice(v_sub, 25);
    v_inv := (v_r->>'invoice_id')::uuid;
    IF (v_r->>'usage_cents')::bigint <> 25000 THEN RAISE EXCEPTION 'proof failed: usage should be 25000 → %', v_r; END IF;
    IF (SELECT subtotal_cents FROM public.invoices WHERE id = v_inv) <> 125000 THEN
      RAISE EXCEPTION 'proof failed: subtotal should be 125000';
    END IF;
    IF EXISTS (SELECT 1 FROM public.subscription_usage_records WHERE subscription_id = v_sub AND invoice_id IS DISTINCT FROM v_inv) THEN
      RAISE EXCEPTION 'proof failed: a counted usage record was not stamped with the invoice';
    END IF;
    BEGIN
      UPDATE public.subscription_usage_records SET quantity = 1 WHERE subscription_id = v_sub;
      RAISE EXCEPTION 'proof failed: a billed usage record was edited';
    EXCEPTION WHEN sqlstate 'P0001' THEN
      IF SQLERRM LIKE 'proof failed%' THEN RAISE; END IF;
    END;

    v_cohort := public.subscription_cohort_retention(3);
    IF NOT (v_cohort->>'success')::boolean OR jsonb_array_length(v_cohort->'cohorts') < 1 THEN
      RAISE EXCEPTION 'proof failed: cohort → %', v_cohort;
    END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: no usage without a meter, idempotent records, included quantity honoured, usage billed once and stamped, billed usage final, cohorts computed.';
END
$proof$;
