-- EPIC-03 issues 03.1 + 03.2 (docs/parity/epics/EPIC-03-pipeline-engine.md):
-- A shared, configurable stage model so crm/deals/tickets stop hardcoding stages
-- as enums (also satisfies FlowPilot Law 1 — no hardcoded routing). This adds:
--   • pipeline_stages (per entity_type, with probability/is_won/is_lost/fold)
--   • default stages seeded to match today's lead_status / deal_stage / ticket_status
--   • a nullable stage_id FK on leads/deals/tickets, backfilled from the enum
--   • manage_pipeline_stage RPC (backs the manage_pipeline_stage skill)
-- The enum columns remain the read source this release (compat); migrating reads +
-- kanban UI are 03.3/03.5/03.6. Idempotent throughout.

CREATE TABLE IF NOT EXISTS "public"."pipeline_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "probability" numeric(5,2),
    "is_won" boolean DEFAULT false NOT NULL,
    "is_lost" boolean DEFAULT false NOT NULL,
    "fold" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pipeline_stages_entity_key_key" UNIQUE ("entity_type", "key"),
    CONSTRAINT "pipeline_stages_entity_type_check"
      CHECK ("entity_type" IN ('lead', 'deal', 'ticket')),
    CONSTRAINT "pipeline_stages_probability_range"
      CHECK ("probability" IS NULL OR ("probability" >= 0 AND "probability" <= 100))
);

ALTER TABLE "public"."pipeline_stages" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_pipeline_stages_updated_at" ON "public"."pipeline_stages";
CREATE TRIGGER "update_pipeline_stages_updated_at"
  BEFORE UPDATE ON "public"."pipeline_stages"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."pipeline_stages" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage pipeline stages" ON "public"."pipeline_stages";
CREATE POLICY "Admins can manage pipeline stages" ON "public"."pipeline_stages"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff can view pipeline stages" ON "public"."pipeline_stages";
CREATE POLICY "Staff can view pipeline stages" ON "public"."pipeline_stages"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role")
  );

GRANT ALL ON TABLE "public"."pipeline_stages" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "service_role";

-- Seed defaults matching the current enums (idempotent on entity_type+key)
INSERT INTO "public"."pipeline_stages" ("entity_type","key","name","sort_order","probability","is_won","is_lost","fold") VALUES
  ('lead','lead','Lead',10,10,false,false,false),
  ('lead','opportunity','Opportunity',20,40,false,false,false),
  ('lead','customer','Customer',30,100,true,false,false),
  ('lead','lost','Lost',40,0,false,true,true),
  ('deal','lead','Lead',10,10,false,false,false),
  ('deal','prospecting','Prospecting',20,20,false,false,false),
  ('deal','qualified','Qualified',30,40,false,false,false),
  ('deal','proposal','Proposal',40,60,false,false,false),
  ('deal','negotiation','Negotiation',50,80,false,false,false),
  ('deal','closed_won','Closed Won',60,100,true,false,false),
  ('deal','closed_lost','Closed Lost',70,0,false,true,true),
  ('ticket','new','New',10,NULL,false,false,false),
  ('ticket','open','Open',20,NULL,false,false,false),
  ('ticket','in_progress','In Progress',30,NULL,false,false,false),
  ('ticket','waiting','Waiting',40,NULL,false,false,false),
  ('ticket','resolved','Resolved',50,NULL,true,false,true),
  ('ticket','closed','Closed',60,NULL,true,false,true)
ON CONFLICT ("entity_type","key") DO NOTHING;

-- Nullable stage_id link on each consumer (enum stays the read source for now)
ALTER TABLE "public"."leads"   ADD COLUMN IF NOT EXISTS "stage_id" "uuid";
ALTER TABLE "public"."deals"   ADD COLUMN IF NOT EXISTS "stage_id" "uuid";
ALTER TABLE "public"."tickets" ADD COLUMN IF NOT EXISTS "stage_id" "uuid";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='leads_stage_id_fkey' AND table_name='leads') THEN
    ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_stage_id_fkey"
      FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='deals_stage_id_fkey' AND table_name='deals') THEN
    ALTER TABLE "public"."deals" ADD CONSTRAINT "deals_stage_id_fkey"
      FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='tickets_stage_id_fkey' AND table_name='tickets') THEN
    ALTER TABLE "public"."tickets" ADD CONSTRAINT "tickets_stage_id_fkey"
      FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill stage_id from the existing enum value (only where unset)
