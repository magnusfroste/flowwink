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
