-- Chat widget lead capture (EPIC-06 / chat#lead_capture).
-- 1) chat_conversations.lead_id — associate a visitor chat with a CRM lead.
-- 2) capture_chat_lead RPC — SECURITY DEFINER upsert-by-email (same pattern as
--    register_for_webinar) so anonymous visitors can leave their email without
--    needing SELECT access on leads. Idempotent; safe to run multiple times.

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS lead_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_conversations_lead_id_fkey'
      AND conrelid = 'public.chat_conversations'::regclass
  ) THEN
    ALTER TABLE public.chat_conversations
      ADD CONSTRAINT chat_conversations_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_lead_id
  ON public.chat_conversations (lead_id) WHERE lead_id IS NOT NULL;

-- Upsert a lead from the public chat widget and link the conversation.
-- Callable by anon: ownership of the conversation is verified via session_id
-- (the widget's chat-session-id) or auth.uid(); service_role bypasses.
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

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'is_new', v_is_new,
    'conversation_linked', v_linked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.capture_chat_lead(text, text, uuid, text)
  TO anon, authenticated, service_role;
