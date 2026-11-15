-- ============================================================================
-- The same report is one post (2026-11-15).
--
-- The board on www read 62 open bugs. 60 were three titles — "Skill failing:
-- pay_vendor_invoice", book_appointment_slot, register_webinar — filed four
-- times a day since 2026-11-11 from http://localhost:5173, by twenty instance
-- ids: every CI stack is a new instance (the nightly fresh install, and since
-- that day the battery on every pull request), runs the battery's deliberate
-- failures, and reported them upstream. The sender's cadence ("one report per
-- defect per instance in 14 days") cannot hold against a new instance per run,
-- and a person's report would have drowned.
--
-- Three locks. Two are the sender's (a test stack declares
-- FEEDBACK_SHARE_USAGE=false; a newborn instance files no defect — it has no
-- day of evidence yet). This is the receiver's, and it holds whatever the
-- sender is: a report whose title an open post already carries joins that
-- post. The post counts its reports and remembers who sent them, so the board
-- says "reported 14 times by 6 instances" once instead of fourteen posts.
--
-- A post a PERSON writes on the board is never merged: two people may mean
-- different things by the same title.
-- ============================================================================

ALTER TABLE public.feedback_posts ADD COLUMN IF NOT EXISTS title_key text;
ALTER TABLE public.feedback_posts ADD COLUMN IF NOT EXISTS reports_count integer NOT NULL DEFAULT 1;
ALTER TABLE public.feedback_posts ADD COLUMN IF NOT EXISTS reporters jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.feedback_posts ADD COLUMN IF NOT EXISTS last_reported_at timestamptz;

COMMENT ON COLUMN public.feedback_posts.title_key IS
  'The title as reports are compared (lower case, letters and digits), set by trigger on every post.';
COMMENT ON COLUMN public.feedback_posts.reports_count IS
  'How many times this was reported: the post itself plus every later report that joined it.';
COMMENT ON COLUMN public.feedback_posts.reporters IS
  'Who reported it, newest last, at most 50: [{instance_id, site_url, at}]. One entry per instance.';

-- The key in SQL, for the rows already here and for the join below. The same
-- normalisation as feedbackKey for every title the platform itself writes.
CREATE OR REPLACE FUNCTION public.feedback_title_key(p_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(lower(coalesce(p_title, '')), '[^[:alnum:]]+', ' ', 'g'))
$$;

UPDATE public.feedback_posts SET title_key = public.feedback_title_key(title) WHERE title_key IS NULL;

-- Every post carries its key, whoever writes it: one normaliser, the database's.
CREATE OR REPLACE FUNCTION public.feedback_posts_set_title_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.title_key := public.feedback_title_key(NEW.title);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS feedback_posts_title_key ON public.feedback_posts;
CREATE TRIGGER feedback_posts_title_key
  BEFORE INSERT OR UPDATE OF title ON public.feedback_posts
  FOR EACH ROW EXECUTE FUNCTION public.feedback_posts_set_title_key();

CREATE INDEX IF NOT EXISTS feedback_posts_title_key_idx
  ON public.feedback_posts (board, title_key) WHERE status IN ('open', 'planned', 'in_progress');

