-- ===== Reconcile part 3/3 =====

-- ── SLA business hours ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."business_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "weekday" integer NOT NULL,
    "open_time" time NOT NULL,
    "close_time" time NOT NULL,
    "is_open" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "business_hours_window_check" CHECK ("close_time" > "open_time"),
    CONSTRAINT "business_hours_weekday_window_key" UNIQUE ("weekday", "open_time")
);
CREATE TABLE IF NOT EXISTS "public"."business_holidays" (
    "day" "date" NOT NULL,
    "name" "text",
    CONSTRAINT "business_holidays_pkey" PRIMARY KEY ("day")
);
ALTER TABLE "public"."business_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."business_holidays" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['business_hours','business_holidays'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$s USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Anyone reads %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Anyone reads %1$s" ON public.%1$s FOR SELECT USING (true)', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;
INSERT INTO "public"."business_hours" ("weekday","open_time","close_time")
SELECT d, TIME '09:00', TIME '17:00' FROM generate_series(1,5) AS d
ON CONFLICT ("weekday","open_time") DO NOTHING;

CREATE OR REPLACE FUNCTION "public"."business_minutes_between"(
  "p_start" timestamptz, "p_end" timestamptz
) RETURNS integer LANGUAGE "plpgsql" STABLE SET "search_path" TO 'public' AS $$
DECLARE
  v_total numeric := 0; v_day date; v_end_day date; v_win RECORD;
  v_open timestamptz; v_close timestamptz; v_seg_start timestamptz; v_seg_end timestamptz;
BEGIN
  IF p_end <= p_start THEN RETURN 0; END IF;
  v_day := p_start::date; v_end_day := p_end::date;
  WHILE v_day <= v_end_day LOOP
    IF NOT EXISTS (SELECT 1 FROM business_holidays h WHERE h.day = v_day) THEN
      FOR v_win IN SELECT open_time, close_time FROM business_hours
        WHERE is_open AND weekday = EXTRACT(DOW FROM v_day)::int LOOP
        v_open  := (v_day + v_win.open_time)::timestamptz;
        v_close := (v_day + v_win.close_time)::timestamptz;
        v_seg_start := GREATEST(v_open, p_start); v_seg_end := LEAST(v_close, p_end);
        IF v_seg_end > v_seg_start THEN
          v_total := v_total + EXTRACT(EPOCH FROM (v_seg_end - v_seg_start)) / 60.0;
        END IF;
      END LOOP;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  RETURN ROUND(v_total)::int;
END; $$;
GRANT ALL ON FUNCTION "public"."business_minutes_between"(timestamptz, timestamptz) TO "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "public"."manage_business_hours"(
  "p_action" "text", "p_weekday" integer DEFAULT NULL, "p_open_time" time DEFAULT NULL,
  "p_close_time" time DEFAULT NULL, "p_is_open" boolean DEFAULT NULL,
  "p_holiday" "date" DEFAULT NULL, "p_holiday_name" "text" DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify business hours'; END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true,
      'hours', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.weekday, b.open_time), '[]'::jsonb) FROM business_hours b),
      'holidays', (SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.day), '[]'::jsonb) FROM business_holidays h));
  ELSIF p_action = 'set_hours' THEN
    IF p_weekday IS NULL OR p_open_time IS NULL OR p_close_time IS NULL THEN
      RAISE EXCEPTION 'weekday, open_time, close_time required'; END IF;
    INSERT INTO business_hours (weekday, open_time, close_time, is_open)
    VALUES (p_weekday, p_open_time, p_close_time, COALESCE(p_is_open, true))
    ON CONFLICT (weekday, open_time) DO UPDATE SET close_time = EXCLUDED.close_time, is_open = EXCLUDED.is_open;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'clear_day' THEN
    DELETE FROM business_hours WHERE weekday = p_weekday; RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'add_holiday' THEN
    INSERT INTO business_holidays (day, name) VALUES (p_holiday, p_holiday_name)
    ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name; RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'remove_holiday' THEN
    DELETE FROM business_holidays WHERE day = p_holiday; RETURN jsonb_build_object('success', true);
  ELSE RAISE EXCEPTION 'Unknown action: %', p_action; END IF;
