-- Sprint EPIC-03 completion · S1 — enum ↔ stage_id sync keystone
-- (docs/parity/sprint-pipeline-consolidation.md). Keeps the legacy status/stage
-- enum and the shared pipeline_stages.stage_id consistent in BOTH directions, so
-- each UI can migrate to stage_id with zero risk and enum-readers keep working.
-- BEFORE INSERT/UPDATE on leads/deals/tickets. Idempotent.

-- LEADS (enum column: status :: lead_status)
CREATE OR REPLACE FUNCTION "public"."sync_lead_stage"() RETURNS "trigger"
LANGUAGE "plpgsql" SET "search_path" TO 'public' AS $$
DECLARE v_key text; v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='lead';
      IF v_key IS NOT NULL THEN NEW.status := v_key::lead_status; END IF;
    ELSIF NEW.status IS NOT NULL THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='lead' AND key = NEW.status::text;
      NEW.stage_id := v_id;
    END IF;
  ELSE
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='lead';
      IF v_key IS NOT NULL THEN NEW.status := v_key::lead_status; END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='lead' AND key = NEW.status::text;
      IF v_id IS NOT NULL THEN NEW.stage_id := v_id; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION "public"."sync_lead_stage"() OWNER TO "postgres";
DROP TRIGGER IF EXISTS "sync_lead_stage_trg" ON "public"."leads";
CREATE TRIGGER "sync_lead_stage_trg" BEFORE INSERT OR UPDATE ON "public"."leads"
  FOR EACH ROW EXECUTE FUNCTION "public"."sync_lead_stage"();

-- DEALS (enum column: stage :: deal_stage)
CREATE OR REPLACE FUNCTION "public"."sync_deal_stage"() RETURNS "trigger"
LANGUAGE "plpgsql" SET "search_path" TO 'public' AS $$
DECLARE v_key text; v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='deal';
      IF v_key IS NOT NULL THEN NEW.stage := v_key::deal_stage; END IF;
    ELSIF NEW.stage IS NOT NULL THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='deal' AND key = NEW.stage::text;
      NEW.stage_id := v_id;
    END IF;
  ELSE
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='deal';
      IF v_key IS NOT NULL THEN NEW.stage := v_key::deal_stage; END IF;
    ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='deal' AND key = NEW.stage::text;
      IF v_id IS NOT NULL THEN NEW.stage_id := v_id; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION "public"."sync_deal_stage"() OWNER TO "postgres";
DROP TRIGGER IF EXISTS "sync_deal_stage_trg" ON "public"."deals";
CREATE TRIGGER "sync_deal_stage_trg" BEFORE INSERT OR UPDATE ON "public"."deals"
  FOR EACH ROW EXECUTE FUNCTION "public"."sync_deal_stage"();

-- TICKETS (enum column: status :: ticket_status)
CREATE OR REPLACE FUNCTION "public"."sync_ticket_stage"() RETURNS "trigger"
LANGUAGE "plpgsql" SET "search_path" TO 'public' AS $$
DECLARE v_key text; v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='ticket';
      IF v_key IS NOT NULL THEN NEW.status := v_key::ticket_status; END IF;
    ELSIF NEW.status IS NOT NULL THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='ticket' AND key = NEW.status::text;
      NEW.stage_id := v_id;
    END IF;
  ELSE
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='ticket';
      IF v_key IS NOT NULL THEN NEW.status := v_key::ticket_status; END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='ticket' AND key = NEW.status::text;
      IF v_id IS NOT NULL THEN NEW.stage_id := v_id; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION "public"."sync_ticket_stage"() OWNER TO "postgres";
DROP TRIGGER IF EXISTS "sync_ticket_stage_trg" ON "public"."tickets";
CREATE TRIGGER "sync_ticket_stage_trg" BEFORE INSERT OR UPDATE ON "public"."tickets"
  FOR EACH ROW EXECUTE FUNCTION "public"."sync_ticket_stage"();

-- Backfill any rows still missing stage_id (idempotent; only touches NULLs)
UPDATE "public"."leads" l SET stage_id = s.id
  FROM pipeline_stages s WHERE s.entity_type='lead' AND s.key = l.status::text AND l.stage_id IS NULL;
UPDATE "public"."deals" d SET stage_id = s.id
  FROM pipeline_stages s WHERE s.entity_type='deal' AND s.key = d.stage::text AND d.stage_id IS NULL;
UPDATE "public"."tickets" t SET stage_id = s.id
  FROM pipeline_stages s WHERE s.entity_type='ticket' AND s.key = t.status::text AND t.stage_id IS NULL;
