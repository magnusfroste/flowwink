-- Expenses: policy limits (docs/parity/capabilities/expenses.json#policy_limits).
-- Configurable per-category spend policies (max amount, receipt requirement,
-- approval threshold) + evaluate_expense_policy() returning allowed + violations.
-- A category-specific policy wins over the catch-all '*'. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."expense_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL DEFAULT '*',     -- '*' = applies to all categories
    "max_amount_cents" bigint,                   -- NULL = no cap
    "requires_receipt" boolean DEFAULT false NOT NULL,
    "requires_approval_over_cents" bigint,       -- NULL = never force approval
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expense_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_policies_category_key" UNIQUE ("category")
);

ALTER TABLE "public"."expense_policies" OWNER TO "postgres";
DROP TRIGGER IF EXISTS "update_expense_policies_updated_at" ON "public"."expense_policies";
CREATE TRIGGER "update_expense_policies_updated_at"
  BEFORE UPDATE ON "public"."expense_policies"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."expense_policies" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage expense policies" ON "public"."expense_policies";
CREATE POLICY "Admins manage expense policies" ON "public"."expense_policies"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view expense policies" ON "public"."expense_policies";
CREATE POLICY "Staff view expense policies" ON "public"."expense_policies"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role")
  );
GRANT ALL ON TABLE "public"."expense_policies" TO "anon", "authenticated", "service_role";

-- evaluate_expense_policy: returns allowed + requires_approval + violations[] for a
-- prospective expense. Category-specific policy preferred over the '*' catch-all.
-- Hard violations (over_limit, missing_receipt) → allowed=false; over the approval
-- threshold → allowed=true but requires_approval=true.
CREATE OR REPLACE FUNCTION "public"."evaluate_expense_policy"(
  "p_category" "text",
  "p_amount_cents" bigint,
  "p_has_receipt" boolean DEFAULT false
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE
SET "search_path" TO 'public'
AS $$
DECLARE
  v_pol RECORD;
  v_violations jsonb := '[]'::jsonb;
  v_requires_approval boolean := false;
BEGIN
  SELECT * INTO v_pol FROM expense_policies
  WHERE is_active AND category IN (p_category, '*')
  ORDER BY (category = p_category) DESC   -- specific before catch-all
  LIMIT 1;

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

  RETURN jsonb_build_object(
    'success', true,
    'allowed', NOT (v_violations @> '[{"code":"over_limit"}]' OR v_violations @> '[{"code":"missing_receipt"}]'),
    'requires_approval', v_requires_approval,
    'violations', v_violations,
    'policy', jsonb_build_object('category', v_pol.category, 'max_amount_cents', v_pol.max_amount_cents,
      'requires_receipt', v_pol.requires_receipt, 'requires_approval_over_cents', v_pol.requires_approval_over_cents)
  );
END;
$$;
ALTER FUNCTION "public"."evaluate_expense_policy"("text",bigint,boolean) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."evaluate_expense_policy"("text",bigint,boolean) TO "anon", "authenticated", "service_role";

-- manage_expense_policy: CRUD
CREATE OR REPLACE FUNCTION "public"."manage_expense_policy"(
  "p_action" "text", "p_policy_id" "uuid" DEFAULT NULL, "p_category" "text" DEFAULT NULL,
  "p_max_amount_cents" bigint DEFAULT NULL, "p_requires_receipt" boolean DEFAULT NULL,
  "p_requires_approval_over_cents" bigint DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
AS $$
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
      requires_approval_over_cents = EXCLUDED.requires_approval_over_cents,
      updated_at = now()
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'policy_id', v_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM expense_policies WHERE id = p_policy_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_policy_id);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|upsert|delete', p_action; END IF;
END;
$$;
ALTER FUNCTION "public"."manage_expense_policy"("text","uuid","text",bigint,boolean,bigint) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_expense_policy"("text","uuid","text",bigint,boolean,bigint) TO "anon", "authenticated", "service_role";
