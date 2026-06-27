-- Reconciliation migration: re-applies the schema for modules whose
-- backdated migrations were SKIPPED by dev.flowwink.com's migration ledger
-- (the repo lineage and Lovable Cloud's ledger are disjoint, so migrations
-- with timestamps older than the ledger HEAD never ran). Forward-dated so
-- Lovable's runner picks it up. Fully idempotent (re-bundles the original
-- CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE blocks). Safe on fresh
-- installs (no-op) and on the drifted dev DB (creates the 23 missing tables).
-- Covers: approvals, budgets, business hours/calendar, cowork chat,
-- docs versions, field-service (equipment/maintenance), expense policies,
-- gift cards, inventory counts, landed costs, manufacturing, project
-- milestones, reconciliation rules, shipping rates, stock valuation, voicemail.

-- ===== 20260611200000_8c5225e8-f335-4397-9ddc-2858361375b8.sql =====
-- EPIC-02 issues 02.1 + 02.2 (docs/parity/epics/EPIC-02-inventory-valuation.md):
-- Inventory valuation layers + COGS posting. Every inbound stock move creates a
-- valuation layer (cost resolved from the PO line, explicit move cost, or
-- products.cost_cents); every outbound move consumes layers per the category's
-- costing method (fifo | average), stamps the move with its cost, and — when tied
-- to a sale (order / pos_sale) — posts Dt COGS / Cr Inventory. Receipts from
-- purchase orders post Dt Inventory / Cr GRNI.
--
-- BAS-2024 defaults (overridable by editing this function set):
--   1460 Lager av handelsvaror (inventory) · 4990 Lagerförändring (COGS)
--   2441 GRNI (ej fakturerade leveranser)
-- Valuation starts at migration time (no retroactive layers). Idempotent.

-- ── Cost configuration ──────────────────────────────────────────────────────
ALTER TABLE "public"."product_categories"
  ADD COLUMN IF NOT EXISTS "costing_method" "text" DEFAULT 'average' NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints
                 WHERE constraint_name='product_categories_costing_method_check') THEN
    ALTER TABLE "public"."product_categories"
      ADD CONSTRAINT "product_categories_costing_method_check"
      CHECK ("costing_method" IN ('fifo','average'));
  END IF;
END $$;

ALTER TABLE "public"."products"
  ADD COLUMN IF NOT EXISTS "cost_cents" bigint;

ALTER TABLE "public"."stock_moves"
  ADD COLUMN IF NOT EXISTS "variant_id" "uuid",
  ADD COLUMN IF NOT EXISTS "unit_cost_cents" bigint,
  ADD COLUMN IF NOT EXISTS "value_cents" bigint;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='stock_moves_variant_id_fkey' AND table_name='stock_moves') THEN
    ALTER TABLE "public"."stock_moves" ADD CONSTRAINT "stock_moves_variant_id_fkey"
      FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ── Valuation layers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."stock_valuation_layers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "variant_id" "uuid",
    "move_id" "uuid",
    "quantity" numeric(14,3) NOT NULL,
    "unit_cost_cents" bigint NOT NULL,
    "value_cents" bigint NOT NULL,
    "remaining_qty" numeric(14,3) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_valuation_layers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "svl_remaining_nonneg" CHECK ("remaining_qty" >= 0),
    CONSTRAINT "svl_product_fkey" FOREIGN KEY ("product_id")
      REFERENCES "public"."products"("id") ON DELETE CASCADE,
    CONSTRAINT "svl_move_fkey" FOREIGN KEY ("move_id")
      REFERENCES "public"."stock_moves"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "svl_open_layers_idx"
  ON "public"."stock_valuation_layers" ("product_id", "created_at")
  WHERE "remaining_qty" > 0;

ALTER TABLE "public"."stock_valuation_layers" OWNER TO "postgres";
ALTER TABLE "public"."stock_valuation_layers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage stock_valuation_layers" ON "public"."stock_valuation_layers";
CREATE POLICY "Admins manage stock_valuation_layers" ON "public"."stock_valuation_layers"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view stock_valuation_layers" ON "public"."stock_valuation_layers";
CREATE POLICY "Staff view stock_valuation_layers" ON "public"."stock_valuation_layers"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role"));
GRANT ALL ON TABLE "public"."stock_valuation_layers" TO "anon";
GRANT ALL ON TABLE "public"."stock_valuation_layers" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_valuation_layers" TO "service_role";

-- ── Cost resolution for inbound moves ───────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."resolve_inbound_unit_cost"(
  "p_product_id" "uuid", "p_reference_type" "text", "p_reference_id" "text"
) RETURNS bigint
LANGUAGE "plpgsql" STABLE SET "search_path" TO 'public' AS $$
DECLARE v_cost bigint;
BEGIN
  -- 1) purchase order line price
  IF p_reference_type IN ('purchase_order','po','goods_receipt') AND p_reference_id IS NOT NULL THEN
    BEGIN
      SELECT pol.unit_price_cents INTO v_cost
      FROM purchase_order_lines pol
      WHERE pol.product_id = p_product_id
        AND pol.purchase_order_id = p_reference_id::uuid
      LIMIT 1;
    EXCEPTION WHEN others THEN v_cost := NULL; END;
    IF v_cost IS NOT NULL THEN RETURN v_cost; END IF;
  END IF;
  -- 2) product standard cost
  SELECT cost_cents INTO v_cost FROM products WHERE id = p_product_id;
  RETURN COALESCE(v_cost, 0);
END $$;
ALTER FUNCTION "public"."resolve_inbound_unit_cost"("uuid","text","text") OWNER TO "postgres";

-- ── Valuation engine: AFTER INSERT on stock_moves ───────────────────────────
CREATE OR REPLACE FUNCTION "public"."process_stock_move_valuation"() RETURNS "trigger"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_qty numeric := abs(COALESCE(NEW.quantity,0));
  v_is_in boolean;
  v_method text;
  v_unit_cost bigint;
  v_total_cost bigint := 0;
  v_layer RECORD;
  v_take numeric;
  v_remaining numeric;
  v_avg numeric;
  v_je uuid;
BEGIN
  IF v_qty = 0 THEN RETURN NEW; END IF;
  -- internal transfers don't change valuation
  IF NEW.move_type NOT IN ('in','out','mo_production','mo_consumption') THEN RETURN NEW; END IF;
  v_is_in := (NEW.move_type IN ('in','mo_production')) AND COALESCE(NEW.quantity,0) > 0;

  IF v_is_in THEN
    v_unit_cost := COALESCE(NEW.unit_cost_cents,
                            resolve_inbound_unit_cost(NEW.product_id, NEW.reference_type, NEW.reference_id));
    INSERT INTO stock_valuation_layers (product_id, variant_id, move_id, quantity, unit_cost_cents, value_cents, remaining_qty)
    VALUES (NEW.product_id, NEW.variant_id, NEW.id, v_qty, v_unit_cost, round(v_qty * v_unit_cost), v_qty);
    UPDATE stock_moves SET unit_cost_cents = v_unit_cost, value_cents = round(v_qty * v_unit_cost)
      WHERE id = NEW.id;
    -- Receipt JE: Dt 1460 inventory / Cr 2441 GRNI (only for purchase receipts with value)
    IF NEW.reference_type IN ('purchase_order','po','goods_receipt') AND v_unit_cost > 0 THEN
      BEGIN
        INSERT INTO journal_entries (entry_date, description, source, status)
        VALUES (CURRENT_DATE, 'Inventory receipt '||COALESCE(NEW.reference_id,''), 'inventory_receipt', 'posted')
        RETURNING id INTO v_je;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
        VALUES (v_je, '1460', round(v_qty*v_unit_cost), 0, 'Lager av handelsvaror'),
               (v_je, '2441', 0, round(v_qty*v_unit_cost), 'GRNI — ej fakturerade leveranser');
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'inventory_receipt JE skipped: %', SQLERRM;
      END;
    END IF;
    RETURN NEW;
  END IF;

  -- OUTBOUND: consume layers per the category costing method
  SELECT COALESCE(pc.costing_method,'average') INTO v_method
  FROM products p LEFT JOIN product_categories pc ON pc.id = p.category_id
  WHERE p.id = NEW.product_id;
  v_method := COALESCE(v_method,'average');

  IF v_method = 'average' THEN
    SELECT CASE WHEN sum(remaining_qty) > 0
                THEN sum(remaining_qty * unit_cost_cents) / sum(remaining_qty) END
    INTO v_avg FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0;
  END IF;

  v_remaining := v_qty;
  FOR v_layer IN
    SELECT id, remaining_qty, unit_cost_cents FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_layer.remaining_qty, v_remaining);
    v_total_cost := v_total_cost + round(v_take * CASE WHEN v_method='average' THEN v_avg ELSE v_layer.unit_cost_cents END);
    UPDATE stock_valuation_layers SET remaining_qty = remaining_qty - v_take WHERE id = v_layer.id;
    v_remaining := v_remaining - v_take;
  END LOOP;
  -- shortfall (selling more than valued stock): cost the rest at fallback
  IF v_remaining > 0 THEN
    SELECT COALESCE(v_avg, cost_cents, 0) INTO v_unit_cost FROM products WHERE id = NEW.product_id;
    v_total_cost := v_total_cost + round(v_remaining * COALESCE(v_unit_cost,0));
  END IF;

  UPDATE stock_moves SET
    unit_cost_cents = CASE WHEN v_qty > 0 THEN round(v_total_cost / v_qty) ELSE NULL END,
    value_cents = v_total_cost
  WHERE id = NEW.id;

  -- COGS JE only when the out-move is a sale
  IF NEW.reference_type IN ('order','pos_sale') AND v_total_cost > 0 THEN
    BEGIN
      INSERT INTO journal_entries (entry_date, description, source, status)
      VALUES (CURRENT_DATE, 'COGS '||NEW.reference_type||' '||COALESCE(NEW.reference_id,''), 'inventory_cogs', 'posted')
      RETURNING id INTO v_je;
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je, '4990', v_total_cost, 0, 'Kostnad sålda varor'),
             (v_je, '1460', 0, v_total_cost, 'Lager av handelsvaror');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'inventory_cogs JE skipped: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION "public"."process_stock_move_valuation"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "stock_move_valuation_trg" ON "public"."stock_moves";
CREATE TRIGGER "stock_move_valuation_trg" AFTER INSERT ON "public"."stock_moves"
  FOR EACH ROW EXECUTE FUNCTION "public"."process_stock_move_valuation"();

-- Pass variant_id from order lines into the stock move (EPIC-01 tie-in)
CREATE OR REPLACE FUNCTION "public"."trigger_order_item_stock_decrement"() RETURNS "trigger"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.quantity > 0 THEN
    INSERT INTO public.stock_moves (product_id, variant_id, quantity, move_type, reference_type, reference_id, notes)
    VALUES (NEW.product_id, NEW.variant_id, -(NEW.quantity), 'out', 'order', NEW.order_id::text,
            'Auto-decrement from order item');
    UPDATE public.product_stock SET quantity_on_hand = quantity_on_hand - NEW.quantity
      WHERE product_id = NEW.product_id;
    UPDATE public.products SET stock_quantity = GREATEST(COALESCE(stock_quantity,0) - NEW.quantity, 0)
      WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;

-- ── MCP surface: valuation report ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."inventory_valuation_report"(
  "p_limit" integer DEFAULT 50
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_rows jsonb; v_total bigint;
BEGIN
  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'value_cents')::bigint DESC), '[]'::jsonb),
         COALESCE(sum((r->>'value_cents')::bigint), 0)
  INTO v_rows, v_total
  FROM (
    SELECT to_jsonb(x) AS r FROM (
      SELECT p.id AS product_id, p.name,
             sum(l.remaining_qty) AS on_hand_qty,
             round(sum(l.remaining_qty * l.unit_cost_cents)) AS value_cents,
             CASE WHEN sum(l.remaining_qty) > 0
                  THEN round(sum(l.remaining_qty * l.unit_cost_cents) / sum(l.remaining_qty)) END AS avg_unit_cost_cents
      FROM stock_valuation_layers l JOIN products p ON p.id = l.product_id
      WHERE l.remaining_qty > 0
      GROUP BY p.id, p.name
      ORDER BY 4 DESC
      LIMIT GREATEST(COALESCE(p_limit,50),1)
    ) x
  ) y;
  RETURN jsonb_build_object('success', true, 'total_value_cents', v_total, 'products', v_rows);
