-- =====================================================================
-- 1) ar_aging_report — CTE scope bug: per_customer only visible in first SELECT
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ar_aging_report(p_as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customers jsonb;
  v_buckets jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver')) THEN
    RAISE EXCEPTION 'Not authorized to view the AR aging report';
  END IF;

  WITH open_invoices AS (
    SELECT
      i.id,
      COALESCE(l.name, NULLIF(i.customer_name, ''), 'Unknown customer') AS customer_name,
      COALESCE(l.email, i.customer_email, '') AS customer_email,
      i.lead_id,
      i.currency,
      GREATEST(0, i.total_cents - COALESCE(i.paid_amount_cents, 0))::bigint AS outstanding_cents,
      COALESCE(i.due_date, i.issue_date) AS due_date,
      (p_as_of - COALESCE(i.due_date, i.issue_date)) AS days_overdue
    FROM invoices i
    LEFT JOIN leads l ON l.id = i.lead_id
    WHERE i.invoice_type = 'invoice'
      AND i.status::text <> 'cancelled'
      AND (i.total_cents - COALESCE(i.paid_amount_cents, 0)) > 0
  ),
  per_customer AS (
    SELECT
      customer_name,
      customer_email,
      lead_id,
      MAX(currency) AS currency,
      SUM(CASE WHEN days_overdue <= 0 THEN outstanding_cents ELSE 0 END) AS current_cents,
      SUM(CASE WHEN days_overdue BETWEEN 1 AND 30 THEN outstanding_cents ELSE 0 END) AS overdue_1_30_cents,
      SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN outstanding_cents ELSE 0 END) AS overdue_31_60_cents,
      SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN outstanding_cents ELSE 0 END) AS overdue_61_90_cents,
      SUM(CASE WHEN days_overdue > 90 THEN outstanding_cents ELSE 0 END) AS overdue_90_plus_cents,
      SUM(outstanding_cents) AS total_outstanding_cents,
      COUNT(*) AS invoice_count
    FROM open_invoices
    GROUP BY customer_name, customer_email, lead_id
  ),
  agg AS (
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'customer_name', customer_name,
        'customer_email', customer_email,
        'lead_id', lead_id,
        'currency', currency,
        'current_cents', current_cents,
        'overdue_1_30_cents', overdue_1_30_cents,
        'overdue_31_60_cents', overdue_31_60_cents,
        'overdue_61_90_cents', overdue_61_90_cents,
        'overdue_90_plus_cents', overdue_90_plus_cents,
        'total_outstanding_cents', total_outstanding_cents,
        'invoice_count', invoice_count
      ) ORDER BY total_outstanding_cents DESC), '[]'::jsonb) AS customers_json,
      jsonb_build_object(
        'current_cents', COALESCE(SUM(current_cents), 0),
        'overdue_1_30_cents', COALESCE(SUM(overdue_1_30_cents), 0),
        'overdue_31_60_cents', COALESCE(SUM(overdue_31_60_cents), 0),
        'overdue_61_90_cents', COALESCE(SUM(overdue_61_90_cents), 0),
        'overdue_90_plus_cents', COALESCE(SUM(overdue_90_plus_cents), 0),
        'total_outstanding_cents', COALESCE(SUM(total_outstanding_cents), 0)
      ) AS buckets_json
    FROM per_customer
  )
  SELECT customers_json, buckets_json INTO v_customers, v_buckets FROM agg;

  RETURN jsonb_build_object(
    'success', true,
    'as_of', p_as_of,
    'buckets', v_buckets,
    'customers', v_customers
  );
END;
$function$;