UPDATE "public"."leads" l SET "stage_id" = s.id
  FROM "public"."pipeline_stages" s
  WHERE s.entity_type='lead' AND s.key = l.status::text AND l.stage_id IS NULL;
UPDATE "public"."deals" d SET "stage_id" = s.id
  FROM "public"."pipeline_stages" s
  WHERE s.entity_type='deal' AND s.key = d.stage::text AND d.stage_id IS NULL;
UPDATE "public"."tickets" t SET "stage_id" = s.id
  FROM "public"."pipeline_stages" s
  WHERE s.entity_type='ticket' AND s.key = t.status::text AND t.stage_id IS NULL;

-- manage_pipeline_stage RPC (backs the skill). Writer-gated for mutations.
CREATE OR REPLACE FUNCTION "public"."manage_pipeline_stage"(
  "p_action" "text",
  "p_entity_type" "text" DEFAULT NULL,
  "p_stage_id" "uuid" DEFAULT NULL,
  "p_key" "text" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL,
  "p_sort_order" integer DEFAULT NULL,
  "p_probability" numeric DEFAULT NULL,
  "p_is_won" boolean DEFAULT NULL,
  "p_is_lost" boolean DEFAULT NULL,
  "p_fold" boolean DEFAULT NULL
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
    RAISE EXCEPTION 'Only admins can modify pipeline stages';
  END IF;

  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order), '[]'::jsonb) INTO v_result
    FROM pipeline_stages s
    WHERE p_entity_type IS NULL OR s.entity_type = p_entity_type;
    RETURN jsonb_build_object('success', true, 'stages', v_result);

  ELSIF p_action = 'create' THEN
    IF p_entity_type IS NULL OR p_name IS NULL THEN
      RAISE EXCEPTION 'entity_type and name are required';
    END IF;
    INSERT INTO pipeline_stages (entity_type, key, name, sort_order, probability, is_won, is_lost, fold)
    VALUES (
      p_entity_type,
      COALESCE(p_key, regexp_replace(lower(p_name), '[^a-z0-9]+', '_', 'g')),
      p_name, COALESCE(p_sort_order, 0), p_probability,
      COALESCE(p_is_won, false), COALESCE(p_is_lost, false), COALESCE(p_fold, false)
    )
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'stage_id', v_id);

  ELSIF p_action = 'update' THEN
    IF p_stage_id IS NULL THEN RAISE EXCEPTION 'stage_id is required for update'; END IF;
    UPDATE pipeline_stages SET
      name = COALESCE(p_name, name),
      sort_order = COALESCE(p_sort_order, sort_order),
      probability = COALESCE(p_probability, probability),
      is_won = COALESCE(p_is_won, is_won),
      is_lost = COALESCE(p_is_lost, is_lost),
      fold = COALESCE(p_fold, fold)
    WHERE id = p_stage_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stage % not found', p_stage_id; END IF;
    RETURN jsonb_build_object('success', true, 'stage_id', p_stage_id);

  ELSIF p_action = 'delete' THEN
    IF p_stage_id IS NULL THEN RAISE EXCEPTION 'stage_id is required for delete'; END IF;
    DELETE FROM pipeline_stages WHERE id = p_stage_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_stage_id);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_pipeline_stage"("text","text","uuid","text","text",integer,numeric,boolean,boolean,boolean) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_pipeline_stage"("text","text","uuid","text","text",integer,numeric,boolean,boolean,boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."manage_pipeline_stage"("text","text","uuid","text","text",integer,numeric,boolean,boolean,boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_pipeline_stage"("text","text","uuid","text","text",integer,numeric,boolean,boolean,boolean) TO "service_role";
