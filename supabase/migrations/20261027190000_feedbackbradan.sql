-- ─────────────────────────────────────────────────────────────────────────────
-- Feedbackbrädan — the feedback module (on by default, endpoint upstream)
-- ─────────────────────────────────────────────────────────────────────────────
-- What Easypanel's feedback board is for its users, FlowWink's is for every
-- instance: boards (bug, feature, template, question), posts with a status,
-- votes and comments. The twist is the endpoint. By default an instance SENDS
-- its feedback to www.flowwink.com — one board for the whole fleet, where the
-- project reads what every instance runs into. A self-hoster who wants the
-- board for their own product points the endpoint at their own instance and
-- RECEIVES instead: the same tables, the same public board at /feedback.
--
-- A post remembers where it came from (origin_site_url, origin: migration
-- head, skills sha, enabled modules) so a report reads with its version.
-- Writes come through content-api (service role, validated); the public reads
-- posts and comments, never votes (the count rides on the post).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedback_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board text NOT NULL DEFAULT 'feature',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  author_name text,
  author_email text,
  origin_site_url text,
  origin jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'board',
  votes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  ALTER TABLE public.feedback_posts DROP CONSTRAINT IF EXISTS feedback_posts_board_check;
  ALTER TABLE public.feedback_posts ADD CONSTRAINT feedback_posts_board_check CHECK (board IN ('bug', 'feature', 'template', 'question'));
  ALTER TABLE public.feedback_posts DROP CONSTRAINT IF EXISTS feedback_posts_status_check;
  ALTER TABLE public.feedback_posts ADD CONSTRAINT feedback_posts_status_check CHECK (status IN ('open', 'planned', 'in_progress', 'done', 'declined'));
  ALTER TABLE public.feedback_posts DROP CONSTRAINT IF EXISTS feedback_posts_source_check;
  ALTER TABLE public.feedback_posts ADD CONSTRAINT feedback_posts_source_check CHECK (source IN ('board', 'instance', 'agent'));
  ALTER TABLE public.feedback_posts DROP CONSTRAINT IF EXISTS feedback_posts_title_check;
  ALTER TABLE public.feedback_posts ADD CONSTRAINT feedback_posts_title_check CHECK (char_length(title) BETWEEN 3 AND 200);
  ALTER TABLE public.feedback_posts DROP CONSTRAINT IF EXISTS feedback_posts_body_check;
  ALTER TABLE public.feedback_posts ADD CONSTRAINT feedback_posts_body_check CHECK (char_length(body) <= 10000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS feedback_posts_board_status_idx ON public.feedback_posts (board, status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_posts_origin_idx ON public.feedback_posts (origin_site_url);
COMMENT ON TABLE public.feedback_posts IS 'The feedback board: a post per bug report, feature request, template wish or question — from this instance''s public board, from another instance (origin_site_url), or from an agent. Status is the maintainer''s answer.';
COMMENT ON COLUMN public.feedback_posts.origin IS 'The sending instance''s version: migration_head, skills_sha, modules (enabled ids), app. Read a report with its version.';

CREATE TABLE IF NOT EXISTS public.feedback_votes (
  post_id uuid NOT NULL REFERENCES public.feedback_posts(id) ON DELETE CASCADE,
  voter_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, voter_key)
);
COMMENT ON TABLE public.feedback_votes IS 'One vote per voter per post. voter_key is a signed-in user id, an e-mail, or the board''s device key — never shown.';

CREATE TABLE IF NOT EXISTS public.feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.feedback_posts(id) ON DELETE CASCADE,
  author_name text,
  body text NOT NULL,
  is_staff boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  ALTER TABLE public.feedback_comments DROP CONSTRAINT IF EXISTS feedback_comments_body_check;
  ALTER TABLE public.feedback_comments ADD CONSTRAINT feedback_comments_body_check CHECK (char_length(body) BETWEEN 1 AND 5000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS feedback_comments_post_idx ON public.feedback_comments (post_id, created_at);

-- ── Counters ride on the post ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.feedback_count_votes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  UPDATE public.feedback_posts p SET votes_count = (SELECT COUNT(*) FROM public.feedback_votes v WHERE v.post_id = p.id)
   WHERE p.id = COALESCE(NEW.post_id, OLD.post_id);
  RETURN NULL;
END $fn$;
DROP TRIGGER IF EXISTS feedback_votes_count ON public.feedback_votes;
CREATE TRIGGER feedback_votes_count AFTER INSERT OR DELETE ON public.feedback_votes
  FOR EACH ROW EXECUTE FUNCTION public.feedback_count_votes();

CREATE OR REPLACE FUNCTION public.feedback_count_comments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  UPDATE public.feedback_posts p SET comments_count = (SELECT COUNT(*) FROM public.feedback_comments c WHERE c.post_id = p.id), updated_at = now()
   WHERE p.id = COALESCE(NEW.post_id, OLD.post_id);
  RETURN NULL;
END $fn$;
DROP TRIGGER IF EXISTS feedback_comments_count ON public.feedback_comments;
CREATE TRIGGER feedback_comments_count AFTER INSERT OR DELETE ON public.feedback_comments
  FOR EACH ROW EXECUTE FUNCTION public.feedback_count_comments();

DROP TRIGGER IF EXISTS feedback_posts_updated_at ON public.feedback_posts;
CREATE TRIGGER feedback_posts_updated_at BEFORE UPDATE ON public.feedback_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Who reads, who writes ─────────────────────────────────────────────────
ALTER TABLE public.feedback_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;

-- The board is public: posts and comments are readable by everyone. Votes are
-- not (the count is on the post). Writes from the public come through
-- content-api with the service role after validation; staff of the feedback
-- module manage everything from the admin.
DROP POLICY IF EXISTS "feedback_posts_public_read" ON public.feedback_posts;
CREATE POLICY "feedback_posts_public_read" ON public.feedback_posts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "feedback_comments_public_read" ON public.feedback_comments;
CREATE POLICY "feedback_comments_public_read" ON public.feedback_comments FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "feedback module manages posts" ON public.feedback_posts;
CREATE POLICY "feedback module manages posts" ON public.feedback_posts FOR ALL
  USING (public.can_access_module(auth.uid(), 'feedback'))
  WITH CHECK (public.can_access_module(auth.uid(), 'feedback'));
DROP POLICY IF EXISTS "feedback module manages comments" ON public.feedback_comments;
CREATE POLICY "feedback module manages comments" ON public.feedback_comments FOR ALL
  USING (public.can_access_module(auth.uid(), 'feedback'))
  WITH CHECK (public.can_access_module(auth.uid(), 'feedback'));
DROP POLICY IF EXISTS "feedback module reads votes" ON public.feedback_votes;
CREATE POLICY "feedback module reads votes" ON public.feedback_votes FOR SELECT
  USING (public.can_access_module(auth.uid(), 'feedback'));

-- The public's own writes, by RLS (no service key in content-api): a post is
-- born open, from the board or another instance; a comment is never staff; a
-- vote is one row per voter. Lengths are the CHECK constraints above.
DROP POLICY IF EXISTS "anyone posts to the board" ON public.feedback_posts;
CREATE POLICY "anyone posts to the board" ON public.feedback_posts FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'open' AND source IN ('board', 'instance'));
DROP POLICY IF EXISTS "anyone comments on the board" ON public.feedback_comments;
CREATE POLICY "anyone comments on the board" ON public.feedback_comments FOR INSERT TO anon, authenticated
  WITH CHECK (is_staff = false);
DROP POLICY IF EXISTS "anyone votes on the board" ON public.feedback_votes;
CREATE POLICY "anyone votes on the board" ON public.feedback_votes FOR INSERT TO anon, authenticated
  WITH CHECK (char_length(voter_key) BETWEEN 1 AND 200 AND EXISTS (SELECT 1 FROM public.feedback_posts p WHERE p.id = post_id));
DROP POLICY IF EXISTS "a voter withdraws a vote" ON public.feedback_votes;
CREATE POLICY "a voter withdraws a vote" ON public.feedback_votes FOR DELETE TO anon, authenticated USING (true);

-- Table grants (the anon surface is revoked by default since 2026-08-22, so
-- a public table says what it allows): the board reads, the public's three
-- writes, staff everything (RLS decides who is staff).
GRANT SELECT ON public.feedback_posts, public.feedback_comments TO anon, authenticated;
GRANT INSERT ON public.feedback_posts, public.feedback_comments, public.feedback_votes TO anon, authenticated;
GRANT DELETE ON public.feedback_votes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_posts, public.feedback_comments, public.feedback_votes TO authenticated;
GRANT ALL ON public.feedback_posts, public.feedback_comments, public.feedback_votes TO service_role;

-- ── The matrix: support and marketing see the board; admin always does ────
INSERT INTO public.role_module_access_defaults (role, module_id)
SELECT r.role::public.app_role, 'feedback'
FROM (VALUES ('support'), ('marketing')) AS r(role)
ON CONFLICT DO NOTHING;
-- A live matrix that already carries one of these roles gets the pair too
-- (an operator who removed support's modules on purpose has no support row
-- for tickets either, and this leaves that alone).
INSERT INTO public.role_module_access (role, module_id)
SELECT d.role, d.module_id FROM public.role_module_access_defaults d
WHERE d.module_id = 'feedback'
  AND EXISTS (SELECT 1 FROM public.role_module_access a WHERE a.role = d.role AND a.module_id = 'tickets')
ON CONFLICT DO NOTHING;

-- ── The instances that ping ───────────────────────────────────────────────
-- A daily ping from every instance whose feedback endpoint points here: a
-- random instance id minted on the first ping, the site URL, the skills
-- artifact sha and the enabled modules. No business data. The sender can
-- switch it off (feedback.share_usage); the receiver sees how many run the
-- platform, which version, and what each report came from.
CREATE TABLE IF NOT EXISTS public.feedback_instances (
  instance_id uuid PRIMARY KEY,
  site_url text,
  app text NOT NULL DEFAULT 'flowwink',
  skills_sha text,
  migration_head text,
  modules_enabled text[] NOT NULL DEFAULT '{}',
  module_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ping_count integer NOT NULL DEFAULT 1,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS feedback_instances_last_seen_idx ON public.feedback_instances (last_seen_at DESC);
-- Granted here, after the table: above, beside the other grants, the GRANT ran
-- before CREATE TABLE and every live instance refused the file (42P01).
GRANT SELECT ON public.feedback_instances TO authenticated;
GRANT ALL ON public.feedback_instances TO service_role;
COMMENT ON TABLE public.feedback_instances IS 'Instances that ping this endpoint (feedback_ping, daily): id, site URL, version, enabled modules, first/last seen. The fleet view of the feedback module; nothing but what the ping carries.';
ALTER TABLE public.feedback_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedback module reads instances" ON public.feedback_instances;
CREATE POLICY "feedback module reads instances" ON public.feedback_instances FOR SELECT
  USING (public.can_access_module(auth.uid(), 'feedback'));

-- The ping, recorded by one definer function the public may call: upsert by
-- instance id, count the pings, keep first_seen. Nothing is read back.
CREATE OR REPLACE FUNCTION public.feedback_record_ping(
  p_instance_id uuid,
  p_site_url text DEFAULT NULL,
  p_app text DEFAULT 'flowwink',
  p_skills_sha text DEFAULT NULL,
  p_migration_head text DEFAULT NULL,
  p_modules_enabled text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_count int;
BEGIN
  IF p_instance_id IS NULL THEN RAISE EXCEPTION 'instance_id is required' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.feedback_instances (instance_id, site_url, app, skills_sha, migration_head, modules_enabled, module_count)
    VALUES (p_instance_id, left(p_site_url, 300), left(COALESCE(p_app, 'flowwink'), 40), left(p_skills_sha, 64), left(p_migration_head, 32),
            (COALESCE(p_modules_enabled, '{}'::text[]))[1:200], COALESCE(array_length(p_modules_enabled, 1), 0))
    ON CONFLICT (instance_id) DO UPDATE SET
      site_url = EXCLUDED.site_url, app = EXCLUDED.app, skills_sha = EXCLUDED.skills_sha, migration_head = EXCLUDED.migration_head,
      modules_enabled = EXCLUDED.modules_enabled, module_count = EXCLUDED.module_count,
      last_seen_at = now(), ping_count = public.feedback_instances.ping_count + 1
    RETURNING ping_count INTO v_count;
  RETURN jsonb_build_object('success', true, 'instance_id', p_instance_id, 'ping_count', v_count);
END $fn$;
GRANT EXECUTE ON FUNCTION public.feedback_record_ping(uuid, text, text, text, text, text[]) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.feedback_record_ping(uuid, text, text, text, text, text[]) IS
  'The daily ping from another instance (feedback module): upsert by instance id, count. Public by design — it carries nothing but an id, a URL and a version.';

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- A post is readable by anon, a vote counts once per voter, a comment counts
-- and bumps updated_at; anon cannot read votes. Rolled back.
DO $$
DECLARE v_p uuid; v_n int; v_votes int; v_comments int;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.feedback_posts (board, title, body, source, origin_site_url)
      VALUES ('bug', 'proof: the board counts', 'A proof post.', 'instance', 'https://proof.example') RETURNING id INTO v_p;
    INSERT INTO public.feedback_votes (post_id, voter_key) VALUES (v_p, 'a'), (v_p, 'b');
    BEGIN
      INSERT INTO public.feedback_votes (post_id, voter_key) VALUES (v_p, 'a');
      RAISE EXCEPTION 'proof: a second vote by the same voter should be refused';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    INSERT INTO public.feedback_comments (post_id, author_name, body) VALUES (v_p, 'proof', 'Seen.');
    SELECT votes_count, comments_count INTO v_votes, v_comments FROM public.feedback_posts WHERE id = v_p;
    IF v_votes <> 2 OR v_comments <> 1 THEN RAISE EXCEPTION 'proof: counters should be 2/1, got %/%', v_votes, v_comments; END IF;
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT COUNT(*) INTO v_n FROM public.feedback_posts WHERE id = v_p;
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof: anon should read the post'; END IF;
    SELECT COUNT(*) INTO v_n FROM public.feedback_votes WHERE post_id = v_p;
    IF v_n <> 0 THEN RAISE EXCEPTION 'proof: anon should not read votes, got %', v_n; END IF;
    EXECUTE 'RESET ROLE';
    -- The public's writes: anon posts, comments, votes — and pings through the RPC.
    EXECUTE 'SET LOCAL ROLE anon';
    INSERT INTO public.feedback_posts (board, title, body) VALUES ('feature', 'proof: anon post', '') RETURNING id INTO v_p;
    INSERT INTO public.feedback_comments (post_id, body) VALUES (v_p, 'anon comment');
    INSERT INTO public.feedback_votes (post_id, voter_key) VALUES (v_p, 'device:proof');
    PERFORM public.feedback_record_ping('00000000-0000-4000-8000-00000000f00d', 'https://proof.example', 'flowwink', 'sha', NULL, ARRAY['pages']);
    PERFORM public.feedback_record_ping('00000000-0000-4000-8000-00000000f00d', 'https://proof.example', 'flowwink', 'sha', NULL, ARRAY['pages']);
    BEGIN
      INSERT INTO public.feedback_posts (board, title, body, status) VALUES ('feature', 'proof: anon cannot plan', '', 'planned');
      RAISE EXCEPTION 'proof: anon must not set a status';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    EXECUTE 'RESET ROLE';
    SELECT ping_count INTO v_n FROM public.feedback_instances WHERE instance_id = '00000000-0000-4000-8000-00000000f00d';
    IF v_n <> 2 THEN RAISE EXCEPTION 'proof: two pings should count 2, got %', v_n; END IF;
    RAISE NOTICE 'feedback board proof ok';
    RAISE EXCEPTION '__feedback_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      BEGIN EXECUTE 'RESET ROLE'; EXCEPTION WHEN OTHERS THEN NULL; END;
      IF SQLERRM <> '__feedback_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
