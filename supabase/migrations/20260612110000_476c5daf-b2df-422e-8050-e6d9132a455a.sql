-- Floor-wave-1 · F2 (docs/parity/sprint-floor-wave1.md): returns depth.
--   • reason_code (text + CHECK, community-extensible — not a Postgres enum)
--   • restocking_fee_cents — deducted from the refund
--   • QC/inspection state between received → refunded (inspected_at/notes)
--   • refund_return v2: PARTIAL refunds — accumulates refund_amount_cents across
--     calls; status flips to 'refunded' only when the caller marks it final or
--     the cumulative refund reaches the expected total
--   • return_reason_report: read-only analytics per reason_code
-- Additive-only. Idempotent.

ALTER TABLE "public"."returns"
  ADD COLUMN IF NOT EXISTS "reason_code" "text",
  ADD COLUMN IF NOT EXISTS "restocking_fee_cents" bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "inspected_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "inspection_notes" "text";

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints
                 WHERE constraint_name='returns_reason_code_check') THEN
    ALTER TABLE "public"."returns" ADD CONSTRAINT "returns_reason_code_check"
      CHECK ("reason_code" IS NULL OR "reason_code" IN
        ('defective','wrong_item','not_as_described','changed_mind','damaged_in_transit','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints
                 WHERE constraint_name='returns_restocking_fee_nonneg') THEN
    ALTER TABLE "public"."returns" ADD CONSTRAINT "returns_restocking_fee_nonneg"
      CHECK ("restocking_fee_cents" >= 0);
  END IF;
END $$;

-- inspect_return: QC step between received and refunded
CREATE OR REPLACE FUNCTION "public"."inspect_return"(
  "p_return_id" "uuid",
  "p_notes" "text" DEFAULT NULL,
  "p_restocking_fee_cents" bigint DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can inspect returns';
  END IF;
  UPDATE returns
     SET inspected_at = now(),
         inspection_notes = COALESCE(p_notes, inspection_notes),
         restocking_fee_cents = COALESCE(p_restocking_fee_cents, restocking_fee_cents)
   WHERE id = p_return_id AND status = 'received';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found or not in received state', p_return_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'return_id', p_return_id, 'inspected', true);
END $$;
ALTER FUNCTION "public"."inspect_return"("uuid","text",bigint) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."inspect_return"("uuid","text",bigint) TO "anon", "authenticated", "service_role";

-- refund_return v2 (same signature + p_final): partial refunds + restocking fee.
-- expected total = Σ return_items refund − restocking fee. Each call adds
-- p_refund_cents; status → 'refunded' when cumulative ≥ expected or p_final.
CREATE OR REPLACE FUNCTION "public"."refund_return"(
  "p_return_id" "uuid",
  "p_refund_cents" integer,
  "p_method" "text" DEFAULT 'manual'::"text",
  "p_final" boolean DEFAULT false
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_ret RECORD;
  v_expected bigint;
  v_new_total bigint;
  v_done boolean;
BEGIN
  SELECT * INTO v_ret FROM returns WHERE id = p_return_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return % not found', p_return_id; END IF;
  IF v_ret.status NOT IN ('received','approved') THEN
    RAISE EXCEPTION 'Return not in refundable state (status %)', v_ret.status;
  END IF;
  IF p_refund_cents IS NULL OR p_refund_cents <= 0 THEN
    RAISE EXCEPTION 'refund_cents must be positive';
  END IF;

  SELECT COALESCE(SUM(quantity * unit_refund_cents), 0) - v_ret.restocking_fee_cents
  INTO v_expected FROM return_items WHERE return_id = p_return_id;
  IF v_expected < 0 THEN v_expected := 0; END IF;

  v_new_total := COALESCE(v_ret.refund_amount_cents, 0) + p_refund_cents;
  IF v_expected > 0 AND v_new_total > v_expected THEN
    RAISE EXCEPTION 'Refund % would exceed expected total % (items − restocking fee %)',
      v_new_total, v_expected, v_ret.restocking_fee_cents;
  END IF;

  v_done := p_final OR (v_expected > 0 AND v_new_total >= v_expected);

  UPDATE returns
     SET refund_amount_cents = v_new_total,
         refund_method = p_method,
         refund_processed_at = now(),
         status = CASE WHEN v_done THEN 'refunded' ELSE status END
   WHERE id = p_return_id;

  RETURN jsonb_build_object('success', true, 'return_id', p_return_id,
    'refunded_cents', v_new_total, 'expected_cents', v_expected,
    'remaining_cents', GREATEST(v_expected - v_new_total, 0),
    'status', CASE WHEN v_done THEN 'refunded' ELSE v_ret.status END);
END $$;
ALTER FUNCTION "public"."refund_return"("uuid",integer,"text",boolean) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."refund_return"("uuid",integer,"text",boolean) TO "anon", "authenticated", "service_role";

-- drop the old 3-arg overload so the skill resolves unambiguously
DROP FUNCTION IF EXISTS "public"."refund_return"("uuid",integer,"text");

-- return_reason_report: read-only analytics per reason_code
CREATE OR REPLACE FUNCTION "public"."return_reason_report"(
  "p_days" integer DEFAULT 90
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.cnt DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT COALESCE(reason_code, 'unspecified') AS reason_code,
           count(*) AS cnt,
           COALESCE(SUM(refund_amount_cents),0) AS refunded_cents
    FROM returns
    WHERE created_at > now() - make_interval(days => GREATEST(COALESCE(p_days,90),1))
    GROUP BY 1
  ) x;
  RETURN jsonb_build_object('success', true, 'days', COALESCE(p_days,90), 'reasons', v_rows);
END $$;
ALTER FUNCTION "public"."return_reason_report"(integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."return_reason_report"(integer) TO "anon", "authenticated", "service_role";
