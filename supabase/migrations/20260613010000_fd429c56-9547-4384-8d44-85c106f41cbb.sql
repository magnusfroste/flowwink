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
