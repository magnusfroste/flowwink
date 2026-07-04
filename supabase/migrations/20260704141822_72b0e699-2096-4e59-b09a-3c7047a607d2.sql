
ALTER TABLE public.global_blocks
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_global_blocks_category ON public.global_blocks(category) WHERE category IS NOT NULL;

CREATE OR REPLACE FUNCTION public.capture_chat_lead(
  p_email text,
  p_conversation_id uuid DEFAULT NULL,
  p_session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_normalized_email text;
BEGIN
  v_normalized_email := lower(trim(p_email));
  IF v_normalized_email IS NULL OR v_normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email');
  END IF;

  SELECT id INTO v_lead_id FROM public.leads WHERE lower(email) = v_normalized_email LIMIT 1;

  IF v_lead_id IS NULL THEN
    INSERT INTO public.leads (email, source, status, score)
    VALUES (v_normalized_email, 'chat_capture', 'new', 5)
    RETURNING id INTO v_lead_id;
  END IF;

  IF p_conversation_id IS NOT NULL THEN
    UPDATE public.chat_conversations
       SET customer_email = COALESCE(customer_email, v_normalized_email)
     WHERE id = p_conversation_id;
  END IF;

  IF p_session_id IS NOT NULL THEN
    PERFORM public.stitch_visitor_to_lead(p_session_id, v_lead_id, 'chat_capture');
  END IF;

  RETURN jsonb_build_object('success', true, 'lead_id', v_lead_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.capture_chat_lead(text, uuid, text) TO anon, authenticated, service_role;
