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
