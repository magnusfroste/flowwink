CREATE OR REPLACE FUNCTION public.release_agent_conversations(p_user_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  channel text,
  channel_thread_id text,
  customer_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;

  FOR v_rec IN
    UPDATE public.chat_conversations c
       SET assigned_agent_id = NULL,
           conversation_status = 'waiting_agent',
           updated_at = now()
     WHERE c.assigned_agent_id = p_user_id
       AND c.conversation_status IN ('with_agent', 'active')
   RETURNING c.id, c.channel, c.channel_thread_id, c.customer_name
  LOOP
    INSERT INTO public.chat_messages (conversation_id, role, source, content, metadata)
    VALUES (
      v_rec.id,
      'system',
      'system',
      'Agent went offline — conversation returned to the waiting queue.',
      jsonb_build_object('event', 'agent_offline_release', 'released_agent_id', p_user_id)
    );

    conversation_id := v_rec.id;
    channel := v_rec.channel;
    channel_thread_id := v_rec.channel_thread_id;
    customer_name := v_rec.customer_name;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.release_agent_conversations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_agent_conversations(uuid) TO authenticated, service_role;