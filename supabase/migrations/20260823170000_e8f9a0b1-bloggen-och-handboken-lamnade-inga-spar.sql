-- ============================================================================
-- BLOGGEN OCH HANDBOKEN LÄMNADE INGA SPÅR
-- ============================================================================
--
-- Innehållstabellernas raderingsskydd, uppmätt på en levande instans:
--
--   pages              mjuk radering (deleted_at) + page_versions      räddningsbar
--   wiki_pages         HÅRD radering, wiki_page_revisions              räddningsbar
--   kb_articles        HÅRD radering, kb_article_revisions             räddningsbar
--   docs_pages         HÅRD radering, docs_page_versions               räddningsbar
--   documents          HÅRD radering, document_versions                räddningsbar
--   blog_posts         HÅRD radering, INGEN historik                   FÖRLORAD
--   handbook_chapters  HÅRD radering, INGEN historik                   FÖRLORAD
--
-- Blogg och handbok var alltså de enda två genuint oåterkalleliga innehålls-
-- ytorna — och de två där en oavsiktlig radering kostar mest (ett publicerat
-- inlägg har utgående länkar; ett handbokskapitel är intern policy). En
-- papperskorg kan inte omfatta det som inte lämnar spår, så historiken måste
-- finnas FÖRE ytan som visar den.
--
-- ── VARFÖR NYCKELN INTE ÄR EN FRÄMMANDE NYCKEL ──────────────────────────────
-- `wiki_page_revisions` nycklas på `slug`, `kb_article_revisions` på
-- `article_id` + `slug` — i BÅDA fallen som vanliga kolumner, UTAN FK-villkor.
-- Det är inte slarv, det är hela poängen: ett FK till förälderraden hade tvingat
-- fram antingen ON DELETE CASCADE (revisionerna dör med raden — exakt det vi
-- försöker undvika) eller ON DELETE RESTRICT (raden går inte att radera alls).
-- En revision är ett historiskt PÅSTÅENDE om en rad som fanns, inte ett barn
-- till en rad som finns. `post_id` och `chapter_id` nedan är därför nakna
-- uuid-kolumner. Den som senare "städar upp saknade FK" river papperskorgen.
--
-- ── VAD SOM KOPIERADES ──────────────────────────────────────────────────────
-- Formen är wiki/KB-mönstret, kolumn för kolumn, så att en papperskorgsyta kan
-- läsa alla källor likadant:
--   id, <entitet>_id, slug, title, <kropp>, revision_no, action, edited_by,
--   revised_at  + index på (identitet, revision_no DESC)
--   BEFORE UPDATE OR DELETE-trigger som skriver OLD (tillståndet FÖRE ändringen)
--   och sätter action = lower(TG_OP) → 'update' | 'delete'
--   <entitet>_history(p_action, …) RETURNS jsonb med list | get | restore,
--   där restore ÅTERSKAPAR raden om den är borta.
--
-- ── VAD SOM MEDVETET AVVIKER ────────────────────────────────────────────────
-- 1. VAKTEN ÄR MATRISEN, inte en rollista. wiki_page_history skrevs före
--    matrisen och bär `has_role(uid,'admin')`; 20260821010000 gjorde
--    `auth.role()='service_role' OR can_access_module(auth.uid(),'<modul>')`
--    till husets vakt, och 20260817220000 flyttade redan blog_posts skrivningar
--    dit. Historiken följer sin tabell: 'blog' respektive 'handbook'.
--    can_access_module är sann för admin, så admin förlorar ingenting.
-- 2. REVOKE + explicit GRANT. ALTER DEFAULT PRIVILEGES (20260822020000)
--    återkallar EXECUTE från PUBLIC för NYA funktioner på fleeten, men en
--    instans som ännu inte fått den migrationen föder funktionen anon-körbar.
--    Därför står REVOKE i klartext här, inte som ett antagande om grannen.
-- 3. `action = 'baseline'` för seedade rader (se nedan). Ny etikett, additiv:
--    en papperskorg filtrerar på 'delete' och rör inte 'baseline'.
-- 4. `status` lagras som text, inte som page_status. En revision ska överleva
--    att någon senare ändrar enum:en; och restore skriver ändå aldrig tillbaka
--    status (se nedan), så typen bär bara proveniens.
--
-- ── ÅTERSKAPANDE SKRIVER ALDRIG TILLBAKA PUBLICERINGSLÄGET ──────────────────
-- kb_article_history återskapar en raderad artikel med is_published = false.
-- Samma val här: ett återskapat blogginlägg föds som draft med published_at
-- NULL. Att en papperskorgsknapp tyst kan publicera om ett inlägg på en publik
-- URL är en effekt ingen bad om. Uppdateringsgrenen (raden finns kvar) rör
-- INTE status alls — den skriver bara tillbaka title/excerpt/kropp/bild/meta.
--
-- ── SEEDAD BASLINJE FÖR BEFINTLIGT INNEHÅLL ─────────────────────────────────
-- Triggern fångar varje radering FRÅN OCH MED nu, även för rader som aldrig
-- redigerats — så själva räddningsbarheten kräver ingen seed. Seeden görs ändå,
-- av tre skäl, och den är billig (en rad per befintligt inlägg/kapitel; ett
-- färskt instansbestånd är ensiffrigt till tvåsiffrigt, en mogen blogg
-- tresiffrigt):
--   * en papperskorgs-/historikyta har något att visa för orört innehåll i
--     stället för en tom lista som inte går att skilja från en trasig trigger,
--   * TRUNCATE och ALTER TABLE … DISABLE TRIGGER fyrar inte radtriggers —
--     baslinjen är det enda som överlever dem,
--   * revision_no 1 blir ett ankare ("så såg det ut när historiken slogs på").
-- Seeden är NOT EXISTS-vaktad, så en andra körning skriver noll rader, och
-- revised_at sätts till radens updated_at — inte now() — eftersom det är den
-- tidpunkt tillståndet faktiskt gällde. edited_by ärvs från updated_by där den
-- finns; handbook_chapters har ingen sådan kolumn och får NULL (synkroniseringen
-- körs av service-nyckeln, ingen människa).
--
-- ── REPRODUKTIONSRECEPT ─────────────────────────────────────────────────────
-- Mot lokal Postgres. Beviset som räknas är rad 4: revisionen finns kvar EFTER
-- att raden är borta.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres <<'SQL'
--   BEGIN;
--   -- 1. skapa
--   INSERT INTO public.blog_posts (slug, title, excerpt, content_json, status)
--   VALUES ('trash-probe', 'Trash probe', 'v1', '[{"t":1}]'::jsonb, 'published')
--   RETURNING id \gset
--   SELECT count(*) FROM public.blog_post_revisions WHERE post_id = :'id';
--   -- expect: 0  (INSERT fångas inte — revisionen är tillståndet FÖRE en ändring)
--
--   -- 2. uppdatera → revisionen bär det GAMLA tillståndet
--   UPDATE public.blog_posts SET title = 'Trash probe v2', excerpt = 'v2'
--    WHERE id = :'id';
--   SELECT revision_no, action, title, excerpt FROM public.blog_post_revisions
--    WHERE post_id = :'id';
--   -- expect: 1 | update | Trash probe | v1
--
--   -- 3. metadataändring ska INTE ge revision
--   UPDATE public.blog_posts SET reading_time_minutes = 4 WHERE id = :'id';
--   SELECT count(*) FROM public.blog_post_revisions WHERE post_id = :'id';
--   -- expect: 1  (oförändrat)
--
--   -- 4. radera → revisionen ÖVERLEVER raden. Detta är hela poängen.
--   DELETE FROM public.blog_posts WHERE id = :'id';
--   SELECT count(*) FROM public.blog_posts WHERE id = :'id';           -- expect 0
--   SELECT revision_no, action, title FROM public.blog_post_revisions
--    WHERE post_id = :'id' ORDER BY revision_no;
--   -- expect: 1|update|Trash probe   2|delete|Trash probe v2
--
--   -- 5. restore återskapar den raderade raden, som draft
--   SELECT id FROM public.blog_post_revisions
--    WHERE post_id = :'id' AND action = 'delete' \gset rev_
--   SET LOCAL "fixture.role" = 'service_role';   -- eller: logga in som admin
--   SELECT public.blog_post_history('restore', p_revision_id := :'rev_id');
--   SELECT slug, title, status, published_at FROM public.blog_posts WHERE id = :'id';
--   -- expect: trash-probe | Trash probe v2 | draft | NULL
--
--   -- 6. anon kommer inte åt historiken
--   SET LOCAL ROLE anon;
--   SELECT public.blog_post_history('list', p_slug := 'trash-probe');
--   -- expect: ERROR: permission denied for function blog_post_history
--   RESET ROLE;
--   ROLLBACK;
--   SQL
--
-- Samma sekvens gäller handbook_chapters / handbook_chapter_revisions /
-- handbook_chapter_history, med (repo_owner, repo_name, file_path) som
-- obligatoriska fält vid skapandet.
--
-- Idempotens, så filen verifierades före commit:
--   psql -v ON_ERROR_STOP=1 … -c 'BEGIN' -f <denna fil> -f <denna fil> -c 'ROLLBACK'
--
-- Framåtdaterad med flit: en managerad instans migrate-runner applicerar från
-- sin egen ledger-HEAD och HOPPAR TYST över allt med lägre tidsstämpel.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BLOGG: revisionstabell
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blog_post_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,                      -- avsiktligt UTAN FK, se huvudet
  slug text NOT NULL,
  title text NOT NULL,
  excerpt text,
  content_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  featured_image text,
  featured_image_alt text,
  author_id uuid,
  status text,                                -- proveniens; page_status som text
  published_at timestamptz,
  meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_featured boolean,
  revision_no integer NOT NULL,
  action text NOT NULL DEFAULT 'update',
  edited_by uuid,
  revised_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blog_post_revisions_post_idx
  ON public.blog_post_revisions (post_id, revision_no DESC);
