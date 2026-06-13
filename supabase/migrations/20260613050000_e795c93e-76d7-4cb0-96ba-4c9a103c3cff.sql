-- POS: tipping + gift-card balances
-- (docs/parity/capabilities/pos.json: tipping, gift_card_balance).
-- Adds pos_sales.tip_cents + record_pos_tip (record a tip on a sale, kept separate
-- from subtotal/tax) and a gift_cards ledger with manage_gift_card / redeem_gift_card
-- (balance guarded against over-redemption). No external deps. Idempotent.

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

-- record_pos_tip: attach/replace a tip on a completed sale (tip is on top of total).
CREATE OR REPLACE FUNCTION "public"."record_pos_tip"("p_sale_id" "uuid", "p_tip_cents" integer)
RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin'));
BEGIN
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can record tips'; END IF;
  IF p_tip_cents IS NULL OR p_tip_cents < 0 THEN RAISE EXCEPTION 'tip_cents must be >= 0'; END IF;
  UPDATE pos_sales SET tip_cents = p_tip_cents WHERE id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id, 'tip_cents', p_tip_cents);
END; $$;
ALTER FUNCTION "public"."record_pos_tip"("uuid",integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."record_pos_tip"("uuid",integer) TO "anon","authenticated","service_role";

-- manage_gift_card: issue / get / deactivate. Writer-gated (get is read).
CREATE OR REPLACE FUNCTION "public"."manage_gift_card"(
  "p_action" "text", "p_code" "text" DEFAULT NULL, "p_amount_cents" integer DEFAULT NULL,
  "p_currency" "text" DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_id uuid; v_rec RECORD;
BEGIN
  IF p_action IN ('issue','deactivate','topup') AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can manage gift cards'; END IF;
  IF p_action = 'issue' THEN
    IF p_code IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
      RAISE EXCEPTION 'code and positive amount_cents required'; END IF;
    INSERT INTO gift_cards(code, initial_balance_cents, balance_cents, currency)
      VALUES (p_code, p_amount_cents, p_amount_cents, COALESCE(p_currency,'SEK')) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'gift_card_id', v_id, 'balance_cents', p_amount_cents);
  ELSIF p_action = 'get' THEN
    SELECT * INTO v_rec FROM gift_cards WHERE code = p_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gift card % not found', p_code; END IF;
    RETURN jsonb_build_object('success', true, 'code', v_rec.code, 'balance_cents', v_rec.balance_cents,
      'currency', v_rec.currency, 'is_active', v_rec.is_active);
  ELSIF p_action = 'topup' THEN
    UPDATE gift_cards SET balance_cents = balance_cents + p_amount_cents WHERE code = p_code AND is_active
      RETURNING balance_cents INTO v_rec;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active gift card % not found', p_code; END IF;
    RETURN jsonb_build_object('success', true, 'code', p_code, 'balance_cents', v_rec.balance_cents);
  ELSIF p_action = 'deactivate' THEN
    UPDATE gift_cards SET is_active = false WHERE code = p_code;
    RETURN jsonb_build_object('success', true, 'code', p_code, 'is_active', false);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use issue|get|topup|deactivate', p_action; END IF;
END; $$;
ALTER FUNCTION "public"."manage_gift_card"("text","text",integer,"text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_gift_card"("text","text",integer,"text") TO "anon","authenticated","service_role";

-- redeem_gift_card: decrement balance by amount (clamped; guarded against over-redeem).
CREATE OR REPLACE FUNCTION "public"."redeem_gift_card"("p_code" "text", "p_amount_cents" integer)
RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_bal integer; v_redeemed integer;
BEGIN
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can redeem gift cards'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'amount_cents must be > 0'; END IF;
  SELECT balance_cents INTO v_bal FROM gift_cards WHERE code = p_code AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active gift card % not found', p_code; END IF;
  IF v_bal <= 0 THEN RAISE EXCEPTION 'Gift card % has no balance', p_code; END IF;
  v_redeemed := LEAST(v_bal, p_amount_cents);
  UPDATE gift_cards SET balance_cents = balance_cents - v_redeemed WHERE code = p_code;
  RETURN jsonb_build_object('success', true, 'code', p_code, 'redeemed_cents', v_redeemed,
    'remaining_cents', v_bal - v_redeemed, 'fully_covered', v_redeemed >= p_amount_cents);
END; $$;
ALTER FUNCTION "public"."redeem_gift_card"("text",integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."redeem_gift_card"("text",integer) TO "anon","authenticated","service_role";