END; $$;
GRANT ALL ON FUNCTION "public"."manage_business_hours"("text",integer,time,time,boolean,"date","text") TO "anon", "authenticated", "service_role";

-- ── Budgets ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."budget_vs_actual"(
  "p_fiscal_year" integer, "p_period_month" integer DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_rows jsonb;
BEGIN
  WITH bud AS (
    SELECT account_code, SUM(amount_cents) AS budget_cents FROM budgets
    WHERE fiscal_year = p_fiscal_year
      AND ((p_period_month IS NULL AND period_month IS NULL)
        OR (p_period_month IS NOT NULL AND period_month = p_period_month))
    GROUP BY account_code),
  act AS (
    SELECT l.account_code, SUM(l.debit_cents - l.credit_cents) AS actual_cents
    FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
    WHERE EXTRACT(YEAR FROM je.entry_date)::int = p_fiscal_year
      AND (p_period_month IS NULL OR EXTRACT(MONTH FROM je.entry_date)::int = p_period_month)
      AND je.status <> 'draft'
    GROUP BY l.account_code)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'account_code', account_code, 'budget_cents', COALESCE(budget_cents, 0),
    'actual_cents', COALESCE(actual_cents, 0),
    'variance_cents', COALESCE(budget_cents,0) - COALESCE(actual_cents,0)
  ) ORDER BY account_code), '[]'::jsonb) INTO v_rows
  FROM (SELECT account_code FROM bud UNION SELECT account_code FROM act) k
  LEFT JOIN bud USING (account_code) LEFT JOIN act USING (account_code);
  RETURN jsonb_build_object('success', true, 'fiscal_year', p_fiscal_year,
    'period_month', p_period_month, 'lines', v_rows);
END; $$;
GRANT ALL ON FUNCTION "public"."budget_vs_actual"(integer, integer) TO "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "public"."manage_budget"(
  "p_action" "text", "p_budget_id" "uuid" DEFAULT NULL, "p_account_code" "text" DEFAULT NULL,
  "p_fiscal_year" integer DEFAULT NULL, "p_period_month" integer DEFAULT NULL,
  "p_amount_cents" bigint DEFAULT NULL, "p_currency" "text" DEFAULT 'SEK', "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')); v_id uuid;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify budgets'; END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'budgets', (
      SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.account_code, b.period_month NULLS FIRST), '[]'::jsonb)
      FROM budgets b WHERE p_fiscal_year IS NULL OR b.fiscal_year = p_fiscal_year));
  ELSIF p_action = 'upsert' THEN
    IF p_account_code IS NULL OR p_fiscal_year IS NULL OR p_amount_cents IS NULL THEN
      RAISE EXCEPTION 'account_code, fiscal_year, amount_cents required'; END IF;
    INSERT INTO budgets (account_code, fiscal_year, period_month, amount_cents, currency, notes, created_by)
    VALUES (p_account_code, p_fiscal_year, p_period_month, p_amount_cents, COALESCE(p_currency,'SEK'), p_notes, auth.uid())
    ON CONFLICT (account_code, fiscal_year, (COALESCE(period_month, -1)))
    DO UPDATE SET amount_cents = EXCLUDED.amount_cents, currency = EXCLUDED.currency, notes = EXCLUDED.notes, updated_at = now()
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'budget_id', v_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM budgets WHERE id = p_budget_id; RETURN jsonb_build_object('success', true, 'deleted', p_budget_id);
  ELSE RAISE EXCEPTION 'Unknown action: %', p_action; END IF;
END; $$;
GRANT ALL ON FUNCTION "public"."manage_budget"("text","uuid","text",integer,integer,bigint,"text","text") TO "anon", "authenticated", "service_role";