-- =====================================================================
-- 2) create_credit_note — cumulative over-crediting guard
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_credit_note(
  p_invoice_id uuid,
  p_reason text DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD;
  v_seq int;
  v_number text;
  v_sub int;
  v_tax int;
  v_tot int;
  v_id uuid;
  v_already_credited bigint;
  v_remaining bigint;
  v_amount int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can issue credit notes';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.invoice_type <> 'invoice' THEN RAISE EXCEPTION 'Cannot credit a credit note'; END IF;

  -- Existing credit notes are stored with negative totals; sum their absolute value.
  SELECT COALESCE(SUM(ABS(total_cents)), 0)
    INTO v_already_credited
  FROM invoices
  WHERE credited_invoice_id = p_invoice_id
    AND invoice_type = 'credit_note'
    AND status::text <> 'cancelled';

  v_remaining := GREATEST(0, v_inv.total_cents - v_already_credited);

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Invoice % is already fully credited (total %, already credited %)',
      p_invoice_id, v_inv.total_cents, v_already_credited;
  END IF;

  v_amount := COALESCE(p_amount_cents, v_remaining::int);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;
  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'Credit % exceeds remaining creditable amount % (invoice total %, already credited %)',
      v_amount, v_remaining, v_inv.total_cents, v_already_credited;
  END IF;

  IF p_amount_cents IS NULL AND v_already_credited = 0 THEN
    -- Full credit of an uncredited invoice: mirror the original amounts exactly.
    v_sub := -v_inv.subtotal_cents;
    v_tax := -v_inv.tax_cents;
    v_tot := -v_inv.total_cents;
  ELSE
    v_sub := -v_amount;
    v_tax := 0;
    v_tot := -v_amount;
  END IF;

  SELECT count(*) + 1 INTO v_seq FROM invoices WHERE credited_invoice_id = p_invoice_id;
  v_number := COALESCE(v_inv.invoice_number, v_inv.id::text) || '-CN' || v_seq::text;

  INSERT INTO invoices (
    invoice_number, invoice_type, credited_invoice_id, lead_id, customer_name, customer_email,
    currency, subtotal_cents, tax_cents, total_cents, status, issue_date, due_date, notes
  ) VALUES (
    v_number, 'credit_note', p_invoice_id, v_inv.lead_id, v_inv.customer_name, v_inv.customer_email,
    v_inv.currency, v_sub, v_tax, v_tot, 'sent', CURRENT_DATE, CURRENT_DATE,
    COALESCE(p_reason, 'Credit note for ' || COALESCE(v_inv.invoice_number, v_inv.id::text))
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'credit_note_id', v_id,
    'invoice_number', v_number,
    'total_cents', v_tot,
    'already_credited_cents', v_already_credited,
    'remaining_creditable_cents', v_remaining - v_amount
  );
END;
$function$;

-- =====================================================================
-- 3) resolve_pricelist_price — ambiguous "price_cents" (RETURNS TABLE col vs products col)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.resolve_pricelist_price(
  p_product_id uuid,
  p_lead_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT 1,
  p_at date DEFAULT CURRENT_DATE,
  p_currency text DEFAULT 'SEK'
)
RETURNS TABLE(price_cents integer, pricelist_id uuid, pricelist_name text, source text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base_price integer;
BEGIN
  -- Qualify to avoid clash with the RETURNS TABLE column also named price_cents
  SELECT COALESCE(p.price_cents, 0) INTO v_base_price
  FROM public.products p
  WHERE p.id = p_product_id;

  RETURN QUERY
  WITH candidates AS (
    SELECT pl.id, pl.name,
      CASE WHEN pli.fixed_price_cents IS NOT NULL THEN pli.fixed_price_cents
           WHEN pli.discount_pct IS NOT NULL THEN GREATEST(0, ROUND(v_base_price * (1 - pli.discount_pct/100.0))::int)
           ELSE v_base_price END AS resolved_price,
      (CASE WHEN pl.lead_id = p_lead_id THEN 1000 ELSE 0 END
       + CASE WHEN pl.company_id = p_company_id THEN 500 ELSE 0 END
       + CASE WHEN pli.product_id = p_product_id THEN 100 ELSE 0 END
       - pl.priority) AS specificity
    FROM public.pricelists pl
    JOIN public.pricelist_items pli ON pli.pricelist_id = pl.id
    WHERE pl.is_active AND pl.currency = p_currency
      AND (pl.valid_from IS NULL OR pl.valid_from <= p_at)
      AND (pl.valid_until IS NULL OR pl.valid_until >= p_at)
      AND (pli.product_id = p_product_id OR pli.product_id IS NULL)
      AND p_quantity >= pli.min_quantity
      AND ((pl.lead_id IS NULL AND pl.company_id IS NULL)
        OR (p_lead_id IS NOT NULL AND pl.lead_id = p_lead_id)
        OR (p_company_id IS NOT NULL AND pl.company_id = p_company_id))
  )
  SELECT resolved_price, id, name, 'pricelist'::text
  FROM candidates ORDER BY specificity DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_base_price, NULL::uuid, NULL::text, 'product_base'::text;
  END IF;
END;
$function$;

-- =====================================================================
-- 4) normalize_email — strip +tag before @ so plus-alias dedup works
-- =====================================================================
CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_email IS NULL OR btrim(p_email) = '' THEN NULL
    ELSE regexp_replace(lower(btrim(p_email)), '\+[^@]*(?=@)', '', 'g')
  END
$function$;