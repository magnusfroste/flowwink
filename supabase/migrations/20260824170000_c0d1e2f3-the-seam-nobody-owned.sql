-- Blog and handbook were never registered in the trash.
--
-- Two changes landed the same evening. 20260823170000 gave blog_posts and
-- handbook_chapters the revision trail they had never had — they were the only
-- two content types where a delete left NO trace at all. 20260824120000 built
-- the unified trash and its source registry.
--
-- Each change wrote the integration down and left it to the other. The trash
-- migration spelled these two rows out verbatim in a comment ("it belongs with
-- THAT change, not this one"); the revisions agent reported back that the
-- registry "fits without a special case" and quoted the same values. Neither
-- inserted them. Every author was right about the shape and wrong about who
-- would type it.
--
-- Found the way seams are always found: the owner deleted a blog post as admin
-- and it was not in the bin. The wiki page he deleted the same hour WAS there,
-- which is what made it look like a bug in the trash rather than a hole in its
-- registry.
--
-- Nothing below needs to know these types exist — that was the design, and it
-- holds: this is one row each and no code changes.
INSERT INTO public.trash_sources (source_key, label, module_key, kind,
  history_table, identity_column, title_column, subtitle_column,
  preview_column, preview_fallback_column, preview_kind,
  deleted_at_column, deleted_by_column,
  live_table, live_identity_column, restore_rpc, sort_order)
VALUES
  ('blog', 'Blog post', 'blog', 'revision',
   'blog_post_revisions', 'post_id', 'title', 'slug',
   'content_json', 'excerpt', 'jsonb', 'revised_at', 'edited_by',
   'blog_posts', 'id', 'blog_post_history', 40),
  ('handbook', 'Handbook chapter', 'handbook', 'revision',
   'handbook_chapter_revisions', 'chapter_id', 'title', 'slug',
   'content_md', NULL, 'text', 'revised_at', 'edited_by',
   'handbook_chapters', 'id', 'handbook_chapter_history', 50)
ON CONFLICT (source_key) DO NOTHING;

-- A registry that silently lacks a source is indistinguishable from a source
-- with nothing deleted in it. Fail loudly at migration time instead.
DO $seam$
DECLARE missing text;
BEGIN
  SELECT string_agg(k, ', ') INTO missing
  FROM unnest(ARRAY['pages','wiki','kb','blog','handbook']) k
  WHERE NOT EXISTS (SELECT 1 FROM public.trash_sources WHERE source_key = k);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'trash_sources is missing: % — the bin would show nothing for them and look empty rather than broken', missing;
  END IF;
END $seam$;