-- ── Inventory cycle counts ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."manage_inventory_count"(
  "p_action" "text", "p_count_id" "uuid" DEFAULT NULL, "p_location_id" "uuid" DEFAULT NULL,
  "p_product_id" "uuid" DEFAULT NULL, "p_lot_id" "uuid" DEFAULT NULL,
  "p_counted_qty" numeric DEFAULT NULL, "p_line_id" "uuid" DEFAULT NULL, "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_sys numeric; v_status text; v_line RECORD; v_applied int := 0;
BEGIN
  IF p_action <> 'list' AND p_action <> 'get' AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify inventory counts'; END IF;
  IF p_action = 'create' THEN
    IF p_location_id IS NULL THEN RAISE EXCEPTION 'location_id required'; END IF;
    INSERT INTO inventory_counts (location_id, notes, created_by)
    VALUES (p_location_id, p_notes, auth.uid()) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'count_id', v_id);
  ELSIF p_action = 'add_line' THEN
    IF p_count_id IS NULL OR p_product_id IS NULL THEN RAISE EXCEPTION 'count_id and product_id required'; END IF;
    SELECT location_id, status INTO p_location_id, v_status FROM inventory_counts WHERE id = p_count_id;
    IF v_status <> 'draft' THEN RAISE EXCEPTION 'Count % is not draft', p_count_id; END IF;
    SELECT COALESCE(SUM(quantity), 0) INTO v_sys FROM stock_quants
      WHERE product_id = p_product_id AND location_id = p_location_id
        AND (p_lot_id IS NULL OR lot_id = p_lot_id);
    INSERT INTO inventory_count_lines (count_id, product_id, lot_id, system_qty, counted_qty)
    VALUES (p_count_id, p_product_id, p_lot_id, v_sys, COALESCE(p_counted_qty, v_sys))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'line_id', v_id, 'system_qty', v_sys);
  ELSIF p_action = 'set_count' THEN
    UPDATE inventory_count_lines SET counted_qty = p_counted_qty WHERE id = p_line_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Line % not found', p_line_id; END IF;
    RETURN jsonb_build_object('success', true, 'line_id', p_line_id);
  ELSIF p_action = 'post' THEN
    SELECT location_id, status INTO p_location_id, v_status FROM inventory_counts WHERE id = p_count_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Count % not found', p_count_id; END IF;
    IF v_status <> 'draft' THEN RAISE EXCEPTION 'Count % already %', p_count_id, v_status; END IF;
    FOR v_line IN SELECT product_id, lot_id, variance FROM inventory_count_lines WHERE count_id = p_count_id AND variance <> 0 LOOP
      PERFORM adjust_quant(v_line.product_id, p_location_id, v_line.variance, v_line.lot_id, 'cycle_count');
      v_applied := v_applied + 1;
    END LOOP;
    UPDATE inventory_counts SET status = 'posted', posted_at = now() WHERE id = p_count_id;
    RETURN jsonb_build_object('success', true, 'count_id', p_count_id, 'adjustments_applied', v_applied);
  ELSIF p_action = 'get' THEN
    RETURN jsonb_build_object('success', true,
      'count', (SELECT to_jsonb(c) FROM inventory_counts c WHERE c.id = p_count_id),
      'lines', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at), '[]'::jsonb)
                FROM inventory_count_lines l WHERE l.count_id = p_count_id));
  ELSIF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'counts', (
      SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM inventory_counts c WHERE p_location_id IS NULL OR c.location_id = p_location_id));
  ELSE RAISE EXCEPTION 'Unknown action: %', p_action; END IF;
END; $$;
GRANT ALL ON FUNCTION "public"."manage_inventory_count"("text","uuid","uuid","uuid","uuid",numeric,"uuid","text") TO "anon", "authenticated", "service_role";

