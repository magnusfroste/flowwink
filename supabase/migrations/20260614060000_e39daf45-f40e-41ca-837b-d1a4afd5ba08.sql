-- Reconciliation: rule engine + report (docs/parity/capabilities/reconciliation.json).
-- rule_engine: configurable match rules that tag unmatched bank_transactions with a
-- suggested account/category, by priority. reconciliation_report: matched/unmatched
-- totals for a period. Idempotent throughout.

CREATE TABLE IF NOT EXISTS "public"."reconciliation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "match_field" "text" NOT NULL,
    "match_type" "text" NOT NULL,
    "pattern" "text" NOT NULL,
    "suggested_account_code" "text",
    "suggested_category" "text",
    "priority" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reconciliation_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reconciliation_rules_field_check" CHECK ("match_field" IN ('counterparty','reference','description')),
    CONSTRAINT "reconciliation_rules_type_check" CHECK ("match_type" IN ('contains','equals','regex'))
);

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

ALTER TABLE "public"."reconciliation_rules" OWNER TO "postgres";
DROP TRIGGER IF EXISTS "update_reconciliation_rules_updated_at" ON "public"."reconciliation_rules";
CREATE TRIGGER "update_reconciliation_rules_updated_at"
  BEFORE UPDATE ON "public"."reconciliation_rules"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."reconciliation_rules" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage reconciliation rules" ON "public"."reconciliation_rules";
CREATE POLICY "Admins manage reconciliation rules" ON "public"."reconciliation_rules"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view reconciliation rules" ON "public"."reconciliation_rules";
CREATE POLICY "Staff view reconciliation rules" ON "public"."reconciliation_rules"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role")
  );
GRANT ALL ON TABLE "public"."reconciliation_rules" TO "anon", "authenticated", "service_role";

-- apply_reconciliation_rules: tag unmatched txns (no rule yet) with the highest-
-- priority matching rule's suggested account/category.
CREATE OR REPLACE FUNCTION "public"."apply_reconciliation_rules"() RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
AS $$
DECLARE
  v_bt RECORD; v_rule RECORD; v_tagged int := 0; v_field text; v_ok boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
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
        v_tagged := v_tagged + 1;
        EXIT;  -- first (highest-priority) match wins
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'tagged', v_tagged);
END;
$$;
ALTER FUNCTION "public"."apply_reconciliation_rules"() OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."apply_reconciliation_rules"() TO "anon", "authenticated", "service_role";

-- manage_reconciliation_rule: CRUD
CREATE OR REPLACE FUNCTION "public"."manage_reconciliation_rule"(
  "p_action" "text", "p_rule_id" "uuid" DEFAULT NULL, "p_name" "text" DEFAULT NULL,
  "p_match_field" "text" DEFAULT NULL, "p_match_type" "text" DEFAULT NULL, "p_pattern" "text" DEFAULT NULL,
  "p_suggested_account_code" "text" DEFAULT NULL, "p_suggested_category" "text" DEFAULT NULL,
  "p_priority" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
AS $$
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
    IF p_rule_id IS NULL THEN RAISE EXCEPTION 'rule_id required'; END IF;
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
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action; END IF;
END;
$$;
ALTER FUNCTION "public"."manage_reconciliation_rule"("text","uuid","text","text","text","text","text","text",integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_reconciliation_rule"("text","uuid","text","text","text","text","text","text",integer) TO "anon", "authenticated", "service_role";

-- reconciliation_report: matched/unmatched totals for a period.
CREATE OR REPLACE FUNCTION "public"."reconciliation_report"(
  "p_from" "date" DEFAULT NULL, "p_to" "date" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "sql" STABLE SECURITY DEFINER SET "search_path" TO 'public'
AS $$
  SELECT jsonb_build_object(
    'success', true, 'from', p_from, 'to', p_to,
    'total_count', count(*),
    'total_cents', COALESCE(sum(amount_cents),0),
    'matched_count', count(*) FILTER (WHERE status = 'matched'),
    'matched_cents', COALESCE(sum(amount_cents) FILTER (WHERE status = 'matched'),0),
    'unmatched_count', count(*) FILTER (WHERE status = 'unmatched'),
    'unmatched_cents', COALESCE(sum(amount_cents) FILTER (WHERE status = 'unmatched'),0),
    'rule_suggested_count', count(*) FILTER (WHERE status = 'unmatched' AND matched_rule_id IS NOT NULL)
  )
  FROM bank_transactions
  WHERE (p_from IS NULL OR transaction_date >= p_from)
    AND (p_to IS NULL OR transaction_date <= p_to);
$$;
ALTER FUNCTION "public"."reconciliation_report"("date","date") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."reconciliation_report"("date","date") TO "anon", "authenticated", "service_role";
