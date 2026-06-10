-- EPIC-04 issues 04.1–04.3 (docs/parity/epics/EPIC-04-approval-chains.md):
-- Multi-step approval chains on top of the existing single-role approval model.
-- Adds:
--   • approval_chains + approval_steps (sequential, each step a role OR a group with
--     min_approvals)
--   • approval_groups + members (any-of-N approvers)
--   • approval_requests.chain_id + current_step
--   • approval_decisions.step_sort_order (which step a decision belongs to)
--   • advance_approval_step(): records a decision, advances when the step is
--     satisfied, approves only when the last step clears, rejection stops the chain
-- Delegation (04.4), expiry/escalation (04.5) and consumer routing (04.6) follow.
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS "public"."approval_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "approval_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_groups_name_key" UNIQUE ("name")
);

CREATE TABLE IF NOT EXISTS "public"."approval_group_members" (
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    CONSTRAINT "approval_group_members_pkey" PRIMARY KEY ("group_id", "user_id"),
    CONSTRAINT "approval_group_members_group_id_fkey"
      FOREIGN KEY ("group_id") REFERENCES "public"."approval_groups"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."approval_chains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "approval_chains_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_chains_name_key" UNIQUE ("name")
);

CREATE TABLE IF NOT EXISTS "public"."approval_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chain_id" "uuid" NOT NULL,
    "sort_order" integer NOT NULL,
    "required_role" "public"."app_role",
    "group_id" "uuid",
    "min_approvals" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_steps_chain_order_key" UNIQUE ("chain_id", "sort_order"),
    CONSTRAINT "approval_steps_min_positive" CHECK ("min_approvals" >= 1),
    -- exactly one of required_role / group_id
    CONSTRAINT "approval_steps_role_xor_group"
      CHECK (("required_role" IS NOT NULL) <> ("group_id" IS NOT NULL)),
    CONSTRAINT "approval_steps_chain_id_fkey"
      FOREIGN KEY ("chain_id") REFERENCES "public"."approval_chains"("id") ON DELETE CASCADE,
    CONSTRAINT "approval_steps_group_id_fkey"
      FOREIGN KEY ("group_id") REFERENCES "public"."approval_groups"("id") ON DELETE RESTRICT
);

ALTER TABLE "public"."approval_requests"
  ADD COLUMN IF NOT EXISTS "chain_id" "uuid",
  ADD COLUMN IF NOT EXISTS "current_step" integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='approval_requests_chain_id_fkey' AND table_name='approval_requests') THEN
    ALTER TABLE "public"."approval_requests" ADD CONSTRAINT "approval_requests_chain_id_fkey"
      FOREIGN KEY ("chain_id") REFERENCES "public"."approval_chains"("id") ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "public"."approval_decisions"
  ADD COLUMN IF NOT EXISTS "step_sort_order" integer;

ALTER TABLE "public"."approval_groups" OWNER TO "postgres";
ALTER TABLE "public"."approval_group_members" OWNER TO "postgres";
ALTER TABLE "public"."approval_chains" OWNER TO "postgres";
ALTER TABLE "public"."approval_steps" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_approval_chains_updated_at" ON "public"."approval_chains";
CREATE TRIGGER "update_approval_chains_updated_at"
  BEFORE UPDATE ON "public"."approval_chains"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

-- RLS: admin-manage; staff-read
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['approval_groups','approval_group_members','approval_chains','approval_steps']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$s USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Staff view %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Staff view %1$s" ON public.%1$s FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''approver''::public.app_role) OR public.has_role(auth.uid(), ''writer''::public.app_role))', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

-- advance_approval_step: record one decision against the request's current step.
-- Reject → request rejected (chain stops). Approve → when the step's min_approvals
-- distinct approvers are reached, advance; if it was the last step, request approved.
CREATE OR REPLACE FUNCTION "public"."advance_approval_step"(
  "p_request_id" "uuid",
  "p_decision" "public"."approval_decision_kind",
  "p_decided_by" "uuid" DEFAULT NULL,
  "p_decided_role" "public"."app_role" DEFAULT NULL,
  "p_comment" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
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

  -- Authorization: service role bypasses; otherwise actor must hold the step's role
  -- or be a member of the step's group.
  IF v_is_service THEN
    v_authorized := true;
  ELSIF v_step.required_role IS NOT NULL THEN
    v_authorized := has_role(v_actor, v_step.required_role);
  ELSE
    v_authorized := EXISTS (SELECT 1 FROM approval_group_members m
                            WHERE m.group_id = v_step.group_id AND m.user_id = v_actor);
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

  -- approve: count distinct approvers on this step
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
                           WHERE chain_id = v_req.chain_id AND sort_order > v_req.current_step)
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'pending',
      'advanced_to', (SELECT current_step FROM approval_requests WHERE id = p_request_id));
  END IF;