END $$;
ALTER FUNCTION "public"."inventory_valuation_report"(integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."inventory_valuation_report"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."inventory_valuation_report"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_valuation_report"(integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."resolve_inbound_unit_cost"("uuid","text","text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_inbound_unit_cost"("uuid","text","text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_inbound_unit_cost"("uuid","text","text") TO "service_role";

-- ===== 20260611210000_b1eee0f9-14a8-4216-8a3b-e55b80f6277b.sql =====
-- EPIC-04 issues 04.4–04.6 (docs/parity/epics/EPIC-04-approval-chains.md):
--   04.4 delegation — approval_delegations; advance_approval_step honors active
--        delegations (delegate may act when the delegator is authorized)
--   04.5 expiry/escalation — approval_steps.escalate_after_hours +
--        check_approval_escalations() sweep (escalate-to-next only)
--   04.6 consumer routing — DB-level gates: a PO cannot go draft→sent and an
--        expense report cannot go submitted→approved while an active chain for the
--        entity_type lacks an approved request. request_entity_approval() creates
--        the chain request (idempotent). Gates live in the DB so every surface
--        (admin UI, agent, MCP) respects them.
-- Idempotent.

-- ── 04.4 Delegation ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."approval_delegations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_user" "uuid" NOT NULL,
    "to_user" "uuid" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "approval_delegations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_delegations_not_self" CHECK ("from_user" <> "to_user")
);
ALTER TABLE "public"."approval_delegations" OWNER TO "postgres";
ALTER TABLE "public"."approval_delegations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage approval_delegations" ON "public"."approval_delegations";
CREATE POLICY "Admins manage approval_delegations" ON "public"."approval_delegations"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view approval_delegations" ON "public"."approval_delegations";
CREATE POLICY "Staff view approval_delegations" ON "public"."approval_delegations"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role"));
GRANT ALL ON TABLE "public"."approval_delegations" TO "anon";
GRANT ALL ON TABLE "public"."approval_delegations" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_delegations" TO "service_role";

CREATE OR REPLACE FUNCTION "public"."manage_approval_delegation"(
  "p_action" "text",
  "p_from_user" "uuid" DEFAULT NULL,
  "p_to_user" "uuid" DEFAULT NULL,
  "p_ends_at" timestamp with time zone DEFAULT NULL,
  "p_delegation_id" "uuid" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid;
  v_rows jsonb;
BEGIN
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC), '[]'::jsonb) INTO v_rows
    FROM approval_delegations d
    WHERE (d.ends_at IS NULL OR d.ends_at > now());
    RETURN jsonb_build_object('success', true, 'delegations', v_rows);
  END IF;
  -- a user may delegate their own authority; admins/service may manage any
  IF NOT v_writer AND (p_action <> 'create' OR p_from_user IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can manage other users'' delegations';
  END IF;
  IF p_action = 'create' THEN
    IF p_from_user IS NULL OR p_to_user IS NULL THEN
      RAISE EXCEPTION 'from_user and to_user are required';
    END IF;
    INSERT INTO approval_delegations (from_user, to_user, ends_at)
    VALUES (p_from_user, p_to_user, p_ends_at) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'delegation_id', v_id);
  ELSIF p_action = 'revoke' THEN
    IF p_delegation_id IS NULL THEN RAISE EXCEPTION 'delegation_id required'; END IF;
    UPDATE approval_delegations SET ends_at = now()
    WHERE id = p_delegation_id AND (ends_at IS NULL OR ends_at > now());
    RETURN jsonb_build_object('success', true, 'revoked', p_delegation_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|revoke', p_action;
  END IF;
END $$;
ALTER FUNCTION "public"."manage_approval_delegation"("text","uuid","uuid",timestamptz,"uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_approval_delegation"("text","uuid","uuid",timestamptz,"uuid") TO "anon", "authenticated", "service_role";

-- ── 04.5 Step escalation config + step-entry tracking ───────────────────────
ALTER TABLE "public"."approval_steps"
  ADD COLUMN IF NOT EXISTS "escalate_after_hours" integer;
ALTER TABLE "public"."approval_requests"
  ADD COLUMN IF NOT EXISTS "step_entered_at" timestamp with time zone DEFAULT "now"();

-- ── advance_approval_step v2: delegation-aware + step_entered_at ────────────
CREATE OR REPLACE FUNCTION "public"."advance_approval_step"(
  "p_request_id" "uuid",
  "p_decision" "public"."approval_decision_kind",
  "p_decided_by" "uuid" DEFAULT NULL,
  "p_decided_role" "public"."app_role" DEFAULT NULL,
  "p_comment" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_req RECORD;
  v_step RECORD;
  v_is_service boolean := (auth.role() = 'service_role');
  v_actor uuid := COALESCE(p_decided_by, auth.uid());
  v_role app_role := p_decided_role;
  v_satisfied boolean;
  v_approvals int;
  v_is_last boolean;
  v_authorized boolean;
BEGIN
  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval request % not found', p_request_id; END IF;
  IF v_req.chain_id IS NULL THEN
    RAISE EXCEPTION 'Request % has no chain — use resolve_approval', p_request_id;
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request % is already %', p_request_id, v_req.status;
  END IF;

  SELECT * INTO v_step FROM approval_steps
   WHERE chain_id = v_req.chain_id AND sort_order = v_req.current_step;
  IF NOT FOUND THEN RAISE EXCEPTION 'No step % on chain %', v_req.current_step, v_req.chain_id; END IF;

  -- Authorization: service role bypasses; otherwise the actor must be authorized
  -- directly (role / group member) OR hold an active delegation from someone who is.
  IF v_is_service THEN
    v_authorized := true;
  ELSIF v_step.required_role IS NOT NULL THEN
    v_authorized := has_role(v_actor, v_step.required_role)
      OR EXISTS (SELECT 1 FROM approval_delegations d
                 WHERE d.to_user = v_actor
                   AND now() >= d.starts_at AND (d.ends_at IS NULL OR now() < d.ends_at)
                   AND has_role(d.from_user, v_step.required_role));
  ELSE
    v_authorized := EXISTS (SELECT 1 FROM approval_group_members m
                            WHERE m.group_id = v_step.group_id AND m.user_id = v_actor)
      OR EXISTS (SELECT 1 FROM approval_delegations d
                 JOIN approval_group_members m ON m.user_id = d.from_user AND m.group_id = v_step.group_id
                 WHERE d.to_user = v_actor
                   AND now() >= d.starts_at AND (d.ends_at IS NULL OR now() < d.ends_at));
  END IF;
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'User % is not authorized to act on step %', v_actor, v_req.current_step;
  END IF;

  INSERT INTO approval_decisions (request_id, decision, decided_by, decided_role, comment, step_sort_order)
  VALUES (p_request_id, p_decision, v_actor,
          COALESCE(v_role, v_step.required_role, 'approver'::app_role), p_comment, v_req.current_step);

  IF p_decision = 'reject' THEN
    UPDATE approval_requests
       SET status = 'rejected', resolved_by = v_actor, resolved_at = now()
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'step', v_req.current_step);
  END IF;

  SELECT count(DISTINCT decided_by) INTO v_approvals
  FROM approval_decisions
  WHERE request_id = p_request_id AND step_sort_order = v_req.current_step AND decision = 'approve';

  v_satisfied := (v_approvals >= v_step.min_approvals);
  IF NOT v_satisfied THEN
    RETURN jsonb_build_object('success', true, 'status', 'pending',
      'step', v_req.current_step, 'approvals', v_approvals, 'needed', v_step.min_approvals);
  END IF;

  v_is_last := NOT EXISTS (
    SELECT 1 FROM approval_steps
     WHERE chain_id = v_req.chain_id AND sort_order > v_req.current_step
  );

  IF v_is_last THEN
    UPDATE approval_requests
       SET status = 'approved', resolved_by = v_actor, resolved_at = now()
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'approved', 'step', v_req.current_step);
  ELSE
    UPDATE approval_requests
       SET current_step = (SELECT min(sort_order) FROM approval_steps
                           WHERE chain_id = v_req.chain_id AND sort_order > v_req.current_step),
           step_entered_at = now()
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'pending',
      'advanced_to', (SELECT current_step FROM approval_requests WHERE id = p_request_id));
  END IF;
END $$;

-- ── 04.5 Escalation sweep (escalate-to-next only; cheap, idempotent) ────────
CREATE OR REPLACE FUNCTION "public"."check_approval_escalations"() RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_req RECORD;
  v_next int;
  v_escalated int := 0;
  v_terminal int := 0;
BEGIN
  FOR v_req IN
    SELECT r.id, r.current_step, r.chain_id, s.escalate_after_hours
    FROM approval_requests r
    JOIN approval_steps s ON s.chain_id = r.chain_id AND s.sort_order = r.current_step
    WHERE r.status = 'pending' AND r.chain_id IS NOT NULL
      AND s.escalate_after_hours IS NOT NULL
      AND COALESCE(r.step_entered_at, r.created_at) + make_interval(hours => s.escalate_after_hours) < now()
    FOR UPDATE OF r SKIP LOCKED
  LOOP
    SELECT min(sort_order) INTO v_next FROM approval_steps
    WHERE chain_id = v_req.chain_id AND sort_order > v_req.current_step;
    IF v_next IS NULL THEN
      -- final step overdue — surface it, never auto-approve
      INSERT INTO audit_logs (action, entity_type, entity_id, metadata)
      VALUES ('approval_escalation_overdue', 'approval_request', v_req.id,
              jsonb_build_object('step', v_req.current_step));
      v_terminal := v_terminal + 1;
    ELSE
      UPDATE approval_requests
         SET current_step = v_next, step_entered_at = now(),
             context = COALESCE(context,'{}'::jsonb)
               || jsonb_build_object('escalated_from_step', v_req.current_step, 'escalated_at', now())
       WHERE id = v_req.id;
      INSERT INTO audit_logs (action, entity_type, entity_id, metadata)
      VALUES ('approval_escalated', 'approval_request', v_req.id,
              jsonb_build_object('from_step', v_req.current_step, 'to_step', v_next));
      v_escalated := v_escalated + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'escalated', v_escalated, 'final_step_overdue', v_terminal);
END $$;
ALTER FUNCTION "public"."check_approval_escalations"() OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."check_approval_escalations"() TO "anon", "authenticated", "service_role";

-- ── 04.6 request_entity_approval + DB gates ─────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."request_entity_approval"(
  "p_entity_type" "text",
  "p_entity_id" "text",
  "p_amount_cents" bigint DEFAULT NULL,
  "p_reason" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_chain RECORD;
  v_existing RECORD;
  v_id uuid;
BEGIN
  SELECT c.id, min(s.sort_order) AS first_step INTO v_chain
  FROM approval_chains c JOIN approval_steps s ON s.chain_id = c.id
  WHERE c.entity_type = p_entity_type AND c.is_active
  GROUP BY c.id ORDER BY c.id LIMIT 1;
  IF v_chain.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'chain_required', false);
  END IF;

  SELECT id, status INTO v_existing FROM approval_requests
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id AND chain_id = v_chain.id
  ORDER BY created_at DESC LIMIT 1;
  IF v_existing.id IS NOT NULL AND v_existing.status IN ('pending','approved') THEN
    RETURN jsonb_build_object('success', true, 'chain_required', true,
      'request_id', v_existing.id, 'status', v_existing.status, 'existing', true);
  END IF;

  INSERT INTO approval_requests (entity_type, entity_id, amount_cents, reason, chain_id, current_step, requested_by, step_entered_at)
  VALUES (p_entity_type, p_entity_id, p_amount_cents, p_reason, v_chain.id, v_chain.first_step, auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'chain_required', true, 'request_id', v_id, 'status', 'pending');