-- ── Reconciliation rules ───────────────────────────────────────────────────
ALTER TABLE "public"."bank_transactions"
  ADD COLUMN IF NOT EXISTS "suggested_account_code" "text",
  ADD COLUMN IF NOT EXISTS "matched_rule_id" "uuid";
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='bank_transactions_matched_rule_id_fkey' AND table_name='bank_transactions') THEN
    ALTER TABLE "public"."bank_transactions" ADD CONSTRAINT "bank_transactions_matched_rule_id_fkey"
      FOREIGN KEY ("matched_rule_id") REFERENCES "public"."reconciliation_rules"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "public"."apply_reconciliation_rules"() RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_bt RECORD; v_rule RECORD; v_tagged int := 0; v_field text; v_ok boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorized'; END IF;
  FOR v_bt IN SELECT * FROM bank_transactions WHERE status = 'unmatched' AND matched_rule_id IS NULL LOOP
    FOR v_rule IN SELECT * FROM reconciliation_rules WHERE is_active ORDER BY priority ASC, created_at ASC LOOP
      v_field := CASE v_rule.match_field
                   WHEN 'counterparty' THEN COALESCE(v_bt.counterparty,'')
                   WHEN 'reference' THEN COALESCE(v_bt.reference,'')
                   ELSE COALESCE(v_bt.description,'') END;
      v_ok := CASE v_rule.match_type
                WHEN 'contains' THEN v_field ILIKE '%' || v_rule.pattern || '%'
                WHEN 'equals' THEN lower(v_field) = lower(v_rule.pattern)
                ELSE v_field ~* v_rule.pattern END;
      IF v_ok THEN
        UPDATE bank_transactions
          SET suggested_account_code = v_rule.suggested_account_code, matched_rule_id = v_rule.id
          WHERE id = v_bt.id;
        v_tagged := v_tagged + 1; EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'tagged', v_tagged);
END; $$;
GRANT ALL ON FUNCTION "public"."apply_reconciliation_rules"() TO "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "public"."manage_reconciliation_rule"(
  "p_action" "text", "p_rule_id" "uuid" DEFAULT NULL, "p_name" "text" DEFAULT NULL,
  "p_match_field" "text" DEFAULT NULL, "p_match_type" "text" DEFAULT NULL, "p_pattern" "text" DEFAULT NULL,
  "p_suggested_account_code" "text" DEFAULT NULL, "p_suggested_category" "text" DEFAULT NULL,
  "p_priority" integer DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')); v_id uuid;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify reconciliation rules'; END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'rules',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.priority, r.created_at), '[]'::jsonb) FROM reconciliation_rules r));
  ELSIF p_action = 'create' THEN
    IF p_name IS NULL OR p_match_field IS NULL OR p_match_type IS NULL OR p_pattern IS NULL THEN
      RAISE EXCEPTION 'name, match_field, match_type, pattern required'; END IF;
    INSERT INTO reconciliation_rules (name, match_field, match_type, pattern, suggested_account_code, suggested_category, priority)
    VALUES (p_name, p_match_field, p_match_type, p_pattern, p_suggested_account_code, p_suggested_category, COALESCE(p_priority,100))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'rule_id', v_id);
  ELSIF p_action = 'update' THEN
    UPDATE reconciliation_rules SET
      name = COALESCE(p_name, name), match_field = COALESCE(p_match_field, match_field),
      match_type = COALESCE(p_match_type, match_type), pattern = COALESCE(p_pattern, pattern),
      suggested_account_code = COALESCE(p_suggested_account_code, suggested_account_code),
      suggested_category = COALESCE(p_suggested_category, suggested_category),
      priority = COALESCE(p_priority, priority)
    WHERE id = p_rule_id;
    RETURN jsonb_build_object('success', true, 'rule_id', p_rule_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM reconciliation_rules WHERE id = p_rule_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_rule_id);
  ELSE RAISE EXCEPTION 'Unknown action: %', p_action; END IF;
END; $$;
GRANT ALL ON FUNCTION "public"."manage_reconciliation_rule"("text","uuid","text","text","text","text","text","text",integer) TO "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "public"."reconciliation_report"(
  "p_from" "date" DEFAULT NULL, "p_to" "date" DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "sql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
  SELECT jsonb_build_object(
    'success', true, 'from', p_from, 'to', p_to,
    'total_count', count(*),
    'total_cents', COALESCE(sum(amount_cents),0),
    'matched_count', count(*) FILTER (WHERE status = 'matched'),
    'matched_cents', COALESCE(sum(amount_cents) FILTER (WHERE status = 'matched'),0),
    'unmatched_count', count(*) FILTER (WHERE status = 'unmatched'),
    'unmatched_cents', COALESCE(sum(amount_cents) FILTER (WHERE status = 'unmatched'),0),
    'rule_suggested_count', count(*) FILTER (WHERE status = 'unmatched' AND matched_rule_id IS NOT NULL))
  FROM bank_transactions
  WHERE (p_from IS NULL OR transaction_date >= p_from)
    AND (p_to IS NULL OR transaction_date <= p_to);
