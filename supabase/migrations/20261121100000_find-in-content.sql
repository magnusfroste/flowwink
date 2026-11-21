-- find_in_content: every place a phrase occurs, across what the site says.
--
-- Optic, 2026-11-19: a product was renamed and an agent set out to change the
-- term everywhere. It asked the skill search three times for "full-text search
-- across site content, blog post bodies, pages and knowledge base", was offered
-- nothing that does it, searched the KB and the wiki one at a time, got an
-- empty answer from the blog (which matched titles only) and then opened
-- seventeen blog posts one by one to read them for the term. Pages have no
-- search at all.
--
-- The knowledge index (search_knowledge) answers another question — "what do we
-- say about X", ranked, a handful of chunks. A rename needs the opposite: the
-- exact phrase, every occurrence, nothing ranked away.
--
-- One read, in the database, so nothing is capped on the way: pages, blog
-- posts, KB articles, wiki pages and the translation overlays, with a count
-- and the text around each hit.

-- Every string a JSON document holds, with the key it sits under.
--
-- Rich text (Tiptap) stores a sentence as several text nodes whenever a word
-- is bold or a link, so a phrase can straddle two of them. The third branch
-- reads each block's text nodes joined, and the first leaves the single nodes
-- out — one sentence is one string, counted once.
CREATE OR REPLACE FUNCTION public.json_strings(p_doc jsonb)
RETURNS TABLE(key text, value text)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT kv.key, kv.value #>> '{}'
  FROM jsonb_path_query(coalesce(p_doc, 'null'::jsonb), 'strict $.** ? (@.type() == "object")') AS o(obj),
       LATERAL jsonb_each(o.obj) AS kv
  WHERE jsonb_typeof(kv.value) = 'string'
    AND kv.key NOT IN ('id', 'type')
    AND NOT (kv.key = 'text' AND o.obj ->> 'type' = 'text')

  UNION ALL

  SELECT 'item'::text, e.value #>> '{}'
  FROM jsonb_path_query(coalesce(p_doc, 'null'::jsonb), 'strict $.** ? (@.type() == "array")') AS a(arr),
       LATERAL jsonb_array_elements(a.arr) AS e(value)
  WHERE jsonb_typeof(e.value) = 'string'

  UNION ALL

  SELECT 'text'::text, t.txt
  FROM jsonb_path_query(coalesce(p_doc, 'null'::jsonb), 'strict $.** ? (@.type() == "object")') AS o(obj),
       LATERAL (
         SELECT string_agg(coalesce(c.node ->> 'text', ' '), '' ORDER BY c.ord) AS txt
         FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(o.obj -> 'content') = 'array' THEN o.obj -> 'content' ELSE '[]'::jsonb END
              ) WITH ORDINALITY AS c(node, ord)
         WHERE jsonb_typeof(c.node) = 'object'
         HAVING bool_or(c.node ->> 'type' = 'text')
       ) AS t
  WHERE t.txt IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.json_strings(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.json_strings(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.find_in_content(
  p_text    text,
  p_sources text[]  DEFAULT NULL,
  p_limit   integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_needle text := btrim(coalesce(p_text, ''));
  v_low    text := lower(btrim(coalesce(p_text, '')));
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_all    text[] := ARRAY['page', 'blog_post', 'kb_article', 'wiki_page', 'translation'];
  v_src    text[];
  v_bad    text[];
  v_out    jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'find_in_content: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF char_length(v_needle) < 2 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'p_text is required: the phrase to find, at least 2 characters.');
  END IF;
  IF char_length(v_needle) > 500 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'p_text must be a phrase of at most 500 characters, not a passage.');
  END IF;

  v_src := CASE WHEN p_sources IS NULL OR cardinality(p_sources) = 0 THEN v_all ELSE p_sources END;
  SELECT array_agg(s) INTO v_bad FROM unnest(v_src) AS s WHERE NOT (s = ANY (v_all));
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', format('p_sources must be one of %s — got %s.', array_to_string(v_all, ', '), array_to_string(v_bad, ', ')));
  END IF;

  WITH leaves AS (
    -- Pages (not the ones in the bin).
    SELECT 'page'::text AS source, p.id, p.slug, p.title, p.status::text AS status,
           NULL::text AS locale, NULL::text AS entity, 'title'::text AS field, p.title AS txt
      FROM public.pages p
     WHERE 'page' = ANY (v_src) AND p.deleted_at IS NULL
    UNION ALL
    SELECT 'page', p.id, p.slug, p.title, p.status::text, NULL, NULL, j.key, j.value
      FROM public.pages p, LATERAL public.json_strings(p.content_json) AS j
     WHERE 'page' = ANY (v_src) AND p.deleted_at IS NULL

    -- Blog posts, every status.
    UNION ALL
    SELECT 'blog_post', b.id, b.slug, b.title, b.status::text, NULL, NULL, f.field, f.txt
      FROM public.blog_posts b,
           LATERAL (VALUES ('title', b.title), ('excerpt', b.excerpt)) AS f(field, txt)
     WHERE 'blog_post' = ANY (v_src)
    UNION ALL
    SELECT 'blog_post', b.id, b.slug, b.title, b.status::text, NULL, NULL, j.key, j.value
      FROM public.blog_posts b, LATERAL public.json_strings(b.content_json) AS j
     WHERE 'blog_post' = ANY (v_src)

    -- KB articles: answer_text is the body as text; the JSON twin would count it twice.
    UNION ALL
    SELECT 'kb_article', k.id, k.slug, k.title,
           CASE WHEN k.is_published THEN 'published' ELSE 'draft' END, NULL, NULL, f.field, f.txt
      FROM public.kb_articles k,
           LATERAL (VALUES ('title', k.title), ('question', k.question), ('answer', k.answer_text)) AS f(field, txt)
     WHERE 'kb_article' = ANY (v_src)

    -- Wiki pages: the slug is the key.
    UNION ALL
    SELECT 'wiki_page', NULL::uuid, w.slug, w.title, NULL, NULL, NULL, f.field, f.txt
      FROM public.wiki_pages w,
           LATERAL (VALUES ('title', w.title), ('content_md', w.content_md)) AS f(field, txt)
     WHERE 'wiki_page' = ANY (v_src)

    -- Translation overlays: the same content in the site's other languages.
    UNION ALL
    SELECT 'translation', t.entity_id, t.slug, NULL, t.status, t.locale, t.entity, j.key, j.value
      FROM public.content_translations t, LATERAL public.json_strings(t.strings) AS j
     WHERE 'translation' = ANY (v_src)
  ),
  hits AS (
    SELECT l.*,
           position(v_low IN lower(l.txt)) AS pos,
           (char_length(lower(l.txt)) - char_length(replace(lower(l.txt), v_low, ''))) / char_length(v_low) AS n
      FROM leaves l
     WHERE l.txt IS NOT NULL AND position(v_low IN lower(l.txt)) > 0
  ),
  per AS (
    SELECT h.source, h.id, h.slug, h.locale, h.entity,
           max(h.title)  AS title,
           max(h.status) AS status,
           sum(h.n)::integer AS occurrences,
           array_agg(DISTINCT h.field) AS fields,
           (array_agg(
              regexp_replace(
                CASE WHEN h.pos > 61 THEN '…' ELSE '' END
                || substr(h.txt, greatest(h.pos - 60, 1), 60 + char_length(v_needle) + 100)
                || CASE WHEN char_length(h.txt) > h.pos + char_length(v_needle) + 100 THEN '…' ELSE '' END,
                '\s+', ' ', 'g')
              ORDER BY h.field, h.pos))[1:3] AS snippets
      FROM hits h
     GROUP BY h.source, h.id, h.slug, h.locale, h.entity
  ),
  ranked AS (
    SELECT p.*,
           count(*) OVER ()               AS total_n,
           sum(p.occurrences) OVER ()     AS total_occ,
           row_number() OVER (ORDER BY p.occurrences DESC, p.source, p.title NULLS LAST, p.slug NULLS LAST) AS rn
      FROM per p
  )
  SELECT jsonb_build_object(
           'total',       coalesce(max(r.total_n), 0),
           'occurrences', coalesce(max(r.total_occ), 0),
           'matches',     coalesce(jsonb_agg(
             jsonb_strip_nulls(jsonb_build_object(
               'source', r.source,
               'id', r.id,
               'slug', r.slug,
               'title', r.title,
               'status', r.status,
               'entity', r.entity,
               'locale', r.locale,
               'occurrences', r.occurrences,
               'fields', to_jsonb(r.fields),
               'snippets', to_jsonb(r.snippets),
               'edit_with', CASE r.source
                 WHEN 'wiki_page'   THEN jsonb_build_object('skill', 'manage_wiki_page', 'action', 'update',
                                           'how', 'replace: [{ find, with, all: true }] — only the named text changes')
                 WHEN 'blog_post'   THEN jsonb_build_object('skill', 'manage_blog_posts', 'action', 'update')
                 WHEN 'kb_article'  THEN jsonb_build_object('skill', 'manage_kb_article', 'action', 'update')
                 WHEN 'page'        THEN jsonb_build_object('skill', 'manage_page_blocks', 'action', 'update')
                 WHEN 'translation' THEN jsonb_build_object('skill', 'set_translation')
               END
             )) ORDER BY r.rn) FILTER (WHERE r.rn <= v_limit), '[]'::jsonb)
         )
    INTO v_out
    FROM ranked r;

  RETURN jsonb_build_object(
           'success', true,
           'query', v_needle,
           'sources', to_jsonb(v_src),
           'truncated', (v_out ->> 'total')::integer > v_limit
         ) || v_out;
END;
$$;

COMMENT ON FUNCTION public.find_in_content(text, text[], integer) IS
  'Every place a phrase occurs in the site''s content (pages, blog posts, KB articles, wiki pages, translation overlays): a count and the text around each hit, per entity. Case-insensitive, literal. The find_in_content skill.';

-- Agents reach it through the executor (service role); no browser calls it.
REVOKE ALL ON FUNCTION public.find_in_content(text, text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_in_content(text, text[], integer) TO service_role;