END $$;
ALTER FUNCTION "public"."request_entity_approval"("text","text",bigint,"text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."request_entity_approval"("text","text",bigint,"text") TO "anon", "authenticated", "service_role";

-- shared gate check
CREATE OR REPLACE FUNCTION "public"."chain_approval_satisfied"(
  "p_entity_type" "text", "p_entity_id" "text"
) RETURNS boolean
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_has_chain boolean; v_ok boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM approval_chains c JOIN approval_steps s ON s.chain_id=c.id
                 WHERE c.entity_type = p_entity_type AND c.is_active) INTO v_has_chain;
  IF NOT v_has_chain THEN RETURN true; END IF;
  SELECT EXISTS (SELECT 1 FROM approval_requests
                 WHERE entity_type = p_entity_type AND entity_id = p_entity_id
                   AND chain_id IS NOT NULL AND status = 'approved') INTO v_ok;
  RETURN v_ok;
END $$;
ALTER FUNCTION "public"."chain_approval_satisfied"("text","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."chain_approval_satisfied"("text","text") TO "anon", "authenticated", "service_role";

-- PO gate: draft → sent. NB: the gate never creates the request itself (a RAISE
-- would roll that insert back) — the error message tells the caller exactly what
-- to do, which is the self-describing path for agents.
CREATE OR REPLACE FUNCTION "public"."guard_po_chain_approval"() RETURNS "trigger"
LANGUAGE "plpgsql" SET "search_path" TO 'public' AS $$
DECLARE v_pending uuid;
BEGIN
  IF OLD.status = 'draft' AND NEW.status IN ('sent','confirmed')
     AND NOT chain_approval_satisfied('purchase_order', NEW.id::text) THEN
    SELECT id INTO v_pending FROM approval_requests
    WHERE entity_type='purchase_order' AND entity_id=NEW.id::text
      AND chain_id IS NOT NULL AND status='pending' LIMIT 1;
    IF v_pending IS NOT NULL THEN
      RAISE EXCEPTION 'PO % has a pending chain approval (request %). Approve it via advance_approval_step before sending.', NEW.id, v_pending
        USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'PO % requires chain approval before sending. Call request_entity_approval(''purchase_order'', ''%'', %) first.', NEW.id, NEW.id, COALESCE(NEW.total_cents,0)
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION "public"."guard_po_chain_approval"() OWNER TO "postgres";
DROP TRIGGER IF EXISTS "guard_po_chain_approval_trg" ON "public"."purchase_orders";
CREATE TRIGGER "guard_po_chain_approval_trg" BEFORE UPDATE ON "public"."purchase_orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."guard_po_chain_approval"();

-- Expense gate: submitted → approved
CREATE OR REPLACE FUNCTION "public"."guard_expense_chain_approval"() RETURNS "trigger"
LANGUAGE "plpgsql" SET "search_path" TO 'public' AS $$
DECLARE v_pending uuid;
BEGIN
  IF OLD.status = 'submitted' AND NEW.status = 'approved'
     AND NOT chain_approval_satisfied('expense_report', NEW.id::text) THEN
    SELECT id INTO v_pending FROM approval_requests
    WHERE entity_type='expense_report' AND entity_id=NEW.id::text
      AND chain_id IS NOT NULL AND status='pending' LIMIT 1;
    IF v_pending IS NOT NULL THEN
      RAISE EXCEPTION 'Expense report % has a pending chain approval (request %). Approve it via advance_approval_step.', NEW.id, v_pending
        USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'Expense report % requires chain approval. Call request_entity_approval(''expense_report'', ''%'', %) first.', NEW.id, NEW.id, COALESCE(NEW.total_cents,0)
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION "public"."guard_expense_chain_approval"() OWNER TO "postgres";
DROP TRIGGER IF EXISTS "guard_expense_chain_approval_trg" ON "public"."expense_reports";
CREATE TRIGGER "guard_expense_chain_approval_trg" BEFORE UPDATE ON "public"."expense_reports"
  FOR EACH ROW EXECUTE FUNCTION "public"."guard_expense_chain_approval"();

-- ===== 20260611220000_38421186-bbb3-45a1-97d0-3cc92c1f2c8e.sql =====
-- EPIC-02 issue 02.3 (docs/parity/epics/EPIC-02-inventory-valuation.md):
-- Landed cost allocation. Distributes freight/duty/customs across the valuation
-- layers created by a receipt (by_value or by_qty), raising each layer's unit
-- cost, and posts Dt 1460 (inventory) / Cr 5710 (freight reclass) so the cost
-- moves from P&L into stock. Allocation applies to the layers' full original
-- quantity; already-consumed COGS is not restated (v1, documented).
-- Also: EPIC-04 leftovers — bulk approve/reject + approval.assigned events.
-- Idempotent.

CREATE TABLE IF NOT EXISTS "public"."landed_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference_type" "text" NOT NULL,
    "reference_id" "text" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "method" "text" DEFAULT 'by_value' NOT NULL,
    "description" "text",
    "journal_entry_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "landed_costs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "landed_costs_method_check" CHECK ("method" IN ('by_value','by_qty')),
    CONSTRAINT "landed_costs_amount_positive" CHECK ("amount_cents" > 0)
);
ALTER TABLE "public"."landed_costs" OWNER TO "postgres";
ALTER TABLE "public"."landed_costs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage landed_costs" ON "public"."landed_costs";
CREATE POLICY "Admins manage landed_costs" ON "public"."landed_costs"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view landed_costs" ON "public"."landed_costs";
CREATE POLICY "Staff view landed_costs" ON "public"."landed_costs"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role"));
GRANT ALL ON TABLE "public"."landed_costs" TO "anon";
GRANT ALL ON TABLE "public"."landed_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."landed_costs" TO "service_role";

CREATE OR REPLACE FUNCTION "public"."allocate_landed_cost"(
  "p_reference_type" "text",
  "p_reference_id" "text",
  "p_amount_cents" bigint,
  "p_method" "text" DEFAULT 'by_value',
  "p_description" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_layers RECORD;
  v_total_basis numeric := 0;
  v_allocated bigint := 0;
  v_share bigint;
  v_count int := 0;
  v_last_id uuid;
  v_je uuid;
  v_lc uuid;
BEGIN
  IF NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can allocate landed costs';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;
  IF p_method NOT IN ('by_value','by_qty') THEN
    RAISE EXCEPTION 'method must be by_value or by_qty';
  END IF;

  -- Basis: the layers created by this receipt's stock moves
  SELECT COALESCE(SUM(CASE WHEN p_method='by_value' THEN l.value_cents ELSE l.quantity END),0)
  INTO v_total_basis
  FROM stock_valuation_layers l
  JOIN stock_moves m ON m.id = l.move_id
  WHERE m.reference_type = p_reference_type AND m.reference_id = p_reference_id;
  IF v_total_basis <= 0 THEN
    RAISE EXCEPTION 'No valuation layers found for % % (or zero basis)', p_reference_type, p_reference_id;
  END IF;

  -- Allocate proportionally; last layer absorbs rounding remainder
  FOR v_layers IN
    SELECT l.id, l.quantity, l.value_cents
    FROM stock_valuation_layers l
    JOIN stock_moves m ON m.id = l.move_id
    WHERE m.reference_type = p_reference_type AND m.reference_id = p_reference_id
    ORDER BY l.created_at, l.id
    FOR UPDATE OF l
  LOOP
    v_count := v_count + 1;
    v_last_id := v_layers.id;
    v_share := round(p_amount_cents *
      (CASE WHEN p_method='by_value' THEN v_layers.value_cents ELSE v_layers.quantity END)::numeric
      / v_total_basis);
    v_allocated := v_allocated + v_share;
    UPDATE stock_valuation_layers
       SET value_cents = value_cents + v_share,
           unit_cost_cents = CASE WHEN quantity > 0 THEN round((value_cents + v_share)::numeric / quantity) ELSE unit_cost_cents END
     WHERE id = v_layers.id;
  END LOOP;
  -- rounding remainder onto the last layer
  IF v_allocated <> p_amount_cents AND v_last_id IS NOT NULL THEN
    UPDATE stock_valuation_layers
       SET value_cents = value_cents + (p_amount_cents - v_allocated),
           unit_cost_cents = CASE WHEN quantity > 0 THEN round((value_cents + (p_amount_cents - v_allocated))::numeric / quantity) ELSE unit_cost_cents END
     WHERE id = v_last_id;
  END IF;

  -- JE: move the cost from P&L freight into inventory
  BEGIN
    INSERT INTO journal_entries (entry_date, description, source, status)
    VALUES (CURRENT_DATE, 'Landed cost '||p_reference_type||' '||p_reference_id||COALESCE(' — '||p_description,''), 'landed_cost', 'posted')
    RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, '1460', p_amount_cents, 0, 'Lager av handelsvaror — landed cost'),
           (v_je, '5710', 0, p_amount_cents, 'Frakter — omförd till lager');
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'landed_cost JE skipped: %', SQLERRM;
  END;

  INSERT INTO landed_costs (reference_type, reference_id, amount_cents, method, description, journal_entry_id)
  VALUES (p_reference_type, p_reference_id, p_amount_cents, p_method, p_description, v_je)
  RETURNING id INTO v_lc;

  RETURN jsonb_build_object('success', true, 'landed_cost_id', v_lc,
    'layers_adjusted', v_count, 'allocated_cents', p_amount_cents, 'journal_entry_id', v_je);