$$;
GRANT ALL ON FUNCTION "public"."reconciliation_report"("date","date") TO "anon", "authenticated", "service_role";

-- ── Expense policies ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."evaluate_expense_policy"(
  "p_category" "text", "p_amount_cents" bigint, "p_has_receipt" boolean DEFAULT false
) RETURNS "jsonb" LANGUAGE "plpgsql" STABLE SET "search_path" TO 'public' AS $$
DECLARE v_pol RECORD; v_violations jsonb := '[]'::jsonb; v_requires_approval boolean := false;
BEGIN
  SELECT * INTO v_pol FROM expense_policies
  WHERE is_active AND category IN (p_category, '*')
  ORDER BY (category = p_category) DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'allowed', true, 'requires_approval', false,
      'violations', '[]'::jsonb, 'policy', NULL);
  END IF;
  IF v_pol.max_amount_cents IS NOT NULL AND p_amount_cents > v_pol.max_amount_cents THEN
    v_violations := v_violations || jsonb_build_object('code', 'over_limit',
      'limit_cents', v_pol.max_amount_cents, 'amount_cents', p_amount_cents);
  END IF;
  IF v_pol.requires_receipt AND NOT COALESCE(p_has_receipt, false) THEN
    v_violations := v_violations || jsonb_build_object('code', 'missing_receipt');
  END IF;
  IF v_pol.requires_approval_over_cents IS NOT NULL AND p_amount_cents > v_pol.requires_approval_over_cents THEN
    v_requires_approval := true;
    v_violations := v_violations || jsonb_build_object('code', 'needs_approval',
      'threshold_cents', v_pol.requires_approval_over_cents);
  END IF;
  RETURN jsonb_build_object('success', true,
    'allowed', NOT (v_violations @> '[{"code":"over_limit"}]' OR v_violations @> '[{"code":"missing_receipt"}]'),
    'requires_approval', v_requires_approval, 'violations', v_violations,
    'policy', jsonb_build_object('category', v_pol.category, 'max_amount_cents', v_pol.max_amount_cents,
      'requires_receipt', v_pol.requires_receipt, 'requires_approval_over_cents', v_pol.requires_approval_over_cents));
END; $$;
GRANT ALL ON FUNCTION "public"."evaluate_expense_policy"("text",bigint,boolean) TO "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "public"."manage_expense_policy"(
  "p_action" "text", "p_policy_id" "uuid" DEFAULT NULL, "p_category" "text" DEFAULT NULL,
  "p_max_amount_cents" bigint DEFAULT NULL, "p_requires_receipt" boolean DEFAULT NULL,
  "p_requires_approval_over_cents" bigint DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')); v_id uuid;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify expense policies'; END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'policies',
      (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.category), '[]'::jsonb) FROM expense_policies p));
  ELSIF p_action = 'upsert' THEN
    IF p_category IS NULL THEN RAISE EXCEPTION 'category required'; END IF;
    INSERT INTO expense_policies (category, max_amount_cents, requires_receipt, requires_approval_over_cents)
    VALUES (p_category, p_max_amount_cents, COALESCE(p_requires_receipt,false), p_requires_approval_over_cents)
    ON CONFLICT (category) DO UPDATE SET
      max_amount_cents = EXCLUDED.max_amount_cents,
      requires_receipt = EXCLUDED.requires_receipt,
      requires_approval_over_cents = EXCLUDED.requires_approval_over_cents, updated_at = now()
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'policy_id', v_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM expense_policies WHERE id = p_policy_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_policy_id);
  ELSE RAISE EXCEPTION 'Unknown action: %', p_action; END IF;
END; $$;
GRANT ALL ON FUNCTION "public"."manage_expense_policy"("text","uuid","text",bigint,boolean,bigint) TO "anon", "authenticated", "service_role";

