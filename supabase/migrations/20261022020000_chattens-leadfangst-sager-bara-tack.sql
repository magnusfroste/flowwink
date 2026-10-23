-- Security sweep 2026-10-22: capture_chat_lead is an anon RPC (the chat widget's
-- lead form). It returned `is_new`, which told any visitor whether an email
-- address already exists in the CRM. Same body as 20260704150000, the return
-- narrowed for the anon caller. Grants unchanged (restated).

CREATE OR REPLACE FUNCTION public.capture_chat_lead(
  p_email text,
  p_name text DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL,
  p_session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_name text;
  v_lead_id uuid;
  v_is_new boolean := false;
  v_linked boolean := false;
BEGIN
  v_email := lower(trim(p_email));
  IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email address');
  END IF;
  v_name := NULLIF(trim(p_name), '');

  SELECT id INTO v_lead_id FROM leads WHERE lower(email) = v_email;
  IF v_lead_id IS NULL THEN
    INSERT INTO leads (email, name, source, source_id, status, score, needs_review)
    VALUES (v_email, v_name, 'chat-widget', p_conversation_id::text, 'lead', 5, false)
    RETURNING id INTO v_lead_id;
    v_is_new := true;
  ELSE
    UPDATE leads
    SET name = COALESCE(name, v_name),
        score = COALESCE(score, 0) + 5,
        updated_at = now()
    WHERE id = v_lead_id;
  END IF;

  IF p_conversation_id IS NOT NULL THEN
    UPDATE chat_conversations
    SET lead_id = v_lead_id,
        customer_email = v_email,
        customer_name = COALESCE(v_name, customer_name),
        updated_at = now()
    WHERE id = p_conversation_id
      AND (
        (p_session_id IS NOT NULL AND session_id = p_session_id)
        OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
        OR auth.role() = 'service_role'
      );
    v_linked := FOUND;
  END IF;

  BEGIN
    PERFORM emit_platform_event(
      'chat.lead_captured',
      jsonb_build_object(
        'lead_id', v_lead_id,
        'email', v_email,
        'conversation_id', p_conversation_id,
        'is_new', v_is_new
      ),
      'chat'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- event emission is best-effort; never block the capture
  END;

  -- The anon caller learns only that it worked. `is_new` told a visitor whether
  -- an email is already in the CRM — an enumeration oracle (sweep 2026-10-22);
  -- the widget reads nothing but `success`.
  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', true);
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'is_new', v_is_new,
    'conversation_linked', v_linked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.capture_chat_lead(text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_chat_lead(text, text, uuid, text) TO anon, authenticated, service_role;