END $$;
ALTER FUNCTION "public"."allocate_landed_cost"("text","text",bigint,"text","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."allocate_landed_cost"("text","text",bigint,"text","text") TO "anon", "authenticated", "service_role";

-- ── EPIC-04 leftovers ────────────────────────────────────────────────────────
-- Bulk approve/reject over chain requests (any failure is reported, not fatal)
CREATE OR REPLACE FUNCTION "public"."bulk_advance_approvals"(
  "p_request_ids" "uuid"[],
  "p_decision" "public"."approval_decision_kind",
  "p_comment" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_id uuid; v_ok int := 0; v_failed jsonb := '[]'::jsonb; v_res jsonb;
BEGIN
  IF p_request_ids IS NULL OR array_length(p_request_ids,1) IS NULL THEN
    RAISE EXCEPTION 'request_ids must be a non-empty array';
  END IF;
  FOREACH v_id IN ARRAY p_request_ids LOOP
    BEGIN
      v_res := advance_approval_step(v_id, p_decision, NULL, NULL, p_comment);
      v_ok := v_ok + 1;
    EXCEPTION WHEN others THEN
      v_failed := v_failed || jsonb_build_object('request_id', v_id, 'error', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'processed', v_ok,
    'failed', jsonb_array_length(v_failed), 'failures', v_failed);
END $$;
ALTER FUNCTION "public"."bulk_advance_approvals"("uuid"[],"public"."approval_decision_kind","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."bulk_advance_approvals"("uuid"[],"public"."approval_decision_kind","text") TO "anon", "authenticated", "service_role";

-- Approver notification hook: emit a platform event when a chain request is
-- created or advances to a new step (event bus listeners handle email/webhooks).
CREATE OR REPLACE FUNCTION "public"."notify_approval_assigned"() RETURNS "trigger"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
BEGIN
  IF NEW.chain_id IS NULL OR NEW.status <> 'pending' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.current_step IS NOT DISTINCT FROM OLD.current_step THEN RETURN NEW; END IF;
  BEGIN
    PERFORM emit_platform_event('approval.assigned',
      jsonb_build_object(
        'request_id', NEW.id,
        'entity_type', NEW.entity_type,
        'entity_id', NEW.entity_id,
        'chain_id', NEW.chain_id,
        'step', NEW.current_step,
        'amount_cents', NEW.amount_cents),
      'approvals');
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'approval.assigned event skipped: %', SQLERRM;
  END;
  RETURN NEW;
END $$;
ALTER FUNCTION "public"."notify_approval_assigned"() OWNER TO "postgres";
DROP TRIGGER IF EXISTS "notify_approval_assigned_trg" ON "public"."approval_requests";
CREATE TRIGGER "notify_approval_assigned_trg" AFTER INSERT OR UPDATE ON "public"."approval_requests"
  FOR EACH ROW EXECUTE FUNCTION "public"."notify_approval_assigned"();

-- ===== 20260612120000_24ceaa55-cc78-4322-bb4e-5f1cc4017009.sql =====
-- Floor-wave-1 · F4 (docs/parity/sprint-floor-wave1.md): real calendar events.
-- Verify-first finding: the calendar module had NO table — list_events reads
-- bookings. This adds calendar_events (with attendees jsonb) + manage_calendar_event
-- RPC so the module owns standalone events (meetings, deadlines) alongside the
-- bookings it aggregates. Additive-only. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "all_day" boolean DEFAULT false NOT NULL,
    "location" "text",
    "attendees" "jsonb" DEFAULT '[]'::jsonb,
    "related_entity_type" "text",
    "related_entity_id" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_events_time_order" CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at")
);
CREATE INDEX IF NOT EXISTS "calendar_events_starts_idx" ON "public"."calendar_events" ("starts_at");

ALTER TABLE "public"."calendar_events" OWNER TO "postgres";
ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage calendar_events" ON "public"."calendar_events";
CREATE POLICY "Admins manage calendar_events" ON "public"."calendar_events"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view calendar_events" ON "public"."calendar_events";
CREATE POLICY "Staff view calendar_events" ON "public"."calendar_events"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role"));
GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";

DROP TRIGGER IF EXISTS "update_calendar_events_updated_at" ON "public"."calendar_events";
CREATE TRIGGER "update_calendar_events_updated_at"
  BEFORE UPDATE ON "public"."calendar_events"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

CREATE OR REPLACE FUNCTION "public"."manage_calendar_event"(
  "p_action" "text",
  "p_event_id" "uuid" DEFAULT NULL,
  "p_title" "text" DEFAULT NULL,
  "p_description" "text" DEFAULT NULL,
  "p_starts_at" timestamp with time zone DEFAULT NULL,
  "p_ends_at" timestamp with time zone DEFAULT NULL,
  "p_all_day" boolean DEFAULT NULL,
  "p_location" "text" DEFAULT NULL,
  "p_attendees" "jsonb" DEFAULT NULL,
  "p_from" timestamp with time zone DEFAULT NULL,
  "p_to" timestamp with time zone DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_rows jsonb;
BEGIN
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.starts_at), '[]'::jsonb) INTO v_rows
    FROM calendar_events e
    WHERE e.starts_at >= COALESCE(p_from, now() - interval '7 days')
      AND e.starts_at <  COALESCE(p_to, now() + interval '30 days');
    RETURN jsonb_build_object('success', true, 'events', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify calendar events'; END IF;
  IF p_action = 'create' THEN
    IF p_title IS NULL OR p_starts_at IS NULL THEN
      RAISE EXCEPTION 'title and starts_at are required';
    END IF;
    INSERT INTO calendar_events (title, description, starts_at, ends_at, all_day, location, attendees, created_by)
    VALUES (p_title, p_description, p_starts_at, p_ends_at, COALESCE(p_all_day,false), p_location, COALESCE(p_attendees,'[]'::jsonb), auth.uid())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'event_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_event_id IS NULL THEN RAISE EXCEPTION 'event_id is required'; END IF;
    UPDATE calendar_events SET
      title = COALESCE(p_title, title),
      description = COALESCE(p_description, description),
      starts_at = COALESCE(p_starts_at, starts_at),
      ends_at = COALESCE(p_ends_at, ends_at),
      all_day = COALESCE(p_all_day, all_day),
      location = COALESCE(p_location, location),
      attendees = COALESCE(p_attendees, attendees)
    WHERE id = p_event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Event % not found', p_event_id; END IF;
    RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
  ELSIF p_action = 'delete' THEN
    IF p_event_id IS NULL THEN RAISE EXCEPTION 'event_id is required'; END IF;
    DELETE FROM calendar_events WHERE id = p_event_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_event_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END $$;
ALTER FUNCTION "public"."manage_calendar_event"("text","uuid","text","text",timestamptz,timestamptz,boolean,"text","jsonb",timestamptz,timestamptz) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_calendar_event"("text","uuid","text","text",timestamptz,timestamptz,boolean,"text","jsonb",timestamptz,timestamptz) TO "anon", "authenticated", "service_role";

-- ===== 20260612160000_a18ceeb5-c978-437d-ade2-fbb919f79f22.sql =====
-- Agent ergonomics: FlowPilot's voice in Cowork Chat (workspace-chat.agent_post).
-- Cowork Chat was read-only RAG with no persistence; this adds cowork_messages so
-- agents (and humans) can post durable messages — heartbeat insights, daily
-- summaries, "I created 3 leads" notices — surfaced by the chat UI. Mirrors the
-- post_to_river pattern. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."cowork_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_type" "text" DEFAULT 'agent' NOT NULL,
    "author_name" "text" DEFAULT 'FlowPilot' NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::jsonb,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cowork_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cowork_messages_author_type_check"
      CHECK ("author_type" IN ('agent','user','system')),
    CONSTRAINT "cowork_messages_content_not_empty" CHECK (length(trim("content")) > 0)
);
CREATE INDEX IF NOT EXISTS "cowork_messages_created_idx" ON "public"."cowork_messages" ("created_at" DESC);

ALTER TABLE "public"."cowork_messages" OWNER TO "postgres";
ALTER TABLE "public"."cowork_messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage cowork_messages" ON "public"."cowork_messages";
CREATE POLICY "Admins manage cowork_messages" ON "public"."cowork_messages"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view cowork_messages" ON "public"."cowork_messages";
CREATE POLICY "Staff view cowork_messages" ON "public"."cowork_messages"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role"));
GRANT ALL ON TABLE "public"."cowork_messages" TO "anon";
GRANT ALL ON TABLE "public"."cowork_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."cowork_messages" TO "service_role";

