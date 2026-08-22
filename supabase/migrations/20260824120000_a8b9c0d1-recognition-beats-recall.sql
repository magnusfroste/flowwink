-- ============================================================================
-- Recognition beats recall — one trash bin across the content modules.
-- ============================================================================
--
-- Revision history already lets you undo a deletion. It just asks the one
-- question you cannot answer: WHAT WAS IT CALLED. `wiki_page_history` takes a
-- slug; `kb_article_history` takes a revision id. When something is gone you
-- usually remember roughly what it SAID, not its identifier — and often not
-- even which module it lived in ("was that the wiki or the KB?"). So the
-- recall problem repeats one level up, and a per-module trash would inherit it.
--
-- This adds NO new storage and NO new deletion path. Everything below reads
-- traces that deletion already leaves behind:
--
--   pages        soft delete (deleted_at) — the row itself survives
--   wiki_pages   trg_wiki_pages_revision fires BEFORE DELETE and writes a
--                wiki_page_revisions row with action='delete'. The revision
--                table has NO foreign key to wiki_pages, so it survives.
--   kb_articles  same shape via trg_kb_articles_revision → kb_article_revisions.
--
-- The common shape all three share, and the only thing this feature needs:
--
--   an identity · a title · a text preview · a timestamp · an actor
--   · a way to tell "still deleted" from "already back"
--
-- That shape is described in a REGISTRY TABLE (public.trash_sources), not in
-- code. Adding blog_posts or handbook_chapters to the trash is one INSERT once
-- those tables have a revision trail; nothing here branches on a content type.
--
-- TWO SOURCES DELIBERATELY LEFT OUT (they cannot work, and pretending
-- otherwise would be worse than the gap):
--
--   docs_pages   docs_page_versions.docs_page_id REFERENCES docs_pages(id)
--                ON DELETE CASCADE — the versions die WITH the page. There is
--                no trace to list. (manage_docs_page 'delete' hard-DELETEs.)
--   documents    document_versions.document_id likewise ON DELETE CASCADE, and
--                the version row stores a file_url, not text — so even if it
--                survived there would be nothing to recognise it by.
--
-- Both need a retention decision of their own (soft delete, or dropping the
-- cascade) before they can appear here. Reported, not papered over.
--
-- ============================================================================

-- ── 1. The registry: sources are data ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trash_sources (
  source_key             text PRIMARY KEY,
  label                  text NOT NULL,
  -- Gate. The bin spans modules, so every row it shows must earn its place
  -- through the same dial everything else uses: can_access_module().
  module_key             text NOT NULL,
  -- 'revision'    the live row is hard-deleted; a revision row marked
  --               deleted_marker_value survives and IS the trash entry.
  -- 'soft_delete' the live row survives carrying a deleted-at stamp.
  kind                   text NOT NULL CHECK (kind IN ('revision', 'soft_delete')),
  history_table          text NOT NULL,
  identity_column        text NOT NULL,
  title_column           text NOT NULL,
  subtitle_column        text,
  preview_column         text NOT NULL,
  preview_fallback_column text,
  -- 'text' | 'jsonb' — how to turn preview_column into something readable.
  preview_kind           text NOT NULL DEFAULT 'text'
                           CHECK (preview_kind IN ('text', 'jsonb')),
  deleted_at_column      text NOT NULL,
  deleted_by_column      text,
  -- revision kind only: where a live row would be, and how it is keyed.
  live_table             text,
  live_identity_column   text,
  deleted_marker_column  text NOT NULL DEFAULT 'action',
  deleted_marker_value   text NOT NULL DEFAULT 'delete',
  -- Restore delegates to the module's OWN history RPC — there is exactly one
  -- restore implementation per content type and it is not this one.
  -- Called as fn(p_action => 'restore', p_revision_id => …).
  restore_rpc            text,
  -- Mirrors the gate the restore_rpc actually enforces, so the UI can grey out
  -- a button that would fail instead of offering it. Pinned by a guardrail
  -- test against the RPC body, because two copies of a truth drift.
  restore_requires_admin boolean NOT NULL DEFAULT false,
  sort_order             integer NOT NULL DEFAULT 100,
  enabled                boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- A revision source without somewhere live to look cannot answer
  -- "is this still deleted?", which is the only question the bin asks.
  CONSTRAINT trash_sources_revision_needs_live CHECK (
    kind <> 'revision' OR (live_table IS NOT NULL AND live_identity_column IS NOT NULL))
);

