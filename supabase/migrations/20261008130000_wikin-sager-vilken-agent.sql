-- Wikin säger vilken agent — och historiken säger vem.
--
-- När Peters Hermes ändrar en wikisida idag står det "by Magnus via external
-- agent" i sidfoten (nyckelns skapare, transporten) och ingenting alls i
-- versionshistoriken: triggern tar edited_by från auth.uid(), som är NULL när
-- agent-execute kör med service-nyckeln. För en kollega som ska avgöra om
-- sidan går att lita på är "vem" och "vilken agent" två olika fakta, och båda
-- måste följa med när fler låter agenter göra administrativt arbete.
--
--   1. wiki_page_revisions.edited_by_agent — vilken yta eller agent gjorde
--      ändringen som ersatte den här versionen (samma värde som
--      wiki_pages.updated_by_agent: 'flowpilot', 'mcp' eller agentens namn,
--      t.ex. 'Hermes_peter', som gatewayen nu skickar med).
--   2. log_wiki_revision: edited_by faller tillbaka på raden's updated_by när
--      auth.uid() är NULL (agent via service-nyckel). Redaktören är den som
--      ändrade — NEW vid update, OLD:s senaste vid delete.
--   3. wiki_page_history('list') returnerar edited_by_agent och ett läsbart
--      edited_by_name, så historikpanelen kan skriva "Peter via Hermes_peter".

ALTER TABLE public.wiki_page_revisions ADD COLUMN IF NOT EXISTS edited_by_agent text;
COMMENT ON COLUMN public.wiki_page_revisions.edited_by_agent IS
  'Surface or connected agent that made the change superseding this version — mirrors wiki_pages.updated_by_agent (flowpilot / mcp / the agent''s own name).';

CREATE OR REPLACE FUNCTION public.log_wiki_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_editor uuid;
  v_agent text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.content_md IS NOT DISTINCT FROM NEW.content_md
     AND OLD.title IS NOT DISTINCT FROM NEW.title THEN
    RETURN NEW; -- metadata-only change (parent/visibility) — no content revision
  END IF;
  -- Who made the change that supersedes this version. A signed-in human is
  -- auth.uid(); an agent running through agent-execute (service role) has no
  -- auth.uid() but stamped the row it wrote — read it back from there.
  IF TG_OP = 'UPDATE' THEN
    v_editor := COALESCE(auth.uid(), NEW.updated_by);
    v_agent := NEW.updated_by_agent;
  ELSE
    v_editor := COALESCE(auth.uid(), OLD.updated_by);
    v_agent := CASE WHEN auth.uid() IS NULL THEN OLD.updated_by_agent ELSE NULL END;
  END IF;
  INSERT INTO public.wiki_page_revisions (slug, title, content_md, revision_no, action, edited_by, edited_by_agent)
  VALUES (OLD.slug, OLD.title, OLD.content_md,
    (SELECT COALESCE(MAX(revision_no),0)+1 FROM public.wiki_page_revisions WHERE slug = OLD.slug),
    lower(TG_OP), v_editor, v_agent);
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.log_wiki_revision() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_wiki_revision() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.wiki_page_history(p_action text, p_slug text DEFAULT NULL::text, p_revision_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rev public.wiki_page_revisions;
  v_rows jsonb;
  v_is_writer boolean;
BEGIN
  v_is_writer := auth.role() = 'service_role' OR can_access_module(auth.uid(),'wiki');
  IF NOT (v_is_writer OR auth.uid() IS NOT NULL) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_action = 'list' THEN
    IF p_slug IS NULL THEN RAISE EXCEPTION 'list requires p_slug'; END IF;
    SELECT COALESCE(jsonb_agg(r ORDER BY r.revision_no DESC), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT rv.id, rv.slug, rv.title, rv.revision_no, rv.action, rv.edited_by, rv.edited_by_agent, rv.revised_at,
             length(rv.content_md) AS content_length,
             (SELECT COALESCE(pr.full_name, pr.email) FROM public.profiles pr WHERE pr.id = rv.edited_by) AS edited_by_name
      FROM public.wiki_page_revisions rv WHERE rv.slug = p_slug
      ORDER BY rv.revision_no DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit,20),1),100)
    ) r;
    RETURN jsonb_build_object('success', true, 'slug', p_slug, 'revisions', v_rows);

  ELSIF p_action = 'get' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'get requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.wiki_page_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;
    RETURN jsonb_build_object('success', true, 'revision', to_jsonb(v_rev));

  ELSIF p_action = 'restore' THEN
    IF NOT v_is_writer THEN
      RAISE EXCEPTION 'Requires the wiki module — an admin can grant it under Users → Role Permissions';
    END IF;
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'restore requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.wiki_page_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;
    UPDATE public.wiki_pages
    SET title = v_rev.title, content_md = v_rev.content_md, updated_at = now(), updated_by = auth.uid(), updated_by_agent = NULL
    WHERE slug = v_rev.slug;
    IF NOT FOUND THEN
      -- Page was deleted — restore recreates it.
      INSERT INTO public.wiki_pages (slug, title, content_md, created_by, updated_by)
      VALUES (v_rev.slug, v_rev.title, v_rev.content_md, auth.uid(), auth.uid());
    END IF;
    RETURN jsonb_build_object('success', true, 'slug', v_rev.slug,
      'restored_revision_no', v_rev.revision_no);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use list|get|restore', p_action;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.wiki_page_history(text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wiki_page_history(text, text, uuid, integer) TO authenticated, service_role;