CREATE OR REPLACE FUNCTION "public"."post_to_cowork_chat"(
  "p_content" "text",
  "p_author_name" "text" DEFAULT 'FlowPilot',
  "p_metadata" "jsonb" DEFAULT '{}'::jsonb
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_id uuid; v_type text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')
          OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'writer')) THEN
    RAISE EXCEPTION 'Not authorized to post to cowork chat';
  END IF;
  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'content is required';
  END IF;
  v_type := CASE WHEN auth.role() = 'service_role' THEN 'agent' ELSE 'user' END;
  INSERT INTO cowork_messages (author_type, author_name, content, metadata, created_by)
  VALUES (v_type, COALESCE(NULLIF(trim(p_author_name),''),'FlowPilot'), p_content,
          COALESCE(p_metadata,'{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'message_id', v_id);
END $$;
ALTER FUNCTION "public"."post_to_cowork_chat"("text","text","jsonb") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."post_to_cowork_chat"("text","text","jsonb") TO "anon", "authenticated", "service_role";

-- ===== 20260612180000_2bbb6100-8962-4270-99c5-52659205b6f8.sql =====
-- Breadth S3 · maintenance module (Odoo Maintenance parity, wave 1).
-- Equipment registry + maintenance requests (corrective) + preventive schedules
-- (interval-based; a sweep materializes due requests). Additive. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "serial_number" "text",
    "category" "text",
    "location" "text",
    "assigned_to" "uuid",
    "purchase_date" "date",
    "warranty_until" "date",
    "fixed_asset_id" "uuid",
    "status" "text" DEFAULT 'operational' NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equipment_status_check"
      CHECK ("status" IN ('operational','under_maintenance','broken','retired'))
);

CREATE TABLE IF NOT EXISTS "public"."maintenance_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "kind" "text" DEFAULT 'corrective' NOT NULL,
    "priority" "text" DEFAULT 'medium' NOT NULL,
    "status" "text" DEFAULT 'new' NOT NULL,
    "assigned_to" "uuid",
    "due_date" "date",
    "completed_at" timestamp with time zone,
    "duration_minutes" integer,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "maintenance_requests_kind_check" CHECK ("kind" IN ('corrective','preventive')),
    CONSTRAINT "maintenance_requests_priority_check" CHECK ("priority" IN ('low','medium','high','critical')),
    CONSTRAINT "maintenance_requests_status_check" CHECK ("status" IN ('new','in_progress','done','cancelled')),
    CONSTRAINT "maintenance_requests_equipment_fkey"
      FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "maintenance_requests_open_idx"
  ON "public"."maintenance_requests" ("equipment_id") WHERE "status" IN ('new','in_progress');

CREATE TABLE IF NOT EXISTS "public"."maintenance_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "interval_days" integer NOT NULL,
    "next_due" "date" NOT NULL,
    "instructions" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "maintenance_schedules_interval_positive" CHECK ("interval_days" > 0),
    CONSTRAINT "maintenance_schedules_equipment_fkey"
      FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipment','maintenance_requests','maintenance_schedules'] LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$s USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Staff view %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Staff view %1$s" ON public.%1$s FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''approver''::public.app_role) OR public.has_role(auth.uid(), ''writer''::public.app_role))', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS "update_equipment_updated_at" ON "public"."equipment";
CREATE TRIGGER "update_equipment_updated_at" BEFORE UPDATE ON "public"."equipment"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
DROP TRIGGER IF EXISTS "update_maintenance_requests_updated_at" ON "public"."maintenance_requests";
CREATE TRIGGER "update_maintenance_requests_updated_at" BEFORE UPDATE ON "public"."maintenance_requests"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

-- manage_equipment / manage_maintenance_request via generic db: handlers needs
-- allowlist — use dedicated RPCs instead (consistent with the rest of the program).
CREATE OR REPLACE FUNCTION "public"."manage_equipment"(
  "p_action" "text",
  "p_equipment_id" "uuid" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL,
  "p_serial_number" "text" DEFAULT NULL,
  "p_category" "text" DEFAULT NULL,
  "p_location" "text" DEFAULT NULL,
  "p_status" "text" DEFAULT NULL,
  "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_rows jsonb;
BEGIN
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.name), '[]'::jsonb) INTO v_rows
    FROM equipment e WHERE p_status IS NULL OR e.status = p_status;
    RETURN jsonb_build_object('success', true, 'equipment', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify equipment'; END IF;
  IF p_action = 'create' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'name is required'; END IF;
    INSERT INTO equipment (name, serial_number, category, location, status, notes)
    VALUES (p_name, p_serial_number, p_category, p_location, COALESCE(p_status,'operational'), p_notes)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'equipment_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_equipment_id IS NULL THEN RAISE EXCEPTION 'equipment_id required'; END IF;
    UPDATE equipment SET
      name = COALESCE(p_name, name), serial_number = COALESCE(p_serial_number, serial_number),
      category = COALESCE(p_category, category), location = COALESCE(p_location, location),
      status = COALESCE(p_status, status), notes = COALESCE(p_notes, notes)
    WHERE id = p_equipment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Equipment % not found', p_equipment_id; END IF;
    RETURN jsonb_build_object('success', true, 'equipment_id', p_equipment_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update', p_action;
  END IF;
END $$;
ALTER FUNCTION "public"."manage_equipment"("text","uuid","text","text","text","text","text","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_equipment"("text","uuid","text","text","text","text","text","text") TO "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "public"."manage_maintenance_request"(
  "p_action" "text",
  "p_request_id" "uuid" DEFAULT NULL,
  "p_equipment_id" "uuid" DEFAULT NULL,
  "p_title" "text" DEFAULT NULL,
  "p_description" "text" DEFAULT NULL,
  "p_kind" "text" DEFAULT NULL,
  "p_priority" "text" DEFAULT NULL,
  "p_status" "text" DEFAULT NULL,
  "p_due_date" "date" DEFAULT NULL,
  "p_duration_minutes" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_rows jsonb;
BEGIN
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb) INTO v_rows
    FROM maintenance_requests r
    WHERE (p_status IS NULL OR r.status = p_status)
      AND (p_equipment_id IS NULL OR r.equipment_id = p_equipment_id);
    RETURN jsonb_build_object('success', true, 'requests', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify maintenance requests'; END IF;
  IF p_action = 'create' THEN
    IF p_equipment_id IS NULL OR p_title IS NULL THEN
      RAISE EXCEPTION 'equipment_id and title are required';
    END IF;
    INSERT INTO maintenance_requests (equipment_id, title, description, kind, priority, due_date, created_by)
    VALUES (p_equipment_id, p_title, p_description, COALESCE(p_kind,'corrective'),
            COALESCE(p_priority,'medium'), p_due_date, auth.uid())
    RETURNING id INTO v_id;
    -- equipment goes under_maintenance on critical correctives
    IF COALESCE(p_priority,'medium') = 'critical' THEN
      UPDATE equipment SET status='under_maintenance' WHERE id=p_equipment_id AND status='operational';
    END IF;
    RETURN jsonb_build_object('success', true, 'request_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id required'; END IF;
    UPDATE maintenance_requests SET
      title = COALESCE(p_title, title), description = COALESCE(p_description, description),
      priority = COALESCE(p_priority, priority), status = COALESCE(p_status, status),
      due_date = COALESCE(p_due_date, due_date),
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      completed_at = CASE WHEN p_status = 'done' THEN now() ELSE completed_at END
    WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request % not found', p_request_id; END IF;
    -- back to operational when the last open request closes
    IF p_status IN ('done','cancelled') THEN
      UPDATE equipment e SET status='operational'
      WHERE e.id = (SELECT equipment_id FROM maintenance_requests WHERE id=p_request_id)
        AND e.status='under_maintenance'
        AND NOT EXISTS (SELECT 1 FROM maintenance_requests r
                        WHERE r.equipment_id=e.id AND r.status IN ('new','in_progress'));
    END IF;
    RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update', p_action;
  END IF;
END $$;
ALTER FUNCTION "public"."manage_maintenance_request"("text","uuid","uuid","text","text","text","text","text","date",integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_maintenance_request"("text","uuid","uuid","text","text","text","text","text","date",integer) TO "anon", "authenticated", "service_role";

-- Preventive sweep: materialize due schedules into requests, roll next_due forward.
CREATE OR REPLACE FUNCTION "public"."run_preventive_maintenance"() RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_s RECORD; v_created int := 0;
BEGIN
  FOR v_s IN
    SELECT * FROM maintenance_schedules
    WHERE is_active AND next_due <= CURRENT_DATE
    FOR UPDATE SKIP LOCKED
  LOOP
    -- skip if an open preventive request for this schedule's title already exists
    IF NOT EXISTS (SELECT 1 FROM maintenance_requests
                   WHERE equipment_id = v_s.equipment_id AND kind='preventive'
                     AND title = v_s.title AND status IN ('new','in_progress')) THEN
      INSERT INTO maintenance_requests (equipment_id, title, description, kind, priority, due_date)
      VALUES (v_s.equipment_id, v_s.title, v_s.instructions, 'preventive', 'medium', v_s.next_due);
      v_created := v_created + 1;
    END IF;
    UPDATE maintenance_schedules SET next_due = v_s.next_due + (v_s.interval_days || ' days')::interval
    WHERE id = v_s.id;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'created', v_created);
END $$;
ALTER FUNCTION "public"."run_preventive_maintenance"() OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."run_preventive_maintenance"() TO "anon", "authenticated", "service_role";

-- ===== 20260613010000_fd429c56-9547-4384-8d44-85c106f41cbb.sql =====
-- Projects depth (docs/parity/capabilities/projects.json): milestones + sub-tasks.
-- Adds project_milestones, links project_tasks to a milestone and to a parent task
-- (sub-tasks), and a manage_project_milestone RPC with task-progress rollup.
-- Sub-tasks flow through the generic db:project_tasks CRUD engine via the new
-- parent_task_id column (no handler change needed). Idempotent throughout.

CREATE TABLE IF NOT EXISTS "public"."project_milestones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "due_date" "date",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_reached" boolean DEFAULT false NOT NULL,
    "reached_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_milestones_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "project_milestones_project_id_idx"
  ON "public"."project_milestones" ("project_id");

-- Sub-tasks (self-reference) + milestone link on tasks
ALTER TABLE "public"."project_tasks"
  ADD COLUMN IF NOT EXISTS "parent_task_id" "uuid",
  ADD COLUMN IF NOT EXISTS "milestone_id" "uuid";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='project_tasks_parent_task_id_fkey' AND table_name='project_tasks') THEN
    ALTER TABLE "public"."project_tasks" ADD CONSTRAINT "project_tasks_parent_task_id_fkey"
      FOREIGN KEY ("parent_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='project_tasks_milestone_id_fkey' AND table_name='project_tasks') THEN
    ALTER TABLE "public"."project_tasks" ADD CONSTRAINT "project_tasks_milestone_id_fkey"
      FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "project_tasks_parent_task_id_idx"
  ON "public"."project_tasks" ("parent_task_id") WHERE "parent_task_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "project_tasks_milestone_id_idx"
  ON "public"."project_tasks" ("milestone_id") WHERE "milestone_id" IS NOT NULL;

ALTER TABLE "public"."project_milestones" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_project_milestones_updated_at" ON "public"."project_milestones";
CREATE TRIGGER "update_project_milestones_updated_at"
  BEFORE UPDATE ON "public"."project_milestones"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."project_milestones" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage project milestones" ON "public"."project_milestones";
CREATE POLICY "Admins manage project milestones" ON "public"."project_milestones"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view project milestones" ON "public"."project_milestones";
CREATE POLICY "Staff view project milestones" ON "public"."project_milestones"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role")
  );

GRANT ALL ON TABLE "public"."project_milestones" TO "anon", "authenticated", "service_role";

-- manage_project_milestone: CRUD + reach, with task-progress rollup (done = a
-- linked task whose completed_at is set). Writer-gated for mutations.
CREATE OR REPLACE FUNCTION "public"."manage_project_milestone"(
  "p_action" "text",
  "p_milestone_id" "uuid" DEFAULT NULL,
  "p_project_id" "uuid" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL,
  "p_description" "text" DEFAULT NULL,
  "p_due_date" "date" DEFAULT NULL,
  "p_sort_order" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid;
  v_result jsonb;
BEGIN
  IF p_action IN ('create','update','delete','reach','reopen') AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify project milestones';
  END IF;

  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', m.id, 'project_id', m.project_id, 'name', m.name, 'due_date', m.due_date,
      'sort_order', m.sort_order, 'is_reached', m.is_reached, 'reached_at', m.reached_at,
      'tasks_total', (SELECT count(*) FROM project_tasks t WHERE t.milestone_id = m.id),
      'tasks_done',  (SELECT count(*) FROM project_tasks t WHERE t.milestone_id = m.id AND t.completed_at IS NOT NULL)
    ) ORDER BY m.sort_order, m.due_date NULLS LAST), '[]'::jsonb) INTO v_result
    FROM project_milestones m
    WHERE p_project_id IS NULL OR m.project_id = p_project_id;
    RETURN jsonb_build_object('success', true, 'milestones', v_result);

  ELSIF p_action = 'create' THEN
    IF p_project_id IS NULL OR p_name IS NULL THEN RAISE EXCEPTION 'project_id and name are required'; END IF;
    INSERT INTO project_milestones (project_id, name, description, due_date, sort_order, created_by)
    VALUES (p_project_id, p_name, p_description, p_due_date, COALESCE(p_sort_order, 0), auth.uid())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'milestone_id', v_id);

  ELSIF p_action = 'update' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    UPDATE project_milestones SET
      name = COALESCE(p_name, name),
      description = COALESCE(p_description, description),
      due_date = COALESCE(p_due_date, due_date),
      sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_milestone_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone % not found', p_milestone_id; END IF;
    RETURN jsonb_build_object('success', true, 'milestone_id', p_milestone_id);

  ELSIF p_action = 'reach' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    UPDATE project_milestones SET is_reached = true, reached_at = COALESCE(reached_at, now())
    WHERE id = p_milestone_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone % not found', p_milestone_id; END IF;
    RETURN jsonb_build_object('success', true, 'milestone_id', p_milestone_id, 'is_reached', true);

  ELSIF p_action = 'reopen' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    UPDATE project_milestones SET is_reached = false, reached_at = NULL WHERE id = p_milestone_id;
    RETURN jsonb_build_object('success', true, 'milestone_id', p_milestone_id, 'is_reached', false);

  ELSIF p_action = 'delete' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    DELETE FROM project_milestones WHERE id = p_milestone_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_milestone_id);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|reach|reopen|delete', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_project_milestone"("text","uuid","uuid","text","text","date",integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_project_milestone"("text","uuid","uuid","text","text","date",integer) TO "anon", "authenticated", "service_role";

-- ===== 20260613030000_7e99fc87-4064-47ae-9063-8d4d36d444d7.sql =====
-- Shipping: weight-based rates + dimensional weight
-- (docs/parity/capabilities/shipping.json#weight_rate_calc + #dimensional_weight).
-- Adds shipping_rates (per-carrier weight bands) and calc_shipping_rate(), which bills
-- on max(actual weight, dimensional weight). Dimensional weight (grams) =
-- L×W×H(cm) / dim_divisor × 1000  (divisor in cm³/kg; default 5000 — the common courier
-- value). No external carrier APIs — pure deterministic calculation. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."shipping_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "carrier_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "min_weight_grams" integer DEFAULT 0 NOT NULL,
    "max_weight_grams" integer,                       -- NULL = no upper bound
    "price_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'SEK' NOT NULL,
    "dim_divisor" integer,                            -- per-rate override (cm³/kg); NULL → caller/default
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipping_rates_carrier_id_fkey"
      FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE CASCADE,
    CONSTRAINT "shipping_rates_weight_band" CHECK ("max_weight_grams" IS NULL OR "max_weight_grams" >= "min_weight_grams"),
    CONSTRAINT "shipping_rates_dim_divisor_positive" CHECK ("dim_divisor" IS NULL OR "dim_divisor" > 0)
);

CREATE INDEX IF NOT EXISTS "shipping_rates_carrier_idx" ON "public"."shipping_rates" ("carrier_id");

ALTER TABLE "public"."shipping_rates" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_shipping_rates_updated_at" ON "public"."shipping_rates";
CREATE TRIGGER "update_shipping_rates_updated_at"
  BEFORE UPDATE ON "public"."shipping_rates"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."shipping_rates" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage shipping rates" ON "public"."shipping_rates";
CREATE POLICY "Admins manage shipping rates" ON "public"."shipping_rates"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Public can view active shipping rates" ON "public"."shipping_rates";
CREATE POLICY "Public can view active shipping rates" ON "public"."shipping_rates"
  FOR SELECT USING ("is_active" = true);

GRANT ALL ON TABLE "public"."shipping_rates" TO "anon", "authenticated", "service_role";

