CREATE OR REPLACE FUNCTION public.create_cowork_document(
  p_title text,
  p_file_name text,
  p_file_url text,
  p_file_type text DEFAULT NULL,
  p_file_size_bytes bigint DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT 'chat-attachment',
  p_tags text[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    OR public.has_role(v_uid, 'hr'::app_role)
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
    description, category, tags, source, uploaded_by, extraction_status
  ) VALUES (
    p_title, p_file_name, p_file_url, p_file_type, p_file_size_bytes,
    p_description, p_category, p_tags, 'cowork-upload', v_uid, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;