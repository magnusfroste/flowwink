-- A stored site template keeps the visibility of the knowledge it carries.
--
-- export_site_template (include "wiki" / "documents") now carries wiki pages
-- and uploaded documents into the template body, each with the visibility it
-- had: wiki internal | admin, documents shared | role | private. The body lands
-- in site_templates.template_json, and "Authenticated view site templates" let
-- EVERY signed-in user read every active template. Two correct rules, one
-- leak: an HR contract marked private, or an admin-only wiki page, would have
-- been readable by all of sales the moment an admin saved a site export — not
-- through documents/wiki_pages, whose RLS is right, but one row over.
--
-- The fix is the same shape as 20260808170000 (files follow their document):
-- a template that carries restricted knowledge is readable by admins only.
-- Templates that carry none (or only shared documents and internal wiki pages,
-- both visible to every signed-in user anyway) stay as they were.
--
-- Decided ONCE, at write time, into a column — not in the policy. A saved
-- export can hold tens of MB of base64; a policy that walked template_json
-- would parse every row's body on every non-admin listing, for a boolean that
-- only changes when the body does (review of #797). A BEFORE trigger sets it
-- on every insert and update, so no writer (manage_site_template, an admin
-- client, a future RPC) can store a body without it, or set it by hand.
--
-- Idempotent: CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS, DROP … IF EXISTS.

CREATE OR REPLACE FUNCTION public.site_template_carries_restricted_content(p_template jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT
    -- A document is visible to every signed-in user only when it is `shared`.
    -- An entry without a visibility is treated as private: the unknown case
    -- errs on the closed side.
    (CASE WHEN COALESCE(jsonb_typeof(p_template -> 'documents'), '') <> 'array' THEN false
     ELSE EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_template -> 'documents') AS d
       WHERE COALESCE(d ->> 'visibility', 'private') <> 'shared')
     END)
    OR
    -- A wiki page is visible to every signed-in user only when it is
    -- `internal` (the column default, and what an export writes for a page
    -- with no value); anything else — `admin` today — is restricted.
    (CASE WHEN COALESCE(jsonb_typeof(p_template -> 'wikiPages'), '') <> 'array' THEN false
     ELSE EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_template -> 'wikiPages') AS w
       WHERE COALESCE(w ->> 'visibility', 'internal') <> 'internal')
     END);
$fn$;

COMMENT ON FUNCTION public.site_template_carries_restricted_content(jsonb) IS
  'True when a StarterTemplate body carries a document that is not shared (role, private or unset) or a wiki page that is not internal (admin). Evaluated by trigger into site_templates.carries_restricted_content; the SELECT policy reads the column.';

GRANT EXECUTE ON FUNCTION public.site_template_carries_restricted_content(jsonb) TO authenticated, service_role;

ALTER TABLE public.site_templates
  ADD COLUMN IF NOT EXISTS carries_restricted_content boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.site_templates.carries_restricted_content IS
  'Set by trigger from template_json: the template carries a role/private document or an admin-only wiki page, so only admins may read it. Never written by hand — the trigger overwrites it.';

CREATE OR REPLACE FUNCTION public.site_templates_stamp_restricted_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.carries_restricted_content := public.site_template_carries_restricted_content(NEW.template_json);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_site_templates_stamp_restricted_content ON public.site_templates;
CREATE TRIGGER trg_site_templates_stamp_restricted_content
  BEFORE INSERT OR UPDATE ON public.site_templates
  FOR EACH ROW EXECUTE FUNCTION public.site_templates_stamp_restricted_content();

-- Rows saved before this migration: stamp them once (the trigger recomputes;
-- only rows whose stamp is wrong are touched, so a re-run writes nothing).
UPDATE public.site_templates
   SET carries_restricted_content = public.site_template_carries_restricted_content(template_json)
 WHERE carries_restricted_content IS DISTINCT FROM public.site_template_carries_restricted_content(template_json);

DROP POLICY IF EXISTS "Authenticated view site templates" ON public.site_templates;
CREATE POLICY "Authenticated view site templates"
  ON public.site_templates FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (is_active = true AND NOT carries_restricted_content)
  );

-- The documents-only predicate an earlier draft of this migration defined.
DROP FUNCTION IF EXISTS public.site_template_carries_restricted_documents(jsonb);