-- calc_shipping_rate: pick the cheapest active band for a carrier that contains the
-- BILLABLE weight = max(actual grams, dimensional grams). Dimensions optional.
CREATE OR REPLACE FUNCTION "public"."calc_shipping_rate"(
  "p_carrier_id" "uuid",
  "p_weight_grams" integer,
  "p_length_cm" numeric DEFAULT NULL,
  "p_width_cm" numeric DEFAULT NULL,
  "p_height_cm" numeric DEFAULT NULL,
  "p_dim_divisor" integer DEFAULT 5000
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE
SET "search_path" TO 'public'
AS $$
DECLARE
  v_dim_grams integer := 0;
  v_billable integer;
  v_rate RECORD;
  v_divisor integer := COALESCE(NULLIF(p_dim_divisor, 0), 5000);
BEGIN
  IF p_carrier_id IS NULL OR p_weight_grams IS NULL OR p_weight_grams < 0 THEN
    RAISE EXCEPTION 'carrier_id and a non-negative weight_grams are required';
  END IF;

  -- Dimensional weight only when all three dimensions are given
  IF p_length_cm IS NOT NULL AND p_width_cm IS NOT NULL AND p_height_cm IS NOT NULL THEN
    v_dim_grams := ROUND(p_length_cm * p_width_cm * p_height_cm / v_divisor * 1000)::int;
  END IF;

  v_billable := GREATEST(p_weight_grams, v_dim_grams);

  SELECT id, name, price_cents, currency,
         COALESCE(dim_divisor, v_divisor) AS used_divisor
  INTO v_rate
  FROM shipping_rates
  WHERE carrier_id = p_carrier_id
    AND is_active
    AND v_billable >= min_weight_grams
    AND (max_weight_grams IS NULL OR v_billable <= max_weight_grams)
  ORDER BY price_cents ASC, min_weight_grams DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'no_matching_rate',
      'billable_grams', v_billable,
      'actual_grams', p_weight_grams,
      'dimensional_grams', v_dim_grams
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'rate_id', v_rate.id,
    'rate_name', v_rate.name,
    'price_cents', v_rate.price_cents,
    'currency', v_rate.currency,
    'billable_grams', v_billable,
    'actual_grams', p_weight_grams,
    'dimensional_grams', v_dim_grams,
    'billed_on', CASE WHEN v_dim_grams > p_weight_grams THEN 'dimensional' ELSE 'actual' END
  );
END;
$$;

ALTER FUNCTION "public"."calc_shipping_rate"("uuid",integer,numeric,numeric,numeric,integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."calc_shipping_rate"("uuid",integer,numeric,numeric,numeric,integer) TO "anon", "authenticated", "service_role";

-- manage_shipping_rate: CRUD on weight bands. Writer-gated.
CREATE OR REPLACE FUNCTION "public"."manage_shipping_rate"(
  "p_action" "text",
  "p_rate_id" "uuid" DEFAULT NULL,
  "p_carrier_id" "uuid" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL,
  "p_min_weight_grams" integer DEFAULT NULL,
  "p_max_weight_grams" integer DEFAULT NULL,
  "p_price_cents" integer DEFAULT NULL,
  "p_currency" "text" DEFAULT NULL,
  "p_dim_divisor" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid;
  v_result jsonb;
BEGIN
  IF p_action IN ('create','update','delete') AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify shipping rates';
  END IF;

  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.min_weight_grams), '[]'::jsonb) INTO v_result
    FROM shipping_rates r
    WHERE p_carrier_id IS NULL OR r.carrier_id = p_carrier_id;
    RETURN jsonb_build_object('success', true, 'rates', v_result);

  ELSIF p_action = 'create' THEN
    IF p_carrier_id IS NULL OR p_name IS NULL OR p_price_cents IS NULL THEN
      RAISE EXCEPTION 'carrier_id, name and price_cents are required';
    END IF;
    INSERT INTO shipping_rates (carrier_id, name, min_weight_grams, max_weight_grams, price_cents, currency, dim_divisor)
    VALUES (p_carrier_id, p_name, COALESCE(p_min_weight_grams, 0), p_max_weight_grams, p_price_cents,
            COALESCE(p_currency, 'SEK'), p_dim_divisor)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'rate_id', v_id);

  ELSIF p_action = 'update' THEN
    IF p_rate_id IS NULL THEN RAISE EXCEPTION 'rate_id is required'; END IF;
    UPDATE shipping_rates SET
      name = COALESCE(p_name, name),
      min_weight_grams = COALESCE(p_min_weight_grams, min_weight_grams),
      max_weight_grams = COALESCE(p_max_weight_grams, max_weight_grams),
      price_cents = COALESCE(p_price_cents, price_cents),
      currency = COALESCE(p_currency, currency),
      dim_divisor = COALESCE(p_dim_divisor, dim_divisor)
    WHERE id = p_rate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rate % not found', p_rate_id; END IF;
    RETURN jsonb_build_object('success', true, 'rate_id', p_rate_id);

  ELSIF p_action = 'delete' THEN
    IF p_rate_id IS NULL THEN RAISE EXCEPTION 'rate_id is required'; END IF;
    DELETE FROM shipping_rates WHERE id = p_rate_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_rate_id);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_shipping_rate"("text","uuid","uuid","text",integer,integer,integer,"text",integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_shipping_rate"("text","uuid","uuid","text",integer,integer,integer,"text",integer) TO "anon", "authenticated", "service_role";

-- ===== 20260613040000_6494adde-2f6c-43d1-a662-b8c455fd8ed7.sql =====
-- Manufacturing: work centers + routing + work orders + labor cost
-- (docs/parity/capabilities/manufacturing.json: work_centers_routing, work_orders, labor_cost).
-- Adds work_centers (resource + hourly cost), routing_operations (ordered steps per BOM,
-- each at a work center for N minutes), and mo_work_orders (per-MO operation instances
-- with planned labor cost). generate_mo_work_orders() materialises a confirmed MO's work
-- orders from its BOM routing, scaling duration by MO quantity and costing labor at the
-- work center's hourly rate. No external deps; deterministic. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."work_centers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "cost_per_hour_cents" integer DEFAULT 0 NOT NULL,
    "capacity_per_hour" numeric(12,3),                 -- units/hour, optional (capacity_scheduling later)
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_centers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "work_centers_code_key" UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "public"."routing_operations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bom_id" "uuid" NOT NULL,
    "sequence" integer DEFAULT 10 NOT NULL,
    "name" "text" NOT NULL,
    "work_center_id" "uuid" NOT NULL,
    "duration_minutes" numeric(10,2) DEFAULT 0 NOT NULL,  -- minutes per produced unit
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "routing_operations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "routing_operations_bom_seq_key" UNIQUE ("bom_id", "sequence"),
    CONSTRAINT "routing_operations_bom_id_fkey"
      FOREIGN KEY ("bom_id") REFERENCES "public"."bom_headers"("id") ON DELETE CASCADE,
    CONSTRAINT "routing_operations_work_center_id_fkey"
      FOREIGN KEY ("work_center_id") REFERENCES "public"."work_centers"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "routing_operations_bom_idx" ON "public"."routing_operations" ("bom_id");

CREATE TABLE IF NOT EXISTS "public"."mo_work_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mo_id" "uuid" NOT NULL,
    "routing_operation_id" "uuid",
    "sequence" integer DEFAULT 10 NOT NULL,
    "name" "text" NOT NULL,
    "work_center_id" "uuid",
    "status" "text" DEFAULT 'pending' NOT NULL,
    "planned_minutes" numeric(12,2) DEFAULT 0 NOT NULL,
    "actual_minutes" numeric(12,2),
    "planned_labor_cost_cents" integer DEFAULT 0 NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mo_work_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mo_work_orders_status_check" CHECK ("status" IN ('pending','in_progress','done','cancelled')),
    CONSTRAINT "mo_work_orders_mo_id_fkey"
      FOREIGN KEY ("mo_id") REFERENCES "public"."manufacturing_orders"("id") ON DELETE CASCADE,
    CONSTRAINT "mo_work_orders_routing_operation_id_fkey"
      FOREIGN KEY ("routing_operation_id") REFERENCES "public"."routing_operations"("id") ON DELETE SET NULL,
    CONSTRAINT "mo_work_orders_work_center_id_fkey"
      FOREIGN KEY ("work_center_id") REFERENCES "public"."work_centers"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "mo_work_orders_mo_idx" ON "public"."mo_work_orders" ("mo_id");

ALTER TABLE "public"."work_centers" OWNER TO "postgres";
ALTER TABLE "public"."routing_operations" OWNER TO "postgres";
ALTER TABLE "public"."mo_work_orders" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_work_centers_updated_at" ON "public"."work_centers";
CREATE TRIGGER "update_work_centers_updated_at" BEFORE UPDATE ON "public"."work_centers"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_centers','routing_operations','mo_work_orders']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$s USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Staff view %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Staff view %1$s" ON public.%1$s FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''approver''::public.app_role) OR public.has_role(auth.uid(), ''writer''::public.app_role))', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

-- manage_work_center: CRUD work centers. Writer-gated.
CREATE OR REPLACE FUNCTION "public"."manage_work_center"(
  "p_action" "text", "p_id" "uuid" DEFAULT NULL, "p_code" "text" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL, "p_cost_per_hour_cents" integer DEFAULT NULL,
  "p_capacity_per_hour" numeric DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_id uuid; v_res jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify work centers'; END IF;
  IF p_action='list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.code),'[]'::jsonb) INTO v_res FROM work_centers w;
    RETURN jsonb_build_object('success',true,'work_centers',v_res);
  ELSIF p_action='create' THEN
    IF p_code IS NULL OR p_name IS NULL THEN RAISE EXCEPTION 'code and name required'; END IF;
    INSERT INTO work_centers(code,name,cost_per_hour_cents,capacity_per_hour)
      VALUES (p_code,p_name,COALESCE(p_cost_per_hour_cents,0),p_capacity_per_hour) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success',true,'work_center_id',v_id);
  ELSIF p_action='update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;
    UPDATE work_centers SET name=COALESCE(p_name,name), cost_per_hour_cents=COALESCE(p_cost_per_hour_cents,cost_per_hour_cents),
      capacity_per_hour=COALESCE(p_capacity_per_hour,capacity_per_hour) WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Work center % not found', p_id; END IF;
    RETURN jsonb_build_object('success',true,'work_center_id',p_id);
  ELSIF p_action='delete' THEN
    DELETE FROM work_centers WHERE id=p_id; RETURN jsonb_build_object('success',true,'deleted',p_id);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action; END IF;
END; $$;
ALTER FUNCTION "public"."manage_work_center"("text","uuid","text","text",integer,numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_work_center"("text","uuid","text","text",integer,numeric) TO "anon","authenticated","service_role";

-- manage_routing_operation: CRUD ordered ops on a BOM. Writer-gated.
CREATE OR REPLACE FUNCTION "public"."manage_routing_operation"(
  "p_action" "text", "p_id" "uuid" DEFAULT NULL, "p_bom_id" "uuid" DEFAULT NULL,
  "p_sequence" integer DEFAULT NULL, "p_name" "text" DEFAULT NULL,
  "p_work_center_id" "uuid" DEFAULT NULL, "p_duration_minutes" numeric DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_id uuid; v_res jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify routing'; END IF;
  IF p_action='list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'sequence',o.sequence,'name',o.name,
      'work_center_id',o.work_center_id,'duration_minutes',o.duration_minutes) ORDER BY o.sequence),'[]'::jsonb)
    INTO v_res FROM routing_operations o WHERE o.bom_id = p_bom_id;
    RETURN jsonb_build_object('success',true,'operations',v_res);
  ELSIF p_action='create' THEN
    IF p_bom_id IS NULL OR p_name IS NULL OR p_work_center_id IS NULL THEN
      RAISE EXCEPTION 'bom_id, name and work_center_id required'; END IF;
    INSERT INTO routing_operations(bom_id,sequence,name,work_center_id,duration_minutes)
      VALUES (p_bom_id,COALESCE(p_sequence,10),p_name,p_work_center_id,COALESCE(p_duration_minutes,0)) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success',true,'operation_id',v_id);
  ELSIF p_action='update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;
    UPDATE routing_operations SET sequence=COALESCE(p_sequence,sequence), name=COALESCE(p_name,name),
      work_center_id=COALESCE(p_work_center_id,work_center_id), duration_minutes=COALESCE(p_duration_minutes,duration_minutes)
      WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operation % not found', p_id; END IF;
    RETURN jsonb_build_object('success',true,'operation_id',p_id);
  ELSIF p_action='delete' THEN
    DELETE FROM routing_operations WHERE id=p_id; RETURN jsonb_build_object('success',true,'deleted',p_id);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action; END IF;
