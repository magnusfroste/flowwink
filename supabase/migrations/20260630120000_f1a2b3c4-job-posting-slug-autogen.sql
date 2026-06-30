-- Auto-generate job_postings.slug from the title when omitted.
--
-- job_postings.slug is NOT NULL with no default, but manage_job_posting (the
-- generic db:job_postings CRUD) doesn't supply or generate it — so create
-- failed with "null value in column slug violates not-null constraint" (HR
-- recruitment smoke). Same class as rma_number / mo_number. Slugify the title
-- and dedupe with a -N suffix. Idempotent + forward-dated.

CREATE OR REPLACE FUNCTION "public"."tg_job_postings_set_slug"() RETURNS "trigger"
LANGUAGE "plpgsql" SET "search_path" TO 'public' AS $$
DECLARE
  base text;
  cand text;
  n int := 0;
BEGIN
  IF NEW.slug IS NOT NULL AND btrim(NEW.slug) <> '' THEN
    RETURN NEW;
  END IF;
  base := btrim(lower(regexp_replace(COALESCE(NEW.title, ''), '[^a-z0-9]+', '-', 'gi')), '-');
  IF base = '' THEN base := 'job'; END IF;
  cand := base;
  WHILE EXISTS (SELECT 1 FROM job_postings WHERE slug = cand) LOOP
    n := n + 1;
    cand := base || '-' || n;
  END LOOP;
  NEW.slug := cand;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "trg_job_postings_set_slug" ON "public"."job_postings";
CREATE TRIGGER "trg_job_postings_set_slug"
  BEFORE INSERT ON "public"."job_postings"
  FOR EACH ROW EXECUTE FUNCTION "public"."tg_job_postings_set_slug"();

NOTIFY pgrst, 'reload schema';
