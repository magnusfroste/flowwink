-- 1) New columns on documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS content_md text,
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extraction_error text,
  ADD COLUMN IF NOT EXISTS content_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Validation: keep extraction_status to a known set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_extraction_status_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_extraction_status_check
      CHECK (extraction_status IN ('pending', 'success', 'failed', 'unsupported', 'not_applicable'));
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_documents_source ON public.documents(source);
CREATE INDEX IF NOT EXISTS idx_documents_extraction_status ON public.documents(extraction_status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON public.documents(uploaded_by);

-- 2) SECURITY DEFINER: create a cowork-uploaded document
-- Any signed-in user with role admin/employee/manager can call this.
-- It forces source='cowork-upload' and uploaded_by = auth.uid() so callers
-- cannot impersonate other users or mislabel the origin.
CREATE OR REPLACE FUNCTION public.create_cowork_document(
  p_title text,
  p_file_name text,
  p_file_url text,
  p_file_type text DEFAULT NULL,
  p_file_size_bytes bigint DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT 'chat-attachment',
  p_tags text[] DEFAULT '{}'::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'employee'::app_role)
    OR public.has_role(v_uid, 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'insufficient role for cowork upload';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'title required';
  END IF;
  IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
    RAISE EXCEPTION 'file_name required';
  END IF;
  IF p_file_url IS NULL OR length(trim(p_file_url)) = 0 THEN
    RAISE EXCEPTION 'file_url required';
  END IF;

  INSERT INTO public.documents (
    title, file_name, file_url, file_type, file_size_bytes,
    description, category, tags,
    uploaded_by, source, extraction_status
  )
  VALUES (
    p_title, p_file_name, p_file_url, p_file_type, p_file_size_bytes,
    p_description, COALESCE(p_category, 'chat-attachment'), COALESCE(p_tags, '{}'::text[]),
    v_uid, 'cowork-upload', 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_cowork_document(text, text, text, text, bigint, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_cowork_document(text, text, text, text, bigint, text, text, text[]) TO authenticated;

-- 3) SECURITY DEFINER: write extraction result back to the cowork document
-- Only the uploader (or an admin) can update extraction fields, and only
-- on rows with source='cowork-upload'. No other columns can be touched.
CREATE OR REPLACE FUNCTION public.update_cowork_document_extraction(
  p_document_id uuid,
  p_status text,
  p_content_md text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_source text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_status NOT IN ('pending', 'success', 'failed', 'unsupported', 'not_applicable') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT uploaded_by, source INTO v_owner, v_source
  FROM public.documents
  WHERE id = p_document_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'document not found';
  END IF;

  IF v_source <> 'cowork-upload' THEN
    RAISE EXCEPTION 'not a cowork document';
  END IF;

  IF v_owner <> v_uid AND NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.documents
  SET
    content_md = COALESCE(p_content_md, content_md),
    extraction_status = p_status,
    extraction_error = p_error,
    content_extracted_at = CASE
      WHEN p_status = 'success' THEN now()
      ELSE content_extracted_at
    END
  WHERE id = p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_cowork_document_extraction(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_cowork_document_extraction(uuid, text, text, text) TO authenticated;

-- 4) Allow the uploader (and admins) to SELECT their own cowork documents
-- (existing policy already allows any authenticated user to view documents,
--  but we add an explicit one anchored on uploaded_by so future tightenings
--  of the broad policy don't break cowork.)
DROP POLICY IF EXISTS "Cowork uploaders can view their own documents" ON public.documents;
CREATE POLICY "Cowork uploaders can view their own documents"
ON public.documents
FOR SELECT
TO authenticated
USING (
  source = 'cowork-upload' AND uploaded_by = auth.uid()
);