END; $$;
ALTER FUNCTION "public"."manage_routing_operation"("text","uuid","uuid",integer,"text","uuid",numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_routing_operation"("text","uuid","uuid",integer,"text","uuid",numeric) TO "anon","authenticated","service_role";

-- generate_mo_work_orders: materialise a MO's work orders from its BOM routing.
-- planned_minutes = op.duration_minutes × MO.quantity; labor cost = minutes/60 × wc rate.
CREATE OR REPLACE FUNCTION "public"."generate_mo_work_orders"("p_mo_id" "uuid")
RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin'));
  v_mo RECORD; v_created int := 0; v_total_cost int := 0; v_total_min numeric := 0;
BEGIN
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can generate work orders'; END IF;
  SELECT id, bom_id, quantity INTO v_mo FROM manufacturing_orders WHERE id = p_mo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;
  IF v_mo.bom_id IS NULL THEN RAISE EXCEPTION 'MO % has no BOM to route from', p_mo_id; END IF;
  -- idempotent: clear any existing generated work orders first
  DELETE FROM mo_work_orders WHERE mo_id = p_mo_id;
  INSERT INTO mo_work_orders (mo_id, routing_operation_id, sequence, name, work_center_id, planned_minutes, planned_labor_cost_cents)
  SELECT p_mo_id, o.id, o.sequence, o.name, o.work_center_id,
         o.duration_minutes * v_mo.quantity,
         ROUND(o.duration_minutes * v_mo.quantity / 60.0 * wc.cost_per_hour_cents)::int
  FROM routing_operations o JOIN work_centers wc ON wc.id = o.work_center_id
  WHERE o.bom_id = v_mo.bom_id;
  GET DIAGNOSTICS v_created = ROW_COUNT;
  SELECT COALESCE(SUM(planned_labor_cost_cents),0), COALESCE(SUM(planned_minutes),0)
    INTO v_total_cost, v_total_min FROM mo_work_orders WHERE mo_id = p_mo_id;
  RETURN jsonb_build_object('success',true,'work_orders_created',v_created,
    'total_planned_minutes',v_total_min,'total_planned_labor_cost_cents',v_total_cost);
END; $$;
ALTER FUNCTION "public"."generate_mo_work_orders"("uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."generate_mo_work_orders"("uuid") TO "anon","authenticated","service_role";

-- ===== 20260613050000_826ef509-8b67-41c0-a362-dd0817b0516c.sql =====
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

-- ===== 20260614020000_35453b06-701a-48ce-80db-9f323d3f27ee.sql =====
-- SLA business hours (docs/parity/capabilities/sla.json#business_hours).
-- SLA timers today assume 24/7. This adds a configurable business-hours calendar
-- (per weekday open/close) + holidays, and business_minutes_between(start,end) which
-- counts only minutes that fall inside business hours and outside holidays — the
-- function the SLA sweep can use instead of raw elapsed wall-clock. Pure/STABLE.
-- Seeds a default Mon–Fri 09:00–17:00. Idempotent throughout.

CREATE TABLE IF NOT EXISTS "public"."business_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "weekday" integer NOT NULL,   -- Postgres DOW: 0=Sun … 6=Sat
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

ALTER TABLE "public"."business_hours" OWNER TO "postgres";
ALTER TABLE "public"."business_holidays" OWNER TO "postgres";

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

-- Seed default Mon–Fri 09:00–17:00 (weekday 1..5)
INSERT INTO "public"."business_hours" ("weekday","open_time","close_time")
SELECT d, TIME '09:00', TIME '17:00' FROM generate_series(1,5) AS d
ON CONFLICT ("weekday","open_time") DO NOTHING;

-- business_minutes_between: minutes within business hours, excluding holidays.
CREATE OR REPLACE FUNCTION "public"."business_minutes_between"(
  "p_start" timestamptz, "p_end" timestamptz
) RETURNS integer
LANGUAGE "plpgsql" STABLE
SET "search_path" TO 'public'
AS $$
DECLARE
  v_total numeric := 0;
  v_day date;
  v_end_day date;
  v_win RECORD;
  v_open timestamptz;
  v_close timestamptz;
  v_seg_start timestamptz;
  v_seg_end timestamptz;
BEGIN
  IF p_end <= p_start THEN RETURN 0; END IF;
  v_day := p_start::date;
  v_end_day := p_end::date;
  WHILE v_day <= v_end_day LOOP
    IF NOT EXISTS (SELECT 1 FROM business_holidays h WHERE h.day = v_day) THEN
      FOR v_win IN
        SELECT open_time, close_time FROM business_hours
        WHERE is_open AND weekday = EXTRACT(DOW FROM v_day)::int
      LOOP
        v_open  := (v_day + v_win.open_time)::timestamptz;
        v_close := (v_day + v_win.close_time)::timestamptz;
        v_seg_start := GREATEST(v_open, p_start);
        v_seg_end   := LEAST(v_close, p_end);
        IF v_seg_end > v_seg_start THEN
          v_total := v_total + EXTRACT(EPOCH FROM (v_seg_end - v_seg_start)) / 60.0;
        END IF;
      END LOOP;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  RETURN ROUND(v_total)::int;
END;
$$;

ALTER FUNCTION "public"."business_minutes_between"(timestamptz, timestamptz) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."business_minutes_between"(timestamptz, timestamptz) TO "anon", "authenticated", "service_role";

-- manage_business_hours: CRUD the calendar + holidays (backs the skill). Writer-gated.
CREATE OR REPLACE FUNCTION "public"."manage_business_hours"(
  "p_action" "text",
  "p_weekday" integer DEFAULT NULL,
  "p_open_time" time DEFAULT NULL,
  "p_close_time" time DEFAULT NULL,
  "p_is_open" boolean DEFAULT NULL,
  "p_holiday" "date" DEFAULT NULL,
  "p_holiday_name" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_result jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify business hours';
  END IF;

  IF p_action = 'list' THEN
    RETURN jsonb_build_object(
      'success', true,
      'hours', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.weekday, b.open_time), '[]'::jsonb) FROM business_hours b),
      'holidays', (SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.day), '[]'::jsonb) FROM business_holidays h)
    );
  ELSIF p_action = 'set_hours' THEN
    IF p_weekday IS NULL OR p_open_time IS NULL OR p_close_time IS NULL THEN
      RAISE EXCEPTION 'weekday, open_time, close_time required';
    END IF;
    INSERT INTO business_hours (weekday, open_time, close_time, is_open)
    VALUES (p_weekday, p_open_time, p_close_time, COALESCE(p_is_open, true))
    ON CONFLICT (weekday, open_time) DO UPDATE SET close_time = EXCLUDED.close_time, is_open = EXCLUDED.is_open;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'clear_day' THEN
    IF p_weekday IS NULL THEN RAISE EXCEPTION 'weekday required'; END IF;
    DELETE FROM business_hours WHERE weekday = p_weekday;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'add_holiday' THEN
    IF p_holiday IS NULL THEN RAISE EXCEPTION 'holiday date required'; END IF;
    INSERT INTO business_holidays (day, name) VALUES (p_holiday, p_holiday_name)
    ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'remove_holiday' THEN
    DELETE FROM business_holidays WHERE day = p_holiday;
    RETURN jsonb_build_object('success', true);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|set_hours|clear_day|add_holiday|remove_holiday', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_business_hours"("text",integer,time,time,boolean,"date","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_business_hours"("text",integer,time,time,boolean,"date","text") TO "anon", "authenticated", "service_role";

-- ===== 20260614030000_6b170373-92ff-4ab2-8c5f-e0182b63a48d.sql =====
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

-- ===== 20260614040000_452e2df2-498f-4bab-91e4-f7d1c3b65744.sql =====
-- Inventory cycle counts (docs/parity/capabilities/inventory.json#cycle_count).
-- A physical-count session per location: snapshot system qty, record counted qty,
-- and on post apply the variance to stock via the existing adjust_quant() (which
-- moves stock + creates valuation layers). Idempotent throughout.

CREATE TABLE IF NOT EXISTS "public"."inventory_counts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft' NOT NULL,
    "notes" "text",
    "posted_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_counts_status_check" CHECK ("status" IN ('draft','posted','cancelled'))
);

CREATE TABLE IF NOT EXISTS "public"."inventory_count_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "count_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "lot_id" "uuid",
    "system_qty" numeric DEFAULT 0 NOT NULL,
    "counted_qty" numeric DEFAULT 0 NOT NULL,
    "variance" numeric GENERATED ALWAYS AS ("counted_qty" - "system_qty") STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_count_lines_count_id_fkey"
      FOREIGN KEY ("count_id") REFERENCES "public"."inventory_counts"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "inventory_count_lines_count_id_idx"
  ON "public"."inventory_count_lines" ("count_id");

ALTER TABLE "public"."inventory_counts" OWNER TO "postgres";
ALTER TABLE "public"."inventory_count_lines" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_inventory_counts_updated_at" ON "public"."inventory_counts";
CREATE TRIGGER "update_inventory_counts_updated_at"
  BEFORE UPDATE ON "public"."inventory_counts"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_counts','inventory_count_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$s USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Staff view %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Staff view %1$s" ON public.%1$s FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''approver''::public.app_role) OR public.has_role(auth.uid(), ''writer''::public.app_role))', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

-- manage_inventory_count: create / add_line / set_count / post / list / get.
-- post applies each non-zero variance via adjust_quant (reason 'cycle_count').
CREATE OR REPLACE FUNCTION "public"."manage_inventory_count"(
  "p_action" "text",
  "p_count_id" "uuid" DEFAULT NULL,
  "p_location_id" "uuid" DEFAULT NULL,
  "p_product_id" "uuid" DEFAULT NULL,
  "p_lot_id" "uuid" DEFAULT NULL,
  "p_counted_qty" numeric DEFAULT NULL,
  "p_line_id" "uuid" DEFAULT NULL,
  "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid;
  v_sys numeric;
  v_status text;
  v_line RECORD;
  v_applied int := 0;
BEGIN
  IF p_action <> 'list' AND p_action <> 'get' AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify inventory counts';
  END IF;

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
    IF p_line_id IS NULL OR p_counted_qty IS NULL THEN RAISE EXCEPTION 'line_id and counted_qty required'; END IF;
    UPDATE inventory_count_lines SET counted_qty = p_counted_qty WHERE id = p_line_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Line % not found', p_line_id; END IF;
    RETURN jsonb_build_object('success', true, 'line_id', p_line_id);

  ELSIF p_action = 'post' THEN
    IF p_count_id IS NULL THEN RAISE EXCEPTION 'count_id required'; END IF;
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

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use create|add_line|set_count|post|get|list', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_inventory_count"("text","uuid","uuid","uuid","uuid",numeric,"uuid","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_inventory_count"("text","uuid","uuid","uuid","uuid",numeric,"uuid","text") TO "anon", "authenticated", "service_role";

-- ===== 20260614060000_e39daf45-f40e-41ca-837b-d1a4afd5ba08.sql =====
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

-- ===== 20260614080000_53176990-a4e4-4d71-92d0-1d0a34da2672.sql =====
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

-- ===== 20260615092702_3655d52f-a1c8-4fbc-a10d-e35abebd8599.sql =====
-- docs module → L4: in-app authoring (doc_crud), public/private visibility, versioning.
--
-- Until now docs_pages was GitHub-sync-only (repo_owner/repo_name/file_path NOT NULL,
-- no visibility flag, no in-app history). This migration adds:
--   1. source + nullable repo fields  → app-authored docs can coexist with synced ones
--   2. is_published                    → public/private visibility (RLS-enforced)
--   3. docs_page_versions + RPC        → in-app version history with atomic snapshot
--
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE throughout.

-- 1) Schema: distinguish app-authored docs and relax GitHub-only NOT NULLs ----------
ALTER TABLE "public"."docs_pages" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'github';
ALTER TABLE "public"."docs_pages" ADD COLUMN IF NOT EXISTS "is_published" boolean NOT NULL DEFAULT true;
ALTER TABLE "public"."docs_pages" ALTER COLUMN "repo_owner" DROP NOT NULL;
ALTER TABLE "public"."docs_pages" ALTER COLUMN "repo_name"  DROP NOT NULL;
ALTER TABLE "public"."docs_pages" ALTER COLUMN "file_path"  DROP NOT NULL;