COMMENT ON TABLE public.trash_sources IS
  'Registry of deletion traces the unified trash reads. Adding a content type '
  'is an INSERT here, not a code change. A revision source must expose an "id" '
  'primary key — it is what restore_rpc is called with. Identifiers from these '
  'rows are interpolated into dynamic SQL with %I quoting, so writes are '
  'service_role only.';

ALTER TABLE public.trash_sources ENABLE ROW LEVEL SECURITY;

-- Readable by signed-in staff (the shape is not secret; the CONTENT is gated
-- per row by can_access_module inside trash_bin). Writable by nobody but the
-- service role: these strings become SQL identifiers.
DROP POLICY IF EXISTS "trash_sources readable" ON public.trash_sources;
CREATE POLICY "trash_sources readable" ON public.trash_sources
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON TABLE public.trash_sources FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.trash_sources TO authenticated;
GRANT ALL ON TABLE public.trash_sources TO service_role;

-- ── 2. Seed the three sources that actually leave a trace ────────────────────
-- Upsert-by-key so a redeploy re-asserts the shape, but an operator who
-- disabled a source keeps that choice (enabled is not overwritten).
INSERT INTO public.trash_sources (
  source_key, label, module_key, kind,
  history_table, identity_column, title_column, subtitle_column,
  preview_column, preview_fallback_column, preview_kind,
  deleted_at_column, deleted_by_column,
  live_table, live_identity_column,
  restore_rpc, restore_requires_admin, sort_order
) VALUES
  -- pages: already correct. Soft delete + a permanent purge whose CASCADE
  -- takes page_versions with it. Integrated, not rebuilt.
  ('pages', 'Page', 'pages', 'soft_delete',
   'pages', 'id', 'title', 'slug',
   'content_json', NULL, 'jsonb',
   'deleted_at', 'deleted_by',
   NULL, NULL,
   NULL, false, 10),

  ('wiki', 'Wiki page', 'wiki', 'revision',
   'wiki_page_revisions', 'slug', 'title', 'slug',
   'content_md', NULL, 'text',
   'revised_at', 'edited_by',
   'wiki_pages', 'slug',
   'wiki_page_history', false, 20),

  -- kb: keyed on article_id, not slug — a slug can be edited, the id cannot,
  -- and restore recreates the article under its original id.
  ('kb', 'KB article', 'knowledgeBase', 'revision',
   'kb_article_revisions', 'article_id', 'title', 'slug',
   'answer_text', 'question', 'text',
   'revised_at', 'edited_by',
   'kb_articles', 'id',
   'kb_article_history', true, 30)
ON CONFLICT (source_key) DO UPDATE SET
  label                   = EXCLUDED.label,
  module_key              = EXCLUDED.module_key,
  kind                    = EXCLUDED.kind,
  history_table           = EXCLUDED.history_table,
  identity_column         = EXCLUDED.identity_column,
  title_column            = EXCLUDED.title_column,
  subtitle_column         = EXCLUDED.subtitle_column,
  preview_column          = EXCLUDED.preview_column,
  preview_fallback_column = EXCLUDED.preview_fallback_column,
  preview_kind            = EXCLUDED.preview_kind,
  deleted_at_column       = EXCLUDED.deleted_at_column,
  deleted_by_column       = EXCLUDED.deleted_by_column,
  live_table              = EXCLUDED.live_table,
  live_identity_column    = EXCLUDED.live_identity_column,
  restore_rpc             = EXCLUDED.restore_rpc,
  restore_requires_admin  = EXCLUDED.restore_requires_admin,
  sort_order              = EXCLUDED.sort_order;

-- Blog and handbook are getting the same trail in a parallel change
-- (20260823170000). Their revision tables land in exactly this shape —
-- <entity>_id · slug · title · body · action · edited_by · revised_at — and
-- their history RPCs take (p_action, p_revision_id) and gate on
-- can_access_module. So the whole integration is one row each, and it belongs
-- with THAT change, not this one:
--
--   INSERT INTO public.trash_sources (source_key, label, module_key, kind,
--     history_table, identity_column, title_column, subtitle_column,
--     preview_column, preview_fallback_column, preview_kind,
--     deleted_at_column, deleted_by_column,
--     live_table, live_identity_column, restore_rpc, sort_order)
--   VALUES
--     ('blog', 'Blog post', 'blog', 'revision',
--      'blog_post_revisions', 'post_id', 'title', 'slug',
--      'content_json', 'excerpt', 'jsonb', 'revised_at', 'edited_by',
--      'blog_posts', 'id', 'blog_post_history', 40),
--     ('handbook', 'Handbook chapter', 'handbook', 'revision',
--      'handbook_chapter_revisions', 'chapter_id', 'title', 'slug',
--      'content_md', NULL, 'text', 'revised_at', 'edited_by',
--      'handbook_chapters', 'id', 'handbook_chapter_history', 50)
--   ON CONFLICT (source_key) DO NOTHING;
--
-- No code below needs to know either type exists.

