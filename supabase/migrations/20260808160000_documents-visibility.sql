-- Documents can be marked sensitive. Until now they could not be.
--
-- The gap, found while answering a question a real colleague asked before
-- getting his login: `documents` had a SELECT policy with the qual `true`, so
-- every authenticated user could read every document, and the table carried no
-- visibility field at all. HR uploading an employment contract as a PDF would
-- have shown it to sales. Meanwhile employment_contracts — the STRUCTURED
-- version of the same thing — is properly scoped: admin, or the employee.
--
-- There was already one exception, and it is the tell: "Cowork uploaders can
-- view their own documents", limited to source='cowork-upload'. Somebody hit
-- this need and solved it for a single upload path.
--
-- DELIBERATELY NOT FLOWTABLE'S MODEL. Flowtable is private-by-default with a
-- button to share, which is right for a personal scratch space. A business
-- operating system is not that: most of its value is everyone having the same
-- picture, and private-by-default makes work vanish from colleagues who should
-- see it — which is how people end up emailing files around again. So this is
-- the mirror image, on purpose: SHARED by default, with the ability to mark
-- something sensitive.
--
-- AND IT IS A BRIDGE, NOT A DESTINATION. The platform's direction is structured
-- data: an employment contract can be a `contract` with signatures and a
-- lifecycle, exactly like a customer agreement. HR is not there yet, so files
-- must be safe in the meantime — without this becoming the permanent answer to
-- "where do sensitive documents live".

-- ── the field ──────────────────────────────────────────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS visible_to_role public.app_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_visibility_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_visibility_check
      CHECK (visibility IN ('shared', 'role', 'private'));
  END IF;

  -- A role-scoped document without a role would be invisible to everyone but
  -- admin — a silent black hole rather than an error.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_role_requires_role'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_role_requires_role
      CHECK (visibility <> 'role' OR visible_to_role IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.documents.visibility IS
  'shared (default, every authenticated user) | role (only visible_to_role, plus the uploader) | private (uploader only). Admin always sees everything. Existing rows default to shared, so behaviour is unchanged until a document is deliberately marked.';
COMMENT ON COLUMN public.documents.visible_to_role IS
  'Required when visibility = ''role''. The whole HR team sees each other''s documents; sales does not.';

CREATE INDEX IF NOT EXISTS documents_visibility_idx
  ON public.documents (visibility)
  WHERE visibility <> 'shared';

-- ── the policy ─────────────────────────────────────────────────────────────
-- The old policy MUST go, not merely be joined by a stricter one. Postgres ORs
-- permissive policies together, so leaving a `true` SELECT in place would make
-- every restriction below decorative. This is the same shape as revoking from
-- `anon` while PUBLIC still holds the grant — the restriction that reads
-- correctly and changes nothing.
DROP POLICY IF EXISTS "Authenticated users can view documents" ON public.documents;
DROP POLICY IF EXISTS "Cowork uploaders can view their own documents" ON public.documents;
DROP POLICY IF EXISTS "Documents are visible per their visibility setting" ON public.documents;

CREATE POLICY "Documents are visible per their visibility setting"
  ON public.documents FOR SELECT
  USING (
    -- Admin sees everything, as everywhere else in the platform.
    public.has_role(auth.uid(), 'admin'::public.app_role)
    -- Shared is the default and the common case: same picture for everyone.
    OR visibility = 'shared'
    -- Role-scoped: the named role, and the person who uploaded it — otherwise
    -- an HR employee filing something for another team loses their own file.
    OR (visibility = 'role' AND (
          public.has_role(auth.uid(), visible_to_role)
          OR uploaded_by = auth.uid()
        ))
    -- Private: the uploader alone.
    OR (visibility = 'private' AND uploaded_by = auth.uid())
  );

-- Marking a document sensitive must not be something any colleague can undo.
-- Update stays admin-only (unchanged), but the uploader may re-classify their
-- own file — otherwise a mistaken 'shared' can only be fixed by an admin.
DROP POLICY IF EXISTS "Uploaders can reclassify their own documents" ON public.documents;
CREATE POLICY "Uploaders can reclassify their own documents"
  ON public.documents FOR UPDATE
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());