-- ── Docs L4: versioning + in-app authoring ─────────────────────────────────
ALTER TABLE "public"."docs_pages" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'github';
ALTER TABLE "public"."docs_pages" ADD COLUMN IF NOT EXISTS "is_published" boolean NOT NULL DEFAULT true;
ALTER TABLE "public"."docs_pages" ALTER COLUMN "repo_owner" DROP NOT NULL;
ALTER TABLE "public"."docs_pages" ALTER COLUMN "repo_name"  DROP NOT NULL;
ALTER TABLE "public"."docs_pages" ALTER COLUMN "file_path"  DROP NOT NULL;
DROP POLICY IF EXISTS "Public can read docs pages" ON "public"."docs_pages";
CREATE POLICY "Public can read docs pages" ON "public"."docs_pages"
  FOR SELECT TO "authenticated", "anon" USING ("is_published" = true);

CREATE OR REPLACE FUNCTION "public"."manage_docs_page"(
  "p_action" text, "p_id" uuid DEFAULT NULL, "p_title" text DEFAULT NULL,
  "p_content" text DEFAULT NULL, "p_category" text DEFAULT NULL, "p_slug" text DEFAULT NULL,
  "p_frontmatter" jsonb DEFAULT NULL, "p_is_published" boolean DEFAULT NULL,
  "p_version_no" integer DEFAULT NULL, "p_editor" uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row docs_pages%ROWTYPE; v_ver docs_page_versions%ROWTYPE; v_slug text; v_next integer;
BEGIN
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'action required (create|update|delete|restore_version)'; END IF;
  IF p_action = 'create' THEN
    IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'title required'; END IF;
    IF p_content IS NULL OR btrim(p_content) = '' THEN RAISE EXCEPTION 'content required'; END IF;
    v_slug := COALESCE(NULLIF(btrim(p_slug), ''),
                       regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g'));
    v_slug := btrim(v_slug, '-');
    INSERT INTO docs_pages (source, category, title, slug, content, frontmatter, is_published,
                            repo_owner, repo_name, file_path)
    VALUES ('app', COALESCE(NULLIF(btrim(p_category), ''), 'general'), p_title, v_slug, p_content,
            COALESCE(p_frontmatter, '{}'::jsonb), COALESCE(p_is_published, true), NULL, NULL, NULL)
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'action', 'create',
      'id', v_row.id, 'slug', v_row.slug, 'category', v_row.category, 'is_published', v_row.is_published);
  ELSIF p_action = 'update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required for update'; END IF;
    SELECT * INTO v_row FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next FROM docs_page_versions WHERE docs_page_id = v_row.id;
    INSERT INTO docs_page_versions (docs_page_id, version_no, title, content, category, slug, frontmatter, edited_by)
    VALUES (v_row.id, v_next, v_row.title, v_row.content, v_row.category, v_row.slug, v_row.frontmatter, p_editor);
    UPDATE docs_pages SET
      title = COALESCE(p_title, title), content = COALESCE(p_content, content),
      category = COALESCE(NULLIF(btrim(p_category), ''), category),
      slug = COALESCE(NULLIF(btrim(p_slug), ''), slug),
      frontmatter = COALESCE(p_frontmatter, frontmatter),
      is_published = COALESCE(p_is_published, is_published), updated_at = now()
    WHERE id = v_row.id RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'action', 'update', 'id', v_row.id,
      'snapshot_version', v_next, 'is_published', v_row.is_published);
  ELSIF p_action = 'delete' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required for delete'; END IF;
    DELETE FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    RETURN jsonb_build_object('success', true, 'action', 'delete', 'id', p_id);
  ELSIF p_action = 'restore_version' THEN
    IF p_id IS NULL OR p_version_no IS NULL THEN RAISE EXCEPTION 'id and version_no required'; END IF;
    SELECT * INTO v_row FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    SELECT * INTO v_ver FROM docs_page_versions WHERE docs_page_id = p_id AND version_no = p_version_no;
    IF NOT FOUND THEN RAISE EXCEPTION 'version % not found for page %', p_version_no, p_id; END IF;
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next FROM docs_page_versions WHERE docs_page_id = p_id;
    INSERT INTO docs_page_versions (docs_page_id, version_no, title, content, category, slug, frontmatter, edited_by)
    VALUES (p_id, v_next, v_row.title, v_row.content, v_row.category, v_row.slug, v_row.frontmatter, p_editor);
    UPDATE docs_pages SET title = v_ver.title, content = v_ver.content, category = v_ver.category,
      slug = v_ver.slug, frontmatter = v_ver.frontmatter, updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'action', 'restore_version', 'id', p_id,
      'restored_from', p_version_no, 'snapshot_version', v_next);
  ELSE RAISE EXCEPTION 'unknown action: %', p_action; END IF;
