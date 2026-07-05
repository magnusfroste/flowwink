-- Fix: create_agent_document referenced 'manager'::app_role, which is not a
-- member of the app_role enum. The bad cast is evaluated for EVERY call (it sits
-- in an OR chain), so upload_document over the MCP gateway always failed with
-- "invalid input value for enum app_role: manager" regardless of the caller's
-- real role. Found by OpenClaw's external-agent audit 2026-07-06.
-- Fix: drop the 'manager' branch — admin and employee are the valid roles.
-- Idempotent: CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.create_agent_document(
  p_uploaded_by uuid, p_peer_name text, p_title text, p_file_name text,
  p_file_url text DEFAULT NULL::text, p_file_type text DEFAULT NULL::text,
  p_file_size_bytes bigint DEFAULT NULL::bigint, p_description text DEFAULT NULL::text,
  p_category text DEFAULT 'agent-upload'::text, p_tags text[] DEFAULT '{}'::text[],
  p_content_md text DEFAULT NULL::text, p_extraction_status text DEFAULT 'pending'::text,
  p_extraction_error text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_source text;
  v_peer text := COALESCE(NULLIF(trim(p_peer_name), ''), 'unknown');
BEGIN
  IF p_uploaded_by IS NULL THEN
    RAISE EXCEPTION 'uploaded_by required';
  END IF;

  IF NOT (
    public.has_role(p_uploaded_by, 'admin'::app_role)
    OR public.has_role(p_uploaded_by, 'employee'::app_role)
  ) THEN
    RAISE EXCEPTION 'caller user lacks role for agent upload';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'title required';
  END IF;
  IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
    RAISE EXCEPTION 'file_name required';
  END IF;

  IF p_extraction_status NOT IN ('pending', 'success', 'failed', 'unsupported', 'not_applicable') THEN
    RAISE EXCEPTION 'invalid extraction_status: %', p_extraction_status;
  END IF;

  v_peer := lower(regexp_replace(v_peer, '[^a-z0-9_-]+', '-', 'gi'));
  v_source := 'agent-upload:' || v_peer;

  INSERT INTO public.documents (
    title, file_name, file_url, file_type, file_size_bytes,
    description, category, tags,
    uploaded_by, source,
    content_md, extraction_status, extraction_error,
    content_extracted_at
  )
  VALUES (
    p_title, p_file_name, COALESCE(p_file_url, ''), p_file_type, p_file_size_bytes,
    p_description, COALESCE(p_category, 'agent-upload'), COALESCE(p_tags, '{}'::text[]),
    p_uploaded_by, v_source,
    p_content_md, p_extraction_status, p_extraction_error,
    CASE WHEN p_extraction_status = 'success' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