CREATE INDEX IF NOT EXISTS blog_post_revisions_slug_idx
  ON public.blog_post_revisions (slug, revision_no DESC);
CREATE INDEX IF NOT EXISTS blog_post_revisions_deleted_idx
  ON public.blog_post_revisions (revised_at DESC) WHERE action = 'delete';

ALTER TABLE public.blog_post_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Blog revisions readable by its module roles" ON public.blog_post_revisions;
CREATE POLICY "Blog revisions readable by its module roles" ON public.blog_post_revisions
  FOR SELECT TO authenticated
  USING (can_access_module(auth.uid(), 'blog'::text));
-- Inga skrivpolicies: enda skrivaren är SECURITY DEFINER-triggern nedan.

CREATE OR REPLACE FUNCTION public.log_blog_post_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.title              IS NOT DISTINCT FROM NEW.title
     AND OLD.slug               IS NOT DISTINCT FROM NEW.slug
     AND OLD.excerpt            IS NOT DISTINCT FROM NEW.excerpt
     AND OLD.content_json       IS NOT DISTINCT FROM NEW.content_json
     AND OLD.featured_image     IS NOT DISTINCT FROM NEW.featured_image
     AND OLD.featured_image_alt IS NOT DISTINCT FROM NEW.featured_image_alt
     AND OLD.meta_json          IS NOT DISTINCT FROM NEW.meta_json THEN
    -- Metadataändring (status/publiceringsdatum/lästid/granskare/is_featured):
    -- ingen revision. Samma avgränsning som log_kb_article_revision gör för
    -- vy- och feedbackräknare — en publiceringsflagga är inte en textändring,
    -- och en full kroppskopia per publicering är ren volym utan innehåll.
    RETURN NEW;
  END IF;
  INSERT INTO public.blog_post_revisions
    (post_id, slug, title, excerpt, content_json, featured_image, featured_image_alt,
     author_id, status, published_at, meta_json, is_featured,
     revision_no, action, edited_by)
  VALUES (OLD.id, OLD.slug, OLD.title, OLD.excerpt,
          COALESCE(OLD.content_json, '[]'::jsonb),
          OLD.featured_image, OLD.featured_image_alt, OLD.author_id,
          OLD.status::text, OLD.published_at,
          COALESCE(OLD.meta_json, '{}'::jsonb), OLD.is_featured,
          (SELECT COALESCE(MAX(revision_no), 0) + 1
             FROM public.blog_post_revisions WHERE post_id = OLD.id),
          lower(TG_OP), auth.uid());
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_blog_posts_revision ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_revision
  BEFORE UPDATE OR DELETE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.log_blog_post_revision();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. HANDBOK: revisionstabell
