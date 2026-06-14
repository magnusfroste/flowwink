-- Accounting: budgets + budget-vs-actual (docs/parity/capabilities/accounting.json#budgets).
-- Adds a per-account budget table (annual or per-month) and budget_vs_actual(), which
-- compares budgeted amounts to the net actual movement (Σ debit−credit) on posted
-- journal lines for the period. manage_budget CRUD. Pure read for the report.
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_code" "text" NOT NULL,
    "fiscal_year" integer NOT NULL,
    "period_month" integer,                 -- NULL = annual budget; 1..12 = that month
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'SEK' NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budgets_period_month_check" CHECK ("period_month" IS NULL OR "period_month" BETWEEN 1 AND 12)
);

-- one budget row per account/year/period (NULL period treated as -1 for uniqueness)
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_account_year_period_key"
  ON "public"."budgets" ("account_code", "fiscal_year", (COALESCE("period_month", -1)));

ALTER TABLE "public"."budgets" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_budgets_updated_at" ON "public"."budgets";
CREATE TRIGGER "update_budgets_updated_at"
  BEFORE UPDATE ON "public"."budgets"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage budgets" ON "public"."budgets";
CREATE POLICY "Admins manage budgets" ON "public"."budgets"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view budgets" ON "public"."budgets";
CREATE POLICY "Staff view budgets" ON "public"."budgets"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role")
  );
GRANT ALL ON TABLE "public"."budgets" TO "anon", "authenticated", "service_role";

-- budget_vs_actual: per account_code, budgeted vs net actual (Σ debit−credit) on
-- non-draft journal lines. p_period_month NULL → annual (annual budget rows + full
-- year actuals); given → that month's budget rows + that month's actuals.
CREATE OR REPLACE FUNCTION "public"."budget_vs_actual"(
  "p_fiscal_year" integer, "p_period_month" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE v_rows jsonb;
BEGIN
  WITH bud AS (
    SELECT account_code, SUM(amount_cents) AS budget_cents
    FROM budgets
    WHERE fiscal_year = p_fiscal_year
      AND ((p_period_month IS NULL AND period_month IS NULL)
        OR (p_period_month IS NOT NULL AND period_month = p_period_month))
    GROUP BY account_code
  ),
  act AS (
    SELECT l.account_code, SUM(l.debit_cents - l.credit_cents) AS actual_cents
    FROM journal_entry_lines l
    JOIN journal_entries je ON je.id = l.journal_entry_id
    WHERE EXTRACT(YEAR FROM je.entry_date)::int = p_fiscal_year
      AND (p_period_month IS NULL OR EXTRACT(MONTH FROM je.entry_date)::int = p_period_month)
      AND je.status <> 'draft'
    GROUP BY l.account_code
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'account_code', account_code,
    'budget_cents', COALESCE(budget_cents, 0),
    'actual_cents', COALESCE(actual_cents, 0),
    'variance_cents', COALESCE(budget_cents,0) - COALESCE(actual_cents,0)
  ) ORDER BY account_code), '[]'::jsonb)
  INTO v_rows
  FROM (SELECT account_code FROM bud UNION SELECT account_code FROM act) k
  LEFT JOIN bud USING (account_code)
  LEFT JOIN act USING (account_code);

  RETURN jsonb_build_object(
    'success', true,
    'fiscal_year', p_fiscal_year,
    'period_month', p_period_month,
    'lines', v_rows
  );
END;
$$;

ALTER FUNCTION "public"."budget_vs_actual"(integer, integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."budget_vs_actual"(integer, integer) TO "anon", "authenticated", "service_role";

-- manage_budget: list/upsert/delete budget rows. Writer-gated for mutations.
CREATE OR REPLACE FUNCTION "public"."manage_budget"(
  "p_action" "text",
  "p_budget_id" "uuid" DEFAULT NULL,
  "p_account_code" "text" DEFAULT NULL,
  "p_fiscal_year" integer DEFAULT NULL,
  "p_period_month" integer DEFAULT NULL,
  "p_amount_cents" bigint DEFAULT NULL,
  "p_currency" "text" DEFAULT 'SEK',
  "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify budgets';
  END IF;

  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'budgets', (
      SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.account_code, b.period_month NULLS FIRST), '[]'::jsonb)
      FROM budgets b WHERE p_fiscal_year IS NULL OR b.fiscal_year = p_fiscal_year));

  ELSIF p_action = 'upsert' THEN
    IF p_account_code IS NULL OR p_fiscal_year IS NULL OR p_amount_cents IS NULL THEN
      RAISE EXCEPTION 'account_code, fiscal_year, amount_cents required';
    END IF;
    INSERT INTO budgets (account_code, fiscal_year, period_month, amount_cents, currency, notes, created_by)
    VALUES (p_account_code, p_fiscal_year, p_period_month, p_amount_cents, COALESCE(p_currency,'SEK'), p_notes, auth.uid())
    ON CONFLICT (account_code, fiscal_year, (COALESCE(period_month, -1)))
    DO UPDATE SET amount_cents = EXCLUDED.amount_cents, currency = EXCLUDED.currency, notes = EXCLUDED.notes, updated_at = now()
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'budget_id', v_id);

  ELSIF p_action = 'delete' THEN
    IF p_budget_id IS NULL THEN RAISE EXCEPTION 'budget_id required'; END IF;
    DELETE FROM budgets WHERE id = p_budget_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_budget_id);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|upsert|delete', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_budget"("text","uuid","text",integer,integer,bigint,"text","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_budget"("text","uuid","text",integer,integer,bigint,"text","text") TO "anon", "authenticated", "service_role";
