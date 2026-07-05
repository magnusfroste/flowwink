-- Invoicing: AR aging report (docs/parity/capabilities/invoicing.json#aging_report).
-- Buckets open (not fully paid, not cancelled) invoices per customer into
-- current / 1-30 / 31-60 / 61-90 / 90+ days overdue, based on due_date vs
-- p_as_of and outstanding = total_cents - paid_amount_cents. Read-only. Idempotent.

CREATE OR REPLACE FUNCTION "public"."ar_aging_report"(
  "p_as_of" "date" DEFAULT CURRENT_DATE
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
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
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
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
    ) ORDER BY total_outstanding_cents DESC), '[]'::jsonb)
  INTO v_customers
  FROM per_customer;

  -- Totals: aggregate the per-customer array already computed above. A second
  -- reference to the per_customer CTE would be out of scope here — a WITH clause
  -- only covers the single statement it prefixes (this was the 'relation
  -- "per_customer" does not exist' bug, caught by live verification 2026-07-04).
  SELECT jsonb_build_object(
      'current_cents', COALESCE(SUM((e->>'current_cents')::bigint), 0),
      'overdue_1_30_cents', COALESCE(SUM((e->>'overdue_1_30_cents')::bigint), 0),
      'overdue_31_60_cents', COALESCE(SUM((e->>'overdue_31_60_cents')::bigint), 0),
      'overdue_61_90_cents', COALESCE(SUM((e->>'overdue_61_90_cents')::bigint), 0),
      'overdue_90_plus_cents', COALESCE(SUM((e->>'overdue_90_plus_cents')::bigint), 0),
      'total_outstanding_cents', COALESCE(SUM((e->>'total_outstanding_cents')::bigint), 0)
    )
  INTO v_buckets
  FROM jsonb_array_elements(v_customers) AS e;

  RETURN jsonb_build_object(
    'success', true,
    'as_of', p_as_of,
    'buckets', v_buckets,
    'customers', v_customers
  );
END;
$$;

ALTER FUNCTION "public"."ar_aging_report"("date") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."ar_aging_report"("date") TO "anon", "authenticated", "service_role";
