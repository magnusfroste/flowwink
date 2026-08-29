-- Kunskapsloopens två nudgar (Magnus 2026-08-29):
--
-- 1) Veckans kunskap → River. En ren-SQL-cron som varje måndag postar en
--    positiv sammanfattning av veckans nya/uppdaterade wiki-sidor och
--    KB-artiklar till River — teamets sociala kanal, där firande hör hemma
--    (kanalreglerna efter River-incidenten: positivt/informativt JA,
--    driftvarningar ALDRIG). Ingen URL, ingen edge-hop — cron-giftkedjans
--    klass kan inte uppstå. Tom vecka ⇒ tyst no-op; körning två gånger samma
--    vecka ⇒ dedup på rubrikprefixet.
--
-- 2) knowledge_gap_log. Publika chatten loggar frågor där retrieval inte
--    hittade något semantiskt nära (top-cosinus < tröskel) — signalen som gör
--    Daily Briefing till en dokumentationsbeställare: "de här frågorna
--    saknade grundning, kandidater för wikin/KB:n". Admin-läst, 30 dagars
--    retention, aldrig i vägen för själva svaret (fire-and-forget i edge).
--
-- Idempotent + forward-daterad (Lovable-ledger-regeln).

-- ── 1. Luckloggen ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_gap_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asked_at timestamptz NOT NULL DEFAULT now(),
  question text NOT NULL,
  surface text NOT NULL DEFAULT 'public_chat',
  chunk_count integer NOT NULL DEFAULT 0,
  top_semantic double precision,
  conversation_id text
);

CREATE INDEX IF NOT EXISTS idx_knowledge_gap_log_asked_at
  ON public.knowledge_gap_log (asked_at DESC);

ALTER TABLE public.knowledge_gap_log ENABLE ROW LEVEL SECURITY;

-- Endast admin läser (briefingen kör med service-nyckel och passerar RLS).
-- Inga INSERT/UPDATE/DELETE-policies: skrivningar sker enbart via service-rollen.
DROP POLICY IF EXISTS "Admins read knowledge gaps" ON public.knowledge_gap_log;
CREATE POLICY "Admins read knowledge gaps" ON public.knowledge_gap_log
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- ── 2. Veckans kunskap → River ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_weekly_knowledge_to_river()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_enabled boolean;
  v_author uuid;
  v_since timestamptz := now() - interval '7 days';
  v_wiki_new text := '';
  v_wiki_upd text := '';
  v_kb_new  text := '';
  v_body text;
  v_count integer := 0;
  r record;
BEGIN
  -- Behörighet: cron kör som postgres, plattformen som service_role, en admin
  -- via skill-lagret. Ingen annan.
  IF NOT (
       auth.role() = 'service_role'
    OR has_role(auth.uid(), 'admin'::app_role)
    OR session_user IN ('postgres', 'supabase_admin')
  ) THEN
    RAISE EXCEPTION 'post_weekly_knowledge_to_river: admin or service_role required';
  END IF;

  SELECT COALESCE((value->'river'->>'enabled')::boolean, false)
    INTO v_enabled FROM site_settings WHERE key = 'modules';
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'river module disabled');
  END IF;

  FOR r IN SELECT slug, title FROM wiki_pages
           WHERE created_at >= v_since ORDER BY created_at LOOP
    v_wiki_new := v_wiki_new || format('- [%s](/admin/wiki/%s)', r.title, r.slug) || E'\n';
    v_count := v_count + 1;
  END LOOP;

  FOR r IN SELECT slug, title FROM wiki_pages
           WHERE updated_at >= v_since AND created_at < v_since ORDER BY updated_at LOOP
    v_wiki_upd := v_wiki_upd || format('- [%s](/admin/wiki/%s)', r.title, r.slug) || E'\n';
    v_count := v_count + 1;
  END LOOP;

  FOR r IN SELECT slug, title FROM kb_articles
           WHERE created_at >= v_since AND is_published = true ORDER BY created_at LOOP
    v_kb_new := v_kb_new || format('- %s', r.title) || E'\n';
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'no new knowledge this week');
  END IF;

  -- Veckodedup: rubrikprefixet är postens fingeravtryck.
  IF EXISTS (
    SELECT 1 FROM river_posts
    WHERE body LIKE '📚 **Veckans kunskap**%'
      AND created_at >= now() - interval '6 days'
  ) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already posted this week');
  END IF;

  -- Författare: river_posts.author_id är NOT NULL — samma sista-utväg som
  -- agent-vägen i agent-execute: en admin står som avsändare.
  SELECT user_id INTO v_author FROM user_roles
   WHERE role = 'admin'::app_role ORDER BY user_id LIMIT 1;
  IF v_author IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no admin user to author the post');
  END IF;

  v_body := E'📚 **Veckans kunskap**\n\n';
  IF v_wiki_new <> '' THEN
    v_body := v_body || E'**Nytt i wikin**\n' || v_wiki_new || E'\n';
  END IF;
  IF v_wiki_upd <> '' THEN
    v_body := v_body || E'**Uppdaterat i wikin**\n' || v_wiki_upd || E'\n';
  END IF;
  IF v_kb_new <> '' THEN
    v_body := v_body || E'**Nya KB-artiklar**\n' || v_kb_new || E'\n';
  END IF;
  v_body := v_body || '_Nedskrivet blir delbart, sökbart och något agenterna kan svara ur. Bra jobbat!_';

  INSERT INTO river_posts (author_id, body) VALUES (v_author, v_body);

  RETURN jsonb_build_object('success', true, 'posted', true, 'items', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.post_weekly_knowledge_to_river() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_weekly_knowledge_to_river() FROM anon;
GRANT EXECUTE ON FUNCTION public.post_weekly_knowledge_to_river() TO authenticated, service_role;

-- ── 3. Cron: måndagspost + retention ────────────────────────────────────────
-- Ren SQL i båda jobben (ingen http, inga nycklar). Skapas bara om de saknas.

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-knowledge-river') THEN
      PERFORM cron.schedule(
        'weekly-knowledge-river',
        '0 7 * * 1',
        'SELECT public.post_weekly_knowledge_to_river();'
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'knowledge-gap-retention') THEN
      PERFORM cron.schedule(
        'knowledge-gap-retention',
        '30 4 * * 1',
        'DELETE FROM public.knowledge_gap_log WHERE asked_at < now() - interval ''30 days'';'
      );
    END IF;
  END IF;
END;
$do$;

NOTIFY pgrst, 'reload schema';