END;
$$;

ALTER FUNCTION "public"."advance_approval_step"("uuid","public"."approval_decision_kind","uuid","public"."app_role","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."advance_approval_step"("uuid","public"."approval_decision_kind","uuid","public"."app_role","text") TO "anon", "authenticated", "service_role";

-- manage_approval_chain: CRUD chains + steps + groups (backs the skill). Writer-gated.
CREATE OR REPLACE FUNCTION "public"."manage_approval_chain"(
  "p_action" "text",
  "p_chain_id" "uuid" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL,
  "p_entity_type" "text" DEFAULT NULL,
  "p_steps" "jsonb" DEFAULT NULL,
  "p_group_id" "uuid" DEFAULT NULL,
  "p_user_ids" "uuid"[] DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_chain_id uuid;
  v_step jsonb;
  v_idx int := 0;
  v_result jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify approval chains';
  END IF;

  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'entity_type', c.entity_type, 'is_active', c.is_active,
      'steps', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'sort_order', s.sort_order, 'required_role', s.required_role,
                  'group_id', s.group_id, 'min_approvals', s.min_approvals) ORDER BY s.sort_order), '[]'::jsonb)
                FROM approval_steps s WHERE s.chain_id = c.id)
    ) ORDER BY c.name), '[]'::jsonb) INTO v_result
    FROM approval_chains c
    WHERE p_entity_type IS NULL OR c.entity_type = p_entity_type;
    RETURN jsonb_build_object('success', true, 'chains', v_result);

  ELSIF p_action = 'create_chain' THEN
    IF p_name IS NULL OR p_entity_type IS NULL THEN RAISE EXCEPTION 'name and entity_type required'; END IF;
    INSERT INTO approval_chains (name, entity_type) VALUES (p_name, p_entity_type) RETURNING id INTO v_chain_id;
    -- optional inline steps: [{sort_order, required_role|group_id, min_approvals}]
    IF p_steps IS NOT NULL THEN
      FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
        v_idx := v_idx + 1;
        INSERT INTO approval_steps (chain_id, sort_order, required_role, group_id, min_approvals)
        VALUES (v_chain_id,
                COALESCE((v_step->>'sort_order')::int, v_idx * 10),
                NULLIF(v_step->>'required_role','')::app_role,
                NULLIF(v_step->>'group_id','')::uuid,
                COALESCE((v_step->>'min_approvals')::int, 1));
      END LOOP;
    END IF;
    RETURN jsonb_build_object('success', true, 'chain_id', v_chain_id);

  ELSIF p_action = 'delete_chain' THEN
    IF p_chain_id IS NULL THEN RAISE EXCEPTION 'chain_id required'; END IF;
    DELETE FROM approval_chains WHERE id = p_chain_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_chain_id);

  ELSIF p_action = 'create_group' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'name required'; END IF;
    INSERT INTO approval_groups (name) VALUES (p_name) RETURNING id INTO v_chain_id;
    IF p_user_ids IS NOT NULL THEN
      INSERT INTO approval_group_members (group_id, user_id)
      SELECT v_chain_id, unnest(p_user_ids) ON CONFLICT DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', true, 'group_id', v_chain_id);

  ELSIF p_action = 'set_group_members' THEN
    IF p_group_id IS NULL THEN RAISE EXCEPTION 'group_id required'; END IF;
    DELETE FROM approval_group_members WHERE group_id = p_group_id;
    IF p_user_ids IS NOT NULL THEN
      INSERT INTO approval_group_members (group_id, user_id)
      SELECT p_group_id, unnest(p_user_ids) ON CONFLICT DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', true, 'group_id', p_group_id);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create_chain|delete_chain|create_group|set_group_members', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_approval_chain"("text","uuid","text","text","jsonb","uuid","uuid"[]) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_approval_chain"("text","uuid","text","text","jsonb","uuid","uuid"[]) TO "anon", "authenticated", "service_role";