-- ── A report joins the open post that already says it ───────────────────────
-- Answers the post it joined, or NULL when there is none (the caller then
-- writes a new post). One entry per instance in `reporters`; the count counts
-- every report.
CREATE OR REPLACE FUNCTION public.feedback_join_report(
  p_board text,
  p_title text,
  p_instance_id text DEFAULT NULL,
  p_site_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key text := public.feedback_title_key(p_title);
  v_post public.feedback_posts%ROWTYPE;
  v_who jsonb := jsonb_strip_nulls(jsonb_build_object('instance_id', nullif(p_instance_id, ''), 'site_url', nullif(p_site_url, ''), 'at', now()));
  v_reporters jsonb;
BEGIN
  IF v_key = '' THEN RETURN NULL; END IF;
  SELECT * INTO v_post FROM public.feedback_posts
   WHERE board = p_board AND title_key = v_key
     AND status IN ('open', 'planned', 'in_progress')
     AND source IN ('instance', 'agent')
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- The instance's earlier entry gives way to this one; the list keeps 50.
  SELECT coalesce(jsonb_agg(r ORDER BY ord), '[]'::jsonb) INTO v_reporters
    FROM (
      SELECT r, ord FROM jsonb_array_elements(v_post.reporters) WITH ORDINALITY AS t(r, ord)
       WHERE nullif(p_instance_id, '') IS NULL OR r->>'instance_id' IS DISTINCT FROM p_instance_id
       ORDER BY ord DESC LIMIT 49
    ) kept;

  UPDATE public.feedback_posts
     SET reports_count = reports_count + 1,
         reporters = v_reporters || jsonb_build_array(v_who),
         last_reported_at = now()
   WHERE id = v_post.id;
  RETURN jsonb_build_object('id', v_post.id, 'status', v_post.status, 'merged', true, 'reports_count', v_post.reports_count + 1);
END
$fn$;

REVOKE ALL ON FUNCTION public.feedback_join_report(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_join_report(text, text, text, text) TO service_role;

-- ── The posts already here: every duplicate joins its oldest ────────────────
-- Only reports from instances and agents, only the ones nobody voted or
-- commented on (a person's reaction stays where it was written).
DO $merge$
DECLARE
  g record;
BEGIN
  FOR g IN
    SELECT board, title_key, (array_agg(id ORDER BY created_at))[1] AS keeper, count(*) AS n
      FROM public.feedback_posts
     WHERE status IN ('open', 'planned', 'in_progress') AND source IN ('instance', 'agent') AND title_key <> ''
     GROUP BY board, title_key
    HAVING count(*) > 1
  LOOP
    WITH dupes AS (
      SELECT id, origin, origin_site_url, created_at FROM public.feedback_posts
       WHERE board = g.board AND title_key = g.title_key AND id <> g.keeper
         AND status IN ('open', 'planned', 'in_progress') AND source IN ('instance', 'agent')
         AND votes_count = 0 AND comments_count = 0
    ), who AS (
      -- One entry per instance, its newest report, the 50 newest instances.
      SELECT coalesce(jsonb_agg(entry ORDER BY at), '[]'::jsonb) AS reporters FROM (
        SELECT DISTINCT ON (coalesce(origin->>'instance_id', id::text))
               jsonb_strip_nulls(jsonb_build_object('instance_id', origin->>'instance_id', 'site_url', origin_site_url, 'at', created_at)) AS entry,
               created_at AS at
          FROM dupes
         ORDER BY coalesce(origin->>'instance_id', id::text), created_at DESC
      ) per_instance
    ), gone AS (
      DELETE FROM public.feedback_posts p USING dupes d WHERE p.id = d.id RETURNING p.created_at
    )
    UPDATE public.feedback_posts k
       SET reports_count = k.reports_count + (SELECT count(*) FROM gone),
           reporters = (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM (
                          SELECT e FROM jsonb_array_elements(k.reporters || (SELECT reporters FROM who)) WITH ORDINALITY AS t(e, ord)
                           ORDER BY ord DESC LIMIT 50) newest),
           last_reported_at = greatest(k.last_reported_at, (SELECT max(created_at) FROM gone))
     WHERE k.id = g.keeper AND EXISTS (SELECT 1 FROM gone);
  END LOOP;
END
$merge$;

-- ── Proof, rolled back ──────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_first uuid;
  v_person uuid;
  v jsonb;
  v_row public.feedback_posts%ROWTYPE;
BEGIN
  BEGIN
    INSERT INTO public.feedback_posts (board, title, source, origin_site_url)
    VALUES ('bug', 'Skill failing: proof_join', 'instance', 'https://a.example')
    RETURNING id INTO v_first;

    -- The same title, however it is spelled, joins — from three reports by two instances.
    v := public.feedback_join_report('bug', 'skill failing — PROOF_JOIN!', 'i-1', 'https://b.example');
    IF (v->>'id')::uuid IS DISTINCT FROM v_first OR (v->>'merged') <> 'true' THEN RAISE EXCEPTION 'proof: the same title joins the open post, got %', v; END IF;
    PERFORM public.feedback_join_report('bug', 'Skill failing: proof_join', 'i-1', 'https://b.example');
    PERFORM public.feedback_join_report('bug', 'Skill failing: proof_join', 'i-2', 'http://localhost:5173');
    SELECT * INTO v_row FROM public.feedback_posts WHERE id = v_first;
    IF v_row.reports_count <> 4 THEN RAISE EXCEPTION 'proof: four reports are counted, got %', v_row.reports_count; END IF;
    IF jsonb_array_length(v_row.reporters) <> 2 THEN RAISE EXCEPTION 'proof: one entry per instance (2), got %', v_row.reporters; END IF;
    IF (SELECT count(*) FROM public.feedback_posts WHERE title_key = v_row.title_key) <> 1 THEN RAISE EXCEPTION 'proof: no second post was written'; END IF;

    -- Another board, another title: nothing to join.
    IF public.feedback_join_report('feature', 'Skill failing: proof_join', 'i-1', NULL) IS NOT NULL THEN RAISE EXCEPTION 'proof: a report joins only within its board'; END IF;
    IF public.feedback_join_report('bug', 'Skill failing: proof_other', 'i-1', NULL) IS NOT NULL THEN RAISE EXCEPTION 'proof: another title is another post'; END IF;

    -- A closed post is closed: the next report is a new post (it came back).
    UPDATE public.feedback_posts SET status = 'done' WHERE id = v_first;
    IF public.feedback_join_report('bug', 'Skill failing: proof_join', 'i-3', NULL) IS NOT NULL THEN RAISE EXCEPTION 'proof: a report never joins a closed post'; END IF;

    -- What a person wrote on the board is never joined.
    INSERT INTO public.feedback_posts (board, title, source)
    VALUES ('bug', 'Proof: the export button', 'board') RETURNING id INTO v_person;
    IF public.feedback_join_report('bug', 'Proof: the export button', 'i-1', NULL) IS NOT NULL THEN RAISE EXCEPTION 'proof: a person''s post is never merged into'; END IF;

    RAISE EXCEPTION 'proof passed — rolling back' USING ERRCODE = 'P0PRF';
  EXCEPTION
    WHEN SQLSTATE 'P0PRF' THEN NULL;
    WHEN undefined_table OR undefined_column OR undefined_object THEN
      RAISE NOTICE 'feedback join: proof skipped here (%)', SQLERRM;
  END;
END $proof$;