-- ── 3. Preview extraction for block content ─────────────────────────────────
-- A page's body is ContentBlock[] in jsonb. The trash needs the human words
-- out of it — not the block types, ids, class names or URLs, which are the
-- majority of the strings in there and would drown the sentence you are
-- trying to recognise.
CREATE OR REPLACE FUNCTION public.trash_text_from_jsonb(p_data jsonb, p_max integer DEFAULT 400)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT left(
           btrim(regexp_replace(COALESCE(string_agg(val, ' '), ''), '\s+', ' ', 'g')),
           GREATEST(COALESCE(p_max, 400), 1))
  FROM (
    SELECT kv.value #>> '{}' AS val
    FROM jsonb_path_query(COALESCE(p_data, '{}'::jsonb), '$.**') AS node,
         LATERAL jsonb_each(
           CASE WHEN jsonb_typeof(node) = 'object' THEN node ELSE '{}'::jsonb END) AS kv
    WHERE jsonb_typeof(kv.value) = 'string'
      AND kv.key NOT IN ('type', 'id', 'blockId', 'icon', 'variant', 'align',
                         'color', 'bg', 'background', 'image', 'imageUrl',
                         'url', 'href', 'src', 'className', 'size', 'layout',
                         'style', 'locale', 'format', 'target')
      AND length(kv.value #>> '{}') > 2
      AND (kv.value #>> '{}') !~ '^[0-9a-fA-F-]{16,}$'
      AND (kv.value #>> '{}') !~ '^(https?:|/|#|data:)'
  ) t;
$fn$;

REVOKE EXECUTE ON FUNCTION public.trash_text_from_jsonb(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trash_text_from_jsonb(jsonb, integer) TO authenticated, service_role;

-- ── 4. The bin ──────────────────────────────────────────────────────────────
-- Actions:
--   sources  what this caller may see at all (drives the UI's filter chips)
--   list     merged, newest first, with a text preview — the whole point
--   restore  delegate to the module's own history RPC / un-stamp a soft delete
--   purge    permanently remove, REVISIONS INCLUDED (see §4c)
CREATE OR REPLACE FUNCTION public.trash_bin(
  p_action      text    DEFAULT 'list',
  p_source      text    DEFAULT NULL,
  p_key         text    DEFAULT NULL,
  p_revision_id uuid    DEFAULT NULL,
  p_limit       integer DEFAULT 100,
  p_search      text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_is_service boolean := (auth.role() = 'service_role');
  v_uid        uuid    := auth.uid();
  v_is_admin   boolean;
  v_src        public.trash_sources;
  v_parts      text[]  := ARRAY[]::text[];
  v_preview    text;
  v_sources    jsonb   := '[]'::jsonb;
  v_rows       jsonb;
  v_sql        text;
  v_live       boolean;
  v_removed    bigint;
  v_left       bigint;
  v_title      text;
  v_entity     uuid;
  v_res        jsonb;
BEGIN
  -- Internal guard. EXECUTE is revoked from PUBLIC/anon below, but a function
  -- must never rely on grants alone.
  IF NOT v_is_service AND v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  v_is_admin := v_is_service OR public.has_role(v_uid, 'admin'::public.app_role);

  -- ---- 4a. list / sources -------------------------------------------------
  IF p_action IN ('list', 'sources') THEN
    FOR v_src IN
      SELECT * FROM public.trash_sources WHERE enabled ORDER BY sort_order, source_key
    LOOP
      -- The matrix decides, per source. A user without the KB module never
      -- learns that a KB article was deleted.
      CONTINUE WHEN NOT (v_is_service OR public.can_access_module(v_uid, v_src.module_key));
      -- A registry row may name a table this instance does not have yet
      -- (a module added later, a source registered ahead of its migration).
      CONTINUE WHEN to_regclass('public.' || quote_ident(v_src.history_table)) IS NULL;
      CONTINUE WHEN v_src.live_table IS NOT NULL
                AND to_regclass('public.' || quote_ident(v_src.live_table)) IS NULL;

      v_sources := v_sources || jsonb_build_object(
        'source', v_src.source_key,
        'label', v_src.label,
        'module', v_src.module_key,
        'can_restore', (v_src.restore_requires_admin IS NOT TRUE) OR v_is_admin,
        'can_purge', v_is_admin);

      CONTINUE WHEN p_action = 'sources';
      CONTINUE WHEN p_source IS NOT NULL AND p_source <> v_src.source_key;

      -- Preview expression, built from the registry, never from the type.
      v_preview := CASE v_src.preview_kind
        WHEN 'jsonb' THEN format('public.trash_text_from_jsonb(t.%I, 400)', v_src.preview_column)
        ELSE format('left(btrim(regexp_replace(coalesce(t.%I::text, %L), %L, %L, %L)), 400)',
                    v_src.preview_column, '', '\s+', ' ', 'g')
      END;
      IF v_src.preview_fallback_column IS NOT NULL THEN
        v_preview := format(
          'coalesce(nullif(%s, %L), left(btrim(coalesce(t.%I::text, %L)), 400))',
          v_preview, '', v_src.preview_fallback_column, '');
      END IF;

      IF v_src.kind = 'soft_delete' THEN
        v_parts := v_parts || format($q$(
          SELECT %L::text AS source, %L::text AS label,
                 t.%I::text AS item_key, NULL::uuid AS revision_id,
                 t.%I::text AS title, %s AS subtitle, %s AS preview,
                 t.%I AS deleted_at, %s AS deleted_by
          FROM public.%I t
          WHERE t.%I IS NOT NULL
        )$q$,
          v_src.source_key, v_src.label,
          v_src.identity_column,
          v_src.title_column,
          CASE WHEN v_src.subtitle_column IS NULL THEN 'NULL::text'
               ELSE format('t.%I::text', v_src.subtitle_column) END,
          v_preview,
          v_src.deleted_at_column,
          CASE WHEN v_src.deleted_by_column IS NULL THEN 'NULL::uuid'
               ELSE format('t.%I::uuid', v_src.deleted_by_column) END,
          v_src.history_table,
          v_src.deleted_at_column);

      ELSE
        -- One entry per identity: the NEWEST delete-marked revision, and only
        -- while nothing live carries that identity. Restore a wiki page and it
        -- leaves the bin on its own — no second state to keep in sync.
        v_parts := v_parts || format($q$(
          SELECT DISTINCT ON (t.%I)
                 %L::text AS source, %L::text AS label,
                 t.%I::text AS item_key, t.id AS revision_id,
                 t.%I::text AS title, %s AS subtitle, %s AS preview,
                 t.%I AS deleted_at, %s AS deleted_by
          FROM public.%I t
          WHERE t.%I::text = %L
            AND NOT EXISTS (
              SELECT 1 FROM public.%I l WHERE l.%I::text = t.%I::text)
          ORDER BY t.%I, t.%I DESC, t.id DESC
        )$q$,
          v_src.identity_column,
          v_src.source_key, v_src.label,
          v_src.identity_column,
          v_src.title_column,
          CASE WHEN v_src.subtitle_column IS NULL THEN 'NULL::text'
               ELSE format('t.%I::text', v_src.subtitle_column) END,
          v_preview,
          v_src.deleted_at_column,
          CASE WHEN v_src.deleted_by_column IS NULL THEN 'NULL::uuid'
               ELSE format('t.%I::uuid', v_src.deleted_by_column) END,
          v_src.history_table,
          v_src.deleted_marker_column, v_src.deleted_marker_value,
          v_src.live_table, v_src.live_identity_column, v_src.identity_column,
          v_src.identity_column, v_src.deleted_at_column);
      END IF;
    END LOOP;

    IF p_action = 'sources' THEN
      RETURN jsonb_build_object('success', true, 'sources', v_sources);
    END IF;

    IF array_length(v_parts, 1) IS NULL THEN
      RETURN jsonb_build_object('success', true, 'sources', v_sources, 'items', '[]'::jsonb);
    END IF;

    v_sql := format($q$
      SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.deleted_at DESC), '[]'::jsonb)
      FROM (
        SELECT u.source, u.label, u.item_key, u.revision_id, u.title, u.subtitle,
               u.preview, u.deleted_at, u.deleted_by,
               (SELECT coalesce(nullif(btrim(pr.full_name), ''), pr.email)
                  FROM public.profiles pr WHERE pr.id = u.deleted_by) AS deleted_by_name
        FROM ( %s ) u
        WHERE ($1 IS NULL
               OR u.title ILIKE '%%' || $1 || '%%'
               OR coalesce(u.preview, '') ILIKE '%%' || $1 || '%%'
               OR coalesce(u.subtitle, '') ILIKE '%%' || $1 || '%%')
        ORDER BY u.deleted_at DESC
        LIMIT $2
      ) q
    $q$, array_to_string(v_parts, ' UNION ALL '));

    EXECUTE v_sql INTO v_rows
      USING nullif(btrim(coalesce(p_search, '')), ''),
            LEAST(GREATEST(coalesce(p_limit, 100), 1), 500);

    RETURN jsonb_build_object('success', true, 'sources', v_sources, 'items', coalesce(v_rows, '[]'::jsonb));
  END IF;

  -- ---- shared lookup for the two write actions ----------------------------
  IF p_source IS NULL THEN
    RAISE EXCEPTION 'p_source required for %', p_action;
  END IF;
  SELECT * INTO v_src FROM public.trash_sources WHERE source_key = p_source AND enabled;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown trash source %', p_source;
  END IF;
  IF NOT (v_is_service OR public.can_access_module(v_uid, v_src.module_key)) THEN
    RAISE EXCEPTION 'Requires the % module — an admin can grant it under Users → Role Permissions', v_src.module_key;
  END IF;

  -- ---- 4b. restore --------------------------------------------------------
  IF p_action = 'restore' THEN
    IF v_src.kind = 'soft_delete' THEN
      IF p_key IS NULL THEN RAISE EXCEPTION 'restore requires p_key'; END IF;
      EXECUTE format(
        'UPDATE public.%I SET %I = NULL%s WHERE %I::text = $1 AND %I IS NOT NULL',
        v_src.history_table, v_src.deleted_at_column,
        CASE WHEN v_src.deleted_by_column IS NULL THEN ''
             ELSE format(', %I = NULL', v_src.deleted_by_column) END,
        v_src.identity_column, v_src.deleted_at_column)
        USING p_key;
      GET DIAGNOSTICS v_removed = ROW_COUNT;
      IF v_removed = 0 THEN
        RAISE EXCEPTION 'Nothing to restore for % %', p_source, p_key;
      END IF;
      v_res := jsonb_build_object('success', true, 'source', p_source, 'key', p_key);
    ELSE
      -- Delegate. There is one restore implementation per content type and it
      -- lives with that type — wiki_page_history / kb_article_history already
      -- recreate a page whose live row is gone, and enforce their own gate.
      IF p_revision_id IS NULL THEN RAISE EXCEPTION 'restore requires p_revision_id'; END IF;
      IF v_src.restore_rpc IS NULL THEN
        RAISE EXCEPTION 'Source % declares no restore path', p_source;
      END IF;
      EXECUTE format('SELECT public.%I(p_action => $1, p_revision_id => $2)', v_src.restore_rpc)
        INTO v_res USING 'restore', p_revision_id;
    END IF;

    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
    VALUES ('trash.restore', p_source,
            CASE WHEN p_key ~ '^[0-9a-fA-F]{8}-' THEN p_key::uuid ELSE NULL END,
            v_uid,
            jsonb_build_object('source', p_source, 'key', p_key, 'revision_id', p_revision_id));

    RETURN coalesce(v_res, jsonb_build_object('success', true)) || jsonb_build_object('action', 'restore');
  END IF;

  -- ---- 4c. purge ----------------------------------------------------------
  -- "Empty permanently" has to mean it. A button that only hides the row is
  -- the one you press when something MUST be gone — a wrong figure in a
  -- document, an erasure request — and discovering afterwards that the text is
  -- still sitting in a revision table is the worst possible time to find out.
  -- So purge deletes THE HISTORY, and then reads back to prove it did.
  IF p_action = 'purge' THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Only admins can permanently delete';
    END IF;
    IF p_key IS NULL THEN RAISE EXCEPTION 'purge requires p_key'; END IF;

    -- Never purge something that is alive. For a revision source the history
    -- table also holds the edit trail of the LIVING page, and dropping it
    -- because a stale UI row said "deleted" would be silent data loss.
    IF v_src.kind = 'soft_delete' THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I::text = $1 AND %I IS NULL)',
                     v_src.history_table, v_src.identity_column, v_src.deleted_at_column)
        INTO v_live USING p_key;
    ELSE
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I::text = $1)',
                     v_src.live_table, v_src.live_identity_column)
        INTO v_live USING p_key;
    END IF;
    IF v_live THEN
      RAISE EXCEPTION '% % is live — restore it out of the trash first, or delete it again', v_src.label, p_key;
    END IF;

    EXECUTE format('SELECT %s FROM public.%I WHERE %I::text = $1 LIMIT 1',
                   format('%I::text', v_src.title_column), v_src.history_table, v_src.identity_column)
      INTO v_title USING p_key;

    -- The delete itself. For a revision source this is the whole trail, not
    -- just the row marked 'delete'. For pages it is the live row, whose
    -- page_versions FK is ON DELETE CASCADE.
    EXECUTE format('DELETE FROM public.%I WHERE %I::text = $1',
                   v_src.history_table, v_src.identity_column)
      USING p_key;
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    -- Verify, don't trust. If anything survives the purge we raise, and the
    -- transaction takes the whole thing back rather than reporting a lie.
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text = $1',
                   v_src.history_table, v_src.identity_column)
      INTO v_left USING p_key;
    IF v_left > 0 THEN
      RAISE EXCEPTION 'Purge did not complete: % row(s) of % remain for %', v_left, v_src.history_table, p_key;
    END IF;

    IF v_removed = 0 THEN
      RAISE EXCEPTION 'Nothing to purge for % %', p_source, p_key;
    END IF;

    v_entity := CASE WHEN p_key ~ '^[0-9a-fA-F]{8}-' THEN p_key::uuid ELSE NULL END;
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
    VALUES ('trash.purge', p_source, v_entity, v_uid,
            jsonb_build_object(
              'source', p_source,
              'module', v_src.module_key,
              'key', p_key,
              'title', v_title,
              'table', v_src.history_table,
              'rows_deleted', v_removed,
              'rows_remaining', v_left));

    RETURN jsonb_build_object('success', true, 'action', 'purge', 'source', p_source,
                              'key', p_key, 'title', v_title,
                              'rows_deleted', v_removed, 'rows_remaining', v_left);
  END IF;

  RAISE EXCEPTION 'Unknown action %. Use sources|list|restore|purge', p_action;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.trash_bin(text, text, text, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trash_bin(text, text, text, uuid, integer, text) TO authenticated, service_role;

-- ── 5. RETENTION IS NOT DECIDED HERE ────────────────────────────────────────
-- The bin never empties itself. No cron, no TTL, nothing that removes content
-- because time passed. Automatic deletion of a customer's content is a policy
-- decision for the owner, not a default a migration slips in. When it is
-- decided, it belongs here as a retention_days column on trash_sources plus a
-- sweep that calls trash_bin('purge') — so it goes through the same guards and
-- writes the same audit rows as a human pressing the button.

-- ── 6. Prove the grants, do not assume them ─────────────────────────────────
-- ALTER DEFAULT PRIVILEGES has handed anon EXECUTE on newborn functions on
-- this fleet before. Fail the migration rather than ship a hole.
DO $verify$
DECLARE
  v_sig text := 'public.trash_bin(text, text, text, uuid, integer, text)';
BEGIN
  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'trash_bin is executable by anon';
  END IF;
  IF has_function_privilege('anon', 'public.trash_text_from_jsonb(jsonb, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'trash_text_from_jsonb is executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'trash_bin is not executable by authenticated';
  END IF;
  IF has_table_privilege('anon', 'public.trash_sources', 'SELECT') THEN
    RAISE EXCEPTION 'trash_sources is readable by anon';
  END IF;
  IF has_table_privilege('authenticated', 'public.trash_sources', 'INSERT')
     OR has_table_privilege('authenticated', 'public.trash_sources', 'UPDATE') THEN
    RAISE EXCEPTION 'trash_sources is writable by authenticated — its strings become SQL identifiers';
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- Role missing on a bare Postgres (local runs without the Supabase roles).
  NULL;
END;
$verify$;
