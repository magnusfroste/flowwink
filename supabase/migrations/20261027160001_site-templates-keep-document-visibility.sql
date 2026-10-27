-- A stored site template keeps its documents' visibility.
--
-- export_site_template (include "documents") now carries the uploaded documents
-- — metadata, indexed text and the stored file — into the template body, each
-- with the visibility it had: shared / role / private. The body lands in
-- site_templates.template_json, and "Authenticated view site templates" let
-- EVERY signed-in user read every active template. Two correct rules, one leak:
-- an HR contract marked private would have been readable by all of sales the
-- moment an admin saved a site export — not through the documents table, whose
-- RLS is right, but one row over.
--
-- The fix is the same shape as 20260808170000 (files follow their document):
-- a template that carries a document which is not `shared` is readable by
-- admins only. Templates without documents, and templates whose documents are
-- all shared (visible to every signed-in user anyway), stay as they were.
-- Nothing is widened by storing it; nothing is narrowed for the rest.
--
-- Idempotent: CREATE OR REPLACE + DROP POLICY IF EXISTS.

CREATE OR REPLACE FUNCTION public.site_template_carries_restricted_documents(p_template jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN COALESCE(jsonb_typeof(p_template -> 'documents'), '') <> 'array' THEN false
    ELSE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_template -> 'documents') AS d
      -- An entry without a visibility is treated as private: the unknown case
      -- must err on the closed side.
      WHERE COALESCE(d ->> 'visibility', 'private') <> 'shared'
    )
  END;
$fn$;

COMMENT ON FUNCTION public.site_template_carries_restricted_documents(jsonb) IS
  'True when a StarterTemplate body carries a document whose visibility is role or private (or unset). Such a template is readable by admins only — see the "Authenticated view site templates" policy.';

GRANT EXECUTE ON FUNCTION public.site_template_carries_restricted_documents(jsonb) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated view site templates" ON public.site_templates;
CREATE POLICY "Authenticated view site templates"
  ON public.site_templates FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (is_active = true AND NOT public.site_template_carries_restricted_documents(template_json))
  );