-- ─────────────────────────────────────────────────────────────────────────────
-- handbook_chapters speglar ett GitHub-repo och identifieras av
-- (repo_owner, repo_name, file_path) — de tre måste följa med i revisionen,
-- annars går ett kapitel inte att återskapa. Synkroniseringen hoppar över
-- oförändrade filer (sha-jämförelse) och raderar dem som försvunnit ur repot,
-- så en synk ger revisioner bara för det som faktiskt ändrats eller tagits bort.
CREATE TABLE IF NOT EXISTS public.handbook_chapter_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL,                   -- avsiktligt UTAN FK, se huvudet
  slug text NOT NULL,
  title text NOT NULL,
  content_md text NOT NULL DEFAULT ''::text,
  repo_owner text NOT NULL,
  repo_name text NOT NULL,
  file_path text NOT NULL,
  sort_order real NOT NULL DEFAULT 0,
  frontmatter jsonb NOT NULL DEFAULT '{}'::jsonb,
  sha text NOT NULL DEFAULT ''::text,
  revision_no integer NOT NULL,
  action text NOT NULL DEFAULT 'update',
  edited_by uuid,
  revised_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS handbook_chapter_revisions_chapter_idx
  ON public.handbook_chapter_revisions (chapter_id, revision_no DESC);
