-- POS: tipping + gift-card balances
-- (docs/parity/capabilities/pos.json: tipping, gift_card_balance).
-- Tipping is added post-sale via add_tip (keeps the verified record_pos_sale_v2
-- untouched): records pos_sales.tip_cents + a tip payment row. Gift cards get a
-- balance ledger with issue/redeem. No external deps. Idempotent.

ALTER TABLE "public"."pos_sales"
  ADD COLUMN IF NOT EXISTS "tip_cents" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."gift_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "initial_balance_cents" integer DEFAULT 0 NOT NULL,
    "balance_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'SEK' NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gift_cards_code_key" UNIQUE ("code"),
    CONSTRAINT "gift_cards_balance_nonneg" CHECK ("balance_cents" >= 0)
);

ALTER TABLE "public"."gift_cards" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_gift_cards_updated_at" ON "public"."gift_cards";
CREATE TRIGGER "update_gift_cards_updated_at" BEFORE UPDATE ON "public"."gift_cards"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."gift_cards" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage gift cards" ON "public"."gift_cards";
CREATE POLICY "Admins manage gift cards" ON "public"."gift_cards"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view gift cards" ON "public"."gift_cards";
CREATE POLICY "Staff view gift cards" ON "public"."gift_cards"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role")
  );
GRANT ALL ON TABLE "public"."gift_cards" TO "anon", "authenticated", "service_role";

-- add_tip: attach a tip to an existing sale (post-tender). Writer-gated.
CREATE OR REPLACE FUNCTION "public"."add_tip"(
  "p_sale_id" "uuid", "p_tip_cents" integer, "p_method" "text" DEFAULT 'card'
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_sale RECORD;
BEGIN
  IF NOT (auth.role()='service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Not authorized to add tips';
  END IF;
  IF p_tip_cents IS NULL OR p_tip_cents <= 0 THEN RAISE EXCEPTION 'tip_cents must be positive'; END IF;
  SELECT id, total_cents, tip_cents INTO v_sale FROM pos_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  UPDATE pos_sales SET tip_cents = tip_cents + p_tip_cents WHERE id = p_sale_id;
  INSERT INTO pos_payments (sale_id, method, amount_cents, reference)
    VALUES (p_sale_id, p_method, p_tip_cents, 'tip');
  RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id,
    'tip_cents', v_sale.tip_cents + p_tip_cents,
    'grand_total_cents', v_sale.total_cents + v_sale.tip_cents + p_tip_cents);
END; $$;
ALTER FUNCTION "public"."add_tip"("uuid",integer,"text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."add_tip"("uuid",integer,"text") TO "anon","authenticated","service_role";

-- manage_gift_card: issue/list/get/deactivate. Writer-gated for mutations.
CREATE OR REPLACE FUNCTION "public"."manage_gift_card"(
  "p_action" "text", "p_code" "text" DEFAULT NULL, "p_amount_cents" integer DEFAULT NULL,
  "p_currency" "text" DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_id uuid; v_res jsonb; v_gc RECORD;
BEGIN
  IF p_action IN ('issue','deactivate') AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can manage gift cards'; END IF;
  IF p_action='issue' THEN
    IF p_code IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'code and positive amount_cents required'; END IF;
    INSERT INTO gift_cards(code, initial_balance_cents, balance_cents, currency)
      VALUES (p_code, p_amount_cents, p_amount_cents, COALESCE(p_currency,'SEK')) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success',true,'gift_card_id',v_id,'balance_cents',p_amount_cents);
  ELSIF p_action='get' THEN
    SELECT * INTO v_gc FROM gift_cards WHERE code = p_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gift card % not found', p_code; END IF;
    RETURN jsonb_build_object('success',true,'gift_card',to_jsonb(v_gc));
  ELSIF p_action='list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.created_at DESC),'[]'::jsonb) INTO v_res FROM gift_cards g;
    RETURN jsonb_build_object('success',true,'gift_cards',v_res);
  ELSIF p_action='deactivate' THEN
    UPDATE gift_cards SET is_active=false WHERE code=p_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gift card % not found', p_code; END IF;
    RETURN jsonb_build_object('success',true,'code',p_code,'is_active',false);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use issue|get|list|deactivate', p_action; END IF;
END; $$;
ALTER FUNCTION "public"."manage_gift_card"("text","text",integer,"text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_gift_card"("text","text",integer,"text") TO "anon","authenticated","service_role";

-- redeem_gift_card: decrement balance (guards insufficient funds / inactive). Writer-gated.
CREATE OR REPLACE FUNCTION "public"."redeem_gift_card"(
  "p_code" "text", "p_amount_cents" integer
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_gc RECORD;
BEGIN
  IF NOT (auth.role()='service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Not authorized to redeem gift cards';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'amount_cents must be positive'; END IF;
  SELECT * INTO v_gc FROM gift_cards WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift card % not found', p_code; END IF;
  IF NOT v_gc.is_active THEN RAISE EXCEPTION 'Gift card % is inactive', p_code; END IF;
  IF v_gc.balance_cents < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', v_gc.balance_cents, p_amount_cents;
  END IF;
  UPDATE gift_cards SET balance_cents = balance_cents - p_amount_cents WHERE id = v_gc.id;
  RETURN jsonb_build_object('success',true,'code',p_code,'redeemed_cents',p_amount_cents,
    'remaining_balance_cents', v_gc.balance_cents - p_amount_cents);
END; $$;
ALTER FUNCTION "public"."redeem_gift_card"("text",integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."redeem_gift_card"("text",integer) TO "anon","authenticated","service_role";
