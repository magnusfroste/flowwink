-- ===== Reconcile part 1/3 from supabase/migrations/20260627210000_*.sql =====
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

CREATE OR REPLACE FUNCTION "public"."resolve_inbound_unit_cost"(
  "p_product_id" "uuid", "p_reference_type" "text", "p_reference_id" "text"
) RETURNS bigint
LANGUAGE "plpgsql" STABLE SET "search_path" TO 'public' AS $$
DECLARE v_cost bigint;
BEGIN
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
  SELECT cost_cents INTO v_cost FROM products WHERE id = p_product_id;
  RETURN COALESCE(v_cost, 0);
END $$;

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
  IF NEW.move_type NOT IN ('in','out','mo_production','mo_consumption') THEN RETURN NEW; END IF;
  v_is_in := (NEW.move_type IN ('in','mo_production')) AND COALESCE(NEW.quantity,0) > 0;

  IF v_is_in THEN
    v_unit_cost := COALESCE(NEW.unit_cost_cents,
                            resolve_inbound_unit_cost(NEW.product_id, NEW.reference_type, NEW.reference_id));
    INSERT INTO stock_valuation_layers (product_id, variant_id, move_id, quantity, unit_cost_cents, value_cents, remaining_qty)
    VALUES (NEW.product_id, NEW.variant_id, NEW.id, v_qty, v_unit_cost, round(v_qty * v_unit_cost), v_qty);
    UPDATE stock_moves SET unit_cost_cents = v_unit_cost, value_cents = round(v_qty * v_unit_cost)
      WHERE id = NEW.id;
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
  IF v_remaining > 0 THEN
    SELECT COALESCE(v_avg, cost_cents, 0) INTO v_unit_cost FROM products WHERE id = NEW.product_id;
    v_total_cost := v_total_cost + round(v_remaining * COALESCE(v_unit_cost,0));
  END IF;

  UPDATE stock_moves SET
    unit_cost_cents = CASE WHEN v_qty > 0 THEN round(v_total_cost / v_qty) ELSE NULL END,
    value_cents = v_total_cost
  WHERE id = NEW.id;

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

DROP TRIGGER IF EXISTS "stock_move_valuation_trg" ON "public"."stock_moves";
CREATE TRIGGER "stock_move_valuation_trg" AFTER INSERT ON "public"."stock_moves"
  FOR EACH ROW EXECUTE FUNCTION "public"."process_stock_move_valuation"();

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
GRANT ALL ON FUNCTION "public"."inventory_valuation_report"(integer) TO "anon", "authenticated", "service_role";
GRANT ALL ON FUNCTION "public"."resolve_inbound_unit_cost"("uuid","text","text") TO "anon", "authenticated", "service_role";

-- Approval delegations
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
GRANT ALL ON TABLE "public"."approval_delegations" TO "anon", "authenticated", "service_role";

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
GRANT ALL ON FUNCTION "public"."manage_approval_delegation"("text","uuid","uuid",timestamptz,"uuid") TO "anon", "authenticated", "service_role";

ALTER TABLE "public"."approval_steps"
  ADD COLUMN IF NOT EXISTS "escalate_after_hours" integer;
ALTER TABLE "public"."approval_requests"
  ADD COLUMN IF NOT EXISTS "step_entered_at" timestamp with time zone DEFAULT "now"();

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
GRANT ALL ON FUNCTION "public"."check_approval_escalations"() TO "anon", "authenticated", "service_role";

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
GRANT ALL ON FUNCTION "public"."request_entity_approval"("text","text",bigint,"text") TO "anon", "authenticated", "service_role";

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
GRANT ALL ON FUNCTION "public"."chain_approval_satisfied"("text","text") TO "anon", "authenticated", "service_role";

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
DROP TRIGGER IF EXISTS "guard_po_chain_approval_trg" ON "public"."purchase_orders";
CREATE TRIGGER "guard_po_chain_approval_trg" BEFORE UPDATE ON "public"."purchase_orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."guard_po_chain_approval"();

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
DROP TRIGGER IF EXISTS "guard_expense_chain_approval_trg" ON "public"."expense_reports";
CREATE TRIGGER "guard_expense_chain_approval_trg" BEFORE UPDATE ON "public"."expense_reports"
  FOR EACH ROW EXECUTE FUNCTION "public"."guard_expense_chain_approval"();

-- Landed cost
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
GRANT ALL ON TABLE "public"."landed_costs" TO "anon", "authenticated", "service_role";

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
  SELECT COALESCE(SUM(CASE WHEN p_method='by_value' THEN l.value_cents ELSE l.quantity END),0)
  INTO v_total_basis
  FROM stock_valuation_layers l
  JOIN stock_moves m ON m.id = l.move_id
  WHERE m.reference_type = p_reference_type AND m.reference_id = p_reference_id;
  IF v_total_basis <= 0 THEN
    RAISE EXCEPTION 'No valuation layers found for % % (or zero basis)', p_reference_type, p_reference_id;
  END IF;
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
  IF v_allocated <> p_amount_cents AND v_last_id IS NOT NULL THEN
    UPDATE stock_valuation_layers
       SET value_cents = value_cents + (p_amount_cents - v_allocated),
           unit_cost_cents = CASE WHEN quantity > 0 THEN round((value_cents + (p_amount_cents - v_allocated))::numeric / quantity) ELSE unit_cost_cents END
     WHERE id = v_last_id;
  END IF;
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
GRANT ALL ON FUNCTION "public"."allocate_landed_cost"("text","text",bigint,"text","text") TO "anon", "authenticated", "service_role";

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
GRANT ALL ON FUNCTION "public"."bulk_advance_approvals"("uuid"[],"public"."approval_decision_kind","text") TO "anon", "authenticated", "service_role";

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
DROP TRIGGER IF EXISTS "notify_approval_assigned_trg" ON "public"."approval_requests";
CREATE TRIGGER "notify_approval_assigned_trg" AFTER INSERT OR UPDATE ON "public"."approval_requests"
  FOR EACH ROW EXECUTE FUNCTION "public"."notify_approval_assigned"();

-- Calendar events
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
GRANT ALL ON TABLE "public"."calendar_events" TO "anon", "authenticated", "service_role";

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS "update_calendar_events_updated_at" ON "public"."calendar_events";
    CREATE TRIGGER "update_calendar_events_updated_at"
      BEFORE UPDATE ON "public"."calendar_events"
      FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
  END IF;
END $$;

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
GRANT ALL ON FUNCTION "public"."manage_calendar_event"("text","uuid","text","text",timestamptz,timestamptz,boolean,"text","jsonb",timestamptz,timestamptz) TO "anon", "authenticated", "service_role";