CREATE INDEX IF NOT EXISTS handbook_chapter_revisions_slug_idx
  ON public.handbook_chapter_revisions (slug, revision_no DESC);
CREATE INDEX IF NOT EXISTS handbook_chapter_revisions_deleted_idx
  ON public.handbook_chapter_revisions (revised_at DESC) WHERE action = 'delete';

ALTER TABLE public.handbook_chapter_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Handbook revisions readable by its module roles"
  ON public.handbook_chapter_revisions;
CREATE POLICY "Handbook revisions readable by its module roles"
  ON public.handbook_chapter_revisions
  FOR SELECT TO authenticated
  USING (can_access_module(auth.uid(), 'handbook'::text));

CREATE OR REPLACE FUNCTION public.log_handbook_chapter_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.title       IS NOT DISTINCT FROM NEW.title
     AND OLD.slug        IS NOT DISTINCT FROM NEW.slug
     AND OLD.content     IS NOT DISTINCT FROM NEW.content
     AND OLD.frontmatter IS NOT DISTINCT FROM NEW.frontmatter
     AND OLD.sort_order  IS NOT DISTINCT FROM NEW.sort_order
     AND OLD.file_path   IS NOT DISTINCT FROM NEW.file_path THEN
    -- Bara sha/synced_at/updated_at rörde sig: repot skrev om bloben utan att
    -- innehållet ändrades. Ingen revision.
    RETURN NEW;
  END IF;
  INSERT INTO public.handbook_chapter_revisions
    (chapter_id, slug, title, content_md, repo_owner, repo_name, file_path,
     sort_order, frontmatter, sha, revision_no, action, edited_by)
  VALUES (OLD.id, OLD.slug, OLD.title, OLD.content, OLD.repo_owner, OLD.repo_name,
          OLD.file_path, OLD.sort_order, OLD.frontmatter, OLD.sha,
          (SELECT COALESCE(MAX(revision_no), 0) + 1
             FROM public.handbook_chapter_revisions WHERE chapter_id = OLD.id),
          lower(TG_OP), auth.uid());
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_handbook_chapters_revision ON public.handbook_chapters;
CREATE TRIGGER trg_handbook_chapters_revision
  BEFORE UPDATE OR DELETE ON public.handbook_chapters
  FOR EACH ROW EXECUTE FUNCTION public.log_handbook_chapter_revision();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. BASLINJE FÖR BEFINTLIGT INNEHÅLL (NOT EXISTS-vaktad → omkörbar)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.blog_post_revisions
  (post_id, slug, title, excerpt, content_json, featured_image, featured_image_alt,
   author_id, status, published_at, meta_json, is_featured,
   revision_no, action, edited_by, revised_at)
SELECT p.id, p.slug, p.title, p.excerpt,
       COALESCE(p.content_json, '[]'::jsonb),
       p.featured_image, p.featured_image_alt, p.author_id,
       p.status::text, p.published_at,
       COALESCE(p.meta_json, '{}'::jsonb), p.is_featured,
       1, 'baseline', p.updated_by, p.updated_at