-- 2) public/private: only published docs are visible to anon/non-admin. Admins keep
--    full access via the existing "Admins can manage docs pages" FOR ALL policy.
DROP POLICY IF EXISTS "Public can read docs pages" ON "public"."docs_pages";
CREATE POLICY "Public can read docs pages" ON "public"."docs_pages"
  FOR SELECT TO "authenticated", "anon" USING ("is_published" = true);

-- 3) Version history -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."docs_page_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "docs_page_id" uuid NOT NULL REFERENCES "public"."docs_pages"("id") ON DELETE CASCADE,
  "version_no" integer NOT NULL,
  "title" text NOT NULL DEFAULT '',
  "content" text NOT NULL DEFAULT '',
  "category" text,
  "slug" text,
  "frontmatter" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "edited_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("docs_page_id", "version_no")
);
ALTER TABLE "public"."docs_page_versions" OWNER TO "postgres";
CREATE INDEX IF NOT EXISTS "idx_docs_page_versions_page" ON "public"."docs_page_versions" ("docs_page_id", "version_no" DESC);

ALTER TABLE "public"."docs_page_versions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage docs versions" ON "public"."docs_page_versions";
CREATE POLICY "Admins manage docs versions" ON "public"."docs_page_versions"
  TO "authenticated"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))
  WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

-- 4) manage_docs_page RPC — create / update / delete / restore_version --------------
--    Transactional: update & restore snapshot the current row into docs_page_versions
--    BEFORE mutating, so history is never lost. SECURITY DEFINER (writes bypass RLS);
--    EXECUTE granted to service_role (agent/MCP path) + authenticated (admin UI).
CREATE OR REPLACE FUNCTION "public"."manage_docs_page"(
  "p_action" text,
  "p_id" uuid DEFAULT NULL,
  "p_title" text DEFAULT NULL,
  "p_content" text DEFAULT NULL,
  "p_category" text DEFAULT NULL,
  "p_slug" text DEFAULT NULL,
  "p_frontmatter" jsonb DEFAULT NULL,
  "p_is_published" boolean DEFAULT NULL,
  "p_version_no" integer DEFAULT NULL,
  "p_editor" uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_row docs_pages%ROWTYPE;
  v_ver docs_page_versions%ROWTYPE;
  v_slug text;
  v_next integer;
BEGIN
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'action required (create|update|delete|restore_version)';
  END IF;

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
                              'id', v_row.id, 'slug', v_row.slug, 'category', v_row.category,
                              'is_published', v_row.is_published);

  ELSIF p_action = 'update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required for update'; END IF;
    SELECT * INTO v_row FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next FROM docs_page_versions WHERE docs_page_id = v_row.id;
    INSERT INTO docs_page_versions (docs_page_id, version_no, title, content, category, slug, frontmatter, edited_by)
    VALUES (v_row.id, v_next, v_row.title, v_row.content, v_row.category, v_row.slug, v_row.frontmatter, p_editor);
    UPDATE docs_pages SET
      title        = COALESCE(p_title, title),
      content      = COALESCE(p_content, content),
      category     = COALESCE(NULLIF(btrim(p_category), ''), category),
      slug         = COALESCE(NULLIF(btrim(p_slug), ''), slug),
      frontmatter  = COALESCE(p_frontmatter, frontmatter),
      is_published = COALESCE(p_is_published, is_published),
      updated_at   = now()
    WHERE id = v_row.id RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'action', 'update', 'id', v_row.id,
                              'snapshot_version', v_next, 'is_published', v_row.is_published);

  ELSIF p_action = 'delete' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required for delete'; END IF;
    DELETE FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    RETURN jsonb_build_object('success', true, 'action', 'delete', 'id', p_id);

  ELSIF p_action = 'restore_version' THEN
    IF p_id IS NULL OR p_version_no IS NULL THEN RAISE EXCEPTION 'id and version_no required for restore_version'; END IF;
    SELECT * INTO v_row FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    SELECT * INTO v_ver FROM docs_page_versions WHERE docs_page_id = p_id AND version_no = p_version_no;
    IF NOT FOUND THEN RAISE EXCEPTION 'version % not found for page %', p_version_no, p_id; END IF;
    -- snapshot current state first, then restore the chosen version
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next FROM docs_page_versions WHERE docs_page_id = p_id;
    INSERT INTO docs_page_versions (docs_page_id, version_no, title, content, category, slug, frontmatter, edited_by)
    VALUES (p_id, v_next, v_row.title, v_row.content, v_row.category, v_row.slug, v_row.frontmatter, p_editor);
    UPDATE docs_pages SET
      title = v_ver.title, content = v_ver.content, category = v_ver.category,
      slug = v_ver.slug, frontmatter = v_ver.frontmatter, updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'action', 'restore_version', 'id', p_id,
                              'restored_from', p_version_no, 'snapshot_version', v_next);

  ELSE
    RAISE EXCEPTION 'unknown action: % (expected create|update|delete|restore_version)', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_docs_page"(text, uuid, text, text, text, text, jsonb, boolean, integer, uuid) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."manage_docs_page"(text, uuid, text, text, text, text, jsonb, boolean, integer, uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."manage_docs_page"(text, uuid, text, text, text, text, jsonb, boolean, integer, uuid) TO "authenticated";

-- ===== 20260616170000_7022c36b-c2f2-461f-a44f-0556b8a32663.sql =====
-- Contact Center — Fas 0 foundation: omnichannel dimension on the existing conversation hub,
-- a voicemail store, and the routing function that the chat handoff has been POSTing to a
-- non-existent `support-router` function (404) since it was written.
--
-- This is additive and idempotent. It does NOT enable any module — it only lays the schema +
-- routing contract that the (already-merged) Unified Inbox UI is hardcoded against:
--   chat_conversations.channel / .channel_thread_id / .contact_phone / .contact_id
--   support_agents.supported_channels
--   voicemail_messages (VoicemailPanel does select('*'))
--   route_conversation_to_agent() — presence-aware assignment, queue, or escalation fallback.
-- Callbacks ride on the existing bookings table (metadata.kind='callback'), so no new table here.

-- ── 1. Omnichannel dimension on conversations ────────────────────────────────
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

-- Upsert key for channel adapters: one open thread per (channel, external thread id).
CREATE INDEX IF NOT EXISTS "chat_conversations_channel_thread_idx"
  ON "public"."chat_conversations" ("channel", "channel_thread_id")
  WHERE "channel_thread_id" IS NOT NULL;

-- ── 2. Per-channel agent competence ──────────────────────────────────────────
ALTER TABLE "public"."support_agents"
  ADD COLUMN IF NOT EXISTS "supported_channels" "text"[] NOT NULL DEFAULT '{web}'::text[];

-- ── 3. Voicemail store (transcription + FlowPilot analysis land here in Fas 2) ─
CREATE TABLE IF NOT EXISTS "public"."voicemail_messages" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "conversation_id" "uuid",
  "contact_phone" "text",
  "audio_url" "text",
  "duration_seconds" integer,
  "transcript_text" "text",
  "transcript_status" "text" NOT NULL DEFAULT 'pending',
  "intent" "text",
  "sentiment" "text",
  "summary" "text",
  "callback_requested" boolean NOT NULL DEFAULT false,
  "ai_model_used" "text",
  "transcribed_at" timestamp with time zone,
  "analyzed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
  CONSTRAINT "voicemail_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voicemail_messages_transcript_status_check"
    CHECK (("transcript_status" = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text])))
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'voicemail_messages_conversation_id_fkey'
                   AND table_name = 'voicemail_messages') THEN
    ALTER TABLE "public"."voicemail_messages" ADD CONSTRAINT "voicemail_messages_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "voicemail_messages_created_idx"
  ON "public"."voicemail_messages" ("created_at" DESC);

ALTER TABLE "public"."voicemail_messages" OWNER TO "postgres";
ALTER TABLE "public"."voicemail_messages" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'voicemail_messages' AND policyname = 'voicemail_service_all') THEN
    CREATE POLICY "voicemail_service_all" ON "public"."voicemail_messages"
      FOR ALL TO "service_role" USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'voicemail_messages' AND policyname = 'voicemail_admin_read') THEN
    CREATE POLICY "voicemail_admin_read" ON "public"."voicemail_messages"
      FOR SELECT TO "authenticated" USING (true);
  END IF;
END $$;

-- ── 4. The router: presence-aware assignment → queue → escalation fallback ────
-- Single source of truth for "get this conversation to a human". Both the chat handoff
-- (via the support-router edge function) and future channel adapters call this — no
-- channel-specific routing branches (Law 1). Channel is read from the conversation row.
CREATE OR REPLACE FUNCTION "public"."route_conversation_to_agent"(
  "p_conversation_id" "uuid",
  "p_reason" "text" DEFAULT NULL,
  "p_urgency" "text" DEFAULT 'normal'
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_channel text;
  v_urgency text := CASE WHEN p_urgency IN ('low','normal','high','urgent') THEN p_urgency ELSE 'normal' END;
  v_agent uuid;
  v_existing uuid;
  v_status text;
BEGIN
  SELECT COALESCE(channel, 'web'), assigned_agent_id, conversation_status
    INTO v_channel, v_existing, v_status
  FROM chat_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('action', 'error', 'message', 'Conversation not found');
  END IF;

  -- Idempotent: already handed to an agent → don't re-assign or double-count
  -- (the chat handoff tool can fire more than once in a single ReAct loop).
  IF v_status = 'with_agent' AND v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'handoff_to_agent', 'agent_id', v_existing, 'status', 'with_agent',
      'message', 'Already connected to an agent.');
  END IF;

  -- Least-loaded online/away agent with free capacity that handles this channel.
  SELECT id INTO v_agent
  FROM support_agents
  WHERE status IN ('online', 'away')
    AND current_conversations < max_conversations
    AND supported_channels @> ARRAY[v_channel]
  ORDER BY current_conversations ASC, last_seen_at DESC
  LIMIT 1;

  IF v_agent IS NOT NULL THEN
    UPDATE chat_conversations SET
      assigned_agent_id = v_agent,
      conversation_status = 'with_agent',
      priority = v_urgency,
      escalation_reason = p_reason,
      escalated_at = now(),
      updated_at = now()
    WHERE id = p_conversation_id;

    UPDATE support_agents SET current_conversations = current_conversations + 1, updated_at = now()
    WHERE id = v_agent;

    RETURN jsonb_build_object(
      'action', 'handoff_to_agent', 'agent_id', v_agent, 'status', 'with_agent',
      'message', 'Connected you to an available agent.');
  END IF;

  -- No agent free: queue the conversation and record an escalation for follow-up.
  UPDATE chat_conversations SET
    conversation_status = 'waiting_agent',
    assigned_agent_id = NULL,
    priority = v_urgency,
    escalation_reason = p_reason,
    escalated_at = now(),
    updated_at = now()
  WHERE id = p_conversation_id;

  INSERT INTO support_escalations (conversation_id, reason, priority)
  VALUES (p_conversation_id, COALESCE(p_reason, 'Human handoff requested'), v_urgency);

  RETURN jsonb_build_object(
    'action', 'create_escalation', 'status', 'waiting_agent',
    'message', 'No agent is available right now — your request is queued and the team will follow up.');
END $$;
ALTER FUNCTION "public"."route_conversation_to_agent"("uuid", "text", "text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."route_conversation_to_agent"("uuid", "text", "text")
  TO "anon", "authenticated", "service_role";

NOTIFY pgrst, 'reload schema';