END; $$;
GRANT EXECUTE ON FUNCTION "public"."manage_docs_page"(text, uuid, text, text, text, text, jsonb, boolean, integer, uuid) TO "service_role", "authenticated";

-- ── Contact Center omnichannel + voicemail + router ────────────────────────
ALTER TABLE "public"."chat_conversations"
  ADD COLUMN IF NOT EXISTS "channel" "text" NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS "channel_thread_id" "text",
  ADD COLUMN IF NOT EXISTS "contact_phone" "text",
  ADD COLUMN IF NOT EXISTS "contact_id" "uuid";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'chat_conversations_contact_id_fkey'
                   AND table_name = 'chat_conversations') THEN
    ALTER TABLE "public"."chat_conversations" ADD CONSTRAINT "chat_conversations_contact_id_fkey"
      FOREIGN KEY ("contact_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "chat_conversations_channel_thread_idx"
  ON "public"."chat_conversations" ("channel", "channel_thread_id")
  WHERE "channel_thread_id" IS NOT NULL;
ALTER TABLE "public"."support_agents"
  ADD COLUMN IF NOT EXISTS "supported_channels" "text"[] NOT NULL DEFAULT '{web}'::text[];

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'voicemail_messages_conversation_id_fkey'
                   AND table_name = 'voicemail_messages') THEN
    ALTER TABLE "public"."voicemail_messages" ADD CONSTRAINT "voicemail_messages_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "public"."route_conversation_to_agent"(
  "p_conversation_id" "uuid", "p_reason" "text" DEFAULT NULL, "p_urgency" "text" DEFAULT 'normal'
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_channel text;
  v_urgency text := CASE WHEN p_urgency IN ('low','normal','high','urgent') THEN p_urgency ELSE 'normal' END;
  v_agent uuid; v_existing uuid; v_status text;
BEGIN
  SELECT COALESCE(channel, 'web'), assigned_agent_id, conversation_status
    INTO v_channel, v_existing, v_status
  FROM chat_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('action', 'error', 'message', 'Conversation not found'); END IF;
  IF v_status = 'with_agent' AND v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('action', 'handoff_to_agent', 'agent_id', v_existing, 'status', 'with_agent',
      'message', 'Already connected to an agent.');
  END IF;
  SELECT id INTO v_agent FROM support_agents
  WHERE status IN ('online', 'away')
    AND current_conversations < max_conversations
    AND supported_channels @> ARRAY[v_channel]
  ORDER BY current_conversations ASC, last_seen_at DESC LIMIT 1;
  IF v_agent IS NOT NULL THEN
    UPDATE chat_conversations SET assigned_agent_id = v_agent, conversation_status = 'with_agent',
      priority = v_urgency, escalation_reason = p_reason, escalated_at = now(), updated_at = now()
    WHERE id = p_conversation_id;
    UPDATE support_agents SET current_conversations = current_conversations + 1, updated_at = now() WHERE id = v_agent;
    RETURN jsonb_build_object('action', 'handoff_to_agent', 'agent_id', v_agent, 'status', 'with_agent',
      'message', 'Connected you to an available agent.');
  END IF;
  UPDATE chat_conversations SET conversation_status = 'waiting_agent', assigned_agent_id = NULL,
    priority = v_urgency, escalation_reason = p_reason, escalated_at = now(), updated_at = now()
  WHERE id = p_conversation_id;
  INSERT INTO support_escalations (conversation_id, reason, priority)
  VALUES (p_conversation_id, COALESCE(p_reason, 'Human handoff requested'), v_urgency);
  RETURN jsonb_build_object('action', 'create_escalation', 'status', 'waiting_agent',
    'message', 'No agent is available right now — your request is queued and the team will follow up.');
END $$;
GRANT ALL ON FUNCTION "public"."route_conversation_to_agent"("uuid", "text", "text") TO "anon", "authenticated", "service_role";

NOTIFY pgrst, 'reload schema';