FROM public.blog_posts p
WHERE NOT EXISTS (
  SELECT 1 FROM public.blog_post_revisions r WHERE r.post_id = p.id
);

INSERT INTO public.handbook_chapter_revisions
  (chapter_id, slug, title, content_md, repo_owner, repo_name, file_path,
   sort_order, frontmatter, sha, revision_no, action, edited_by, revised_at)
SELECT c.id, c.slug, c.title, c.content, c.repo_owner, c.repo_name, c.file_path,
       c.sort_order, c.frontmatter, c.sha,
       1, 'baseline', NULL, c.updated_at
FROM public.handbook_chapters c
WHERE NOT EXISTS (
  SELECT 1 FROM public.handbook_chapter_revisions r WHERE r.chapter_id = c.id
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. HISTORIK-RPC: blog_post_history (list | get | restore)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.blog_post_history(
  p_action text,
  p_slug text DEFAULT NULL,
  p_post_id uuid DEFAULT NULL,
  p_revision_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rev public.blog_post_revisions;
  v_rows jsonb;
  v_owner uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'blog')) THEN
    RAISE EXCEPTION 'Not authorized to access blog post history';
  END IF;

  IF p_action = 'list' THEN
    IF p_slug IS NULL AND p_post_id IS NULL THEN
      RAISE EXCEPTION 'list requires p_slug or p_post_id';
    END IF;
    SELECT COALESCE(jsonb_agg(r ORDER BY r.revision_no DESC), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT id, post_id, slug, title, excerpt, status, revision_no, action,
             edited_by, revised_at,
             length(COALESCE(content_json::text, '')) AS content_length
      FROM public.blog_post_revisions
      WHERE (p_post_id IS NOT NULL AND post_id = p_post_id)
         OR (p_post_id IS NULL AND slug = p_slug)
      ORDER BY revision_no DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    ) r;
    RETURN jsonb_build_object('success', true, 'revisions', v_rows);

  ELSIF p_action = 'get' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'get requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.blog_post_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;
    RETURN jsonb_build_object('success', true, 'revision', to_jsonb(v_rev));

  ELSIF p_action = 'restore' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'restore requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.blog_post_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;

    -- Raden finns kvar: skriv tillbaka innehållet. status/published_at rörs
    -- inte — ett återställt utkast ska inte kunna publicera sig självt, och ett
    -- publicerat inlägg ska inte avpubliceras av en textåterställning.
    UPDATE public.blog_posts
       SET title = v_rev.title,
           excerpt = v_rev.excerpt,
           content_json = v_rev.content_json,
           featured_image = v_rev.featured_image,
           featured_image_alt = v_rev.featured_image_alt,
           meta_json = v_rev.meta_json,
           updated_at = now(),
           updated_by = auth.uid()
     WHERE id = v_rev.post_id;

    IF NOT FOUND THEN
      -- Raden är borta — återskapa den. Slug är en publik identitet: om någon
      -- annan hunnit ta den ska felet vara begripligt, inte en rå unique-krock.
      SELECT id INTO v_owner FROM public.blog_posts WHERE slug = v_rev.slug;
      IF v_owner IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot recreate post: slug % is already taken by post %',
          v_rev.slug, v_owner;
      END IF;
      INSERT INTO public.blog_posts
        (id, slug, title, excerpt, content_json, featured_image, featured_image_alt,
         author_id, status, published_at, meta_json, is_featured, created_by, updated_by)
      VALUES (v_rev.post_id, v_rev.slug, v_rev.title, v_rev.excerpt, v_rev.content_json,
              v_rev.featured_image, v_rev.featured_image_alt, v_rev.author_id,
              'draft'::public.page_status, NULL,
              v_rev.meta_json, COALESCE(v_rev.is_featured, false),
              auth.uid(), auth.uid());
      RETURN jsonb_build_object('success', true, 'post_id', v_rev.post_id,
        'slug', v_rev.slug, 'restored_revision_no', v_rev.revision_no,
        'recreated', true, 'status', 'draft');
    END IF;

    RETURN jsonb_build_object('success', true, 'post_id', v_rev.post_id,
      'slug', v_rev.slug, 'restored_revision_no', v_rev.revision_no,
      'recreated', false);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use list|get|restore', p_action;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.blog_post_history(text, text, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blog_post_history(text, text, uuid, uuid, integer)
  TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. HISTORIK-RPC: handbook_chapter_history (list | get | restore)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handbook_chapter_history(
  p_action text,
  p_slug text DEFAULT NULL,
  p_chapter_id uuid DEFAULT NULL,
  p_revision_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rev public.handbook_chapter_revisions;
  v_rows jsonb;
  v_owner uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'handbook')) THEN
    RAISE EXCEPTION 'Not authorized to access handbook chapter history';
  END IF;

  IF p_action = 'list' THEN
    IF p_slug IS NULL AND p_chapter_id IS NULL THEN
      RAISE EXCEPTION 'list requires p_slug or p_chapter_id';
    END IF;
    SELECT COALESCE(jsonb_agg(r ORDER BY r.revision_no DESC), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT id, chapter_id, slug, title, repo_owner, repo_name, file_path,
             revision_no, action, edited_by, revised_at,
             length(COALESCE(content_md, '')) AS content_length
      FROM public.handbook_chapter_revisions
      WHERE (p_chapter_id IS NOT NULL AND chapter_id = p_chapter_id)
         OR (p_chapter_id IS NULL AND slug = p_slug)
      ORDER BY revision_no DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    ) r;
    RETURN jsonb_build_object('success', true, 'revisions', v_rows);

  ELSIF p_action = 'get' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'get requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.handbook_chapter_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;
    RETURN jsonb_build_object('success', true, 'revision', to_jsonb(v_rev));

  ELSIF p_action = 'restore' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'restore requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.handbook_chapter_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;

    UPDATE public.handbook_chapters
       SET title = v_rev.title,
           slug = v_rev.slug,
           content = v_rev.content_md,
           frontmatter = v_rev.frontmatter,
           sort_order = v_rev.sort_order,
           sha = v_rev.sha,
           updated_at = now()
     WHERE id = v_rev.chapter_id;

    IF NOT FOUND THEN
      SELECT id INTO v_owner FROM public.handbook_chapters
       WHERE repo_owner = v_rev.repo_owner AND repo_name = v_rev.repo_name
         AND file_path = v_rev.file_path;
      IF v_owner IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot recreate chapter: %/% % is already held by chapter %',
          v_rev.repo_owner, v_rev.repo_name, v_rev.file_path, v_owner;
      END IF;
      INSERT INTO public.handbook_chapters
        (id, repo_owner, repo_name, file_path, title, slug, sort_order,
         frontmatter, content, sha)
      VALUES (v_rev.chapter_id, v_rev.repo_owner, v_rev.repo_name, v_rev.file_path,
              v_rev.title, v_rev.slug, v_rev.sort_order, v_rev.frontmatter,
              v_rev.content_md, v_rev.sha);
      RETURN jsonb_build_object('success', true, 'chapter_id', v_rev.chapter_id,
        'slug', v_rev.slug, 'restored_revision_no', v_rev.revision_no,
        'recreated', true);
    END IF;

    RETURN jsonb_build_object('success', true, 'chapter_id', v_rev.chapter_id,
      'slug', v_rev.slug, 'restored_revision_no', v_rev.revision_no,
      'recreated', false);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use list|get|restore', p_action;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handbook_chapter_history(text, text, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handbook_chapter_history(text, text, uuid, uuid, integer)
  TO authenticated, service_role;

-- Triggerfunktionerna är SECURITY DEFINER och ska aldrig kunna anropas direkt.
REVOKE EXECUTE ON FUNCTION public.log_blog_post_revision() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_handbook_chapter_revision() FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. EN REVISIONSTABELL ÄR APPEND-ONLY, OCH BARA TRIGGERN SKRIVER
-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase föder nya tabeller med grants till anon/authenticated. 20260822010000
-- drog skrivverben ur DEFAULT PRIVILEGES, men en instans som inte fått den
-- migrationen föder tabellen skrivbar — och en papperskorg vars bevis går att
-- redigera är inget bevis. SELECT lämnas kvar och regleras av RLS ovan (anon
-- har ingen policy → noll rader). Triggern är SECURITY DEFINER och påverkas
-- inte av att rollerna saknar INSERT.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.blog_post_revisions
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.handbook_chapter_revisions
  FROM anon, authenticated;
