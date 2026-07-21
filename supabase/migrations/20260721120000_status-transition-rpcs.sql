-- Dedicated RPCs for the last three status-transition skills that were still
-- riding the generic db:<table> CRUD handler.
--
-- The handler infers the action from the skill-name verb. That works for
-- create/update/delete; a transition verb names a TARGET STATE the handler
-- cannot infer, so it guesses — and guesses differently for each verb:
--
--   schedule_voice_callback    'schedule' is in CREATE_VERBS → INSERT into
--                              voice_calls → fails on NOT NULL provider,
--                              direction, from_number, to_number. Loud.
--   mark_voice_callback_done   'mark' matches nothing → falls through to LIST →
--                              returns {items: []} and reports SUCCESS while
--                              doing nothing. Silent, which is worse.
--   support_assign_conversation 'support' matches nothing → same silent list.
--                              Its schema also advertised `status`, but the
--                              column is conversation_status.
--
-- Verified on all four instances: schedule_voice_callback has never succeeded
-- anywhere, and the one "successful" mark_voice_callback_done call returned an
-- empty list without touching a row.
--
-- Params are p_-prefixed so agent-execute's default mapping applies (see
-- UNDERSCORE_PARAM_RPCS for the exception set). Each carries the service_role
-- escape: the MCP gateway executes with the service key, so auth.uid() is NULL
-- and a bare has_role() check would lock the agent out.

CREATE OR REPLACE FUNCTION public.schedule_voice_callback(
  p_call_id uuid,
  p_scheduled_at timestamptz,
  p_agent_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can schedule a callback';
  END IF;

  SELECT * INTO _call FROM public.voice_calls WHERE id = p_call_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voice call % not found', p_call_id;
  END IF;

  IF _call.callback_status = 'completed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'call_id', p_call_id,
      'callback_status', 'completed',
      'note', 'Callback already completed — nothing to schedule.'
    );
  END IF;

  UPDATE public.voice_calls
     SET callback_status = 'scheduled',
         callback_scheduled_at = p_scheduled_at,
         agent_id = COALESCE(p_agent_id, agent_id),
         updated_at = now()
   WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'ok', true,
    'call_id', p_call_id,
    'callback_status', 'scheduled',
    'callback_scheduled_at', p_scheduled_at,
    'agent_id', COALESCE(p_agent_id, _call.agent_id)
  );
END $function$;

-- p_outcome is honoured because the skill's instructions promise it ("Outcome
-- stored in metadata"). The generic handler never stored it — it never wrote
-- anything at all.
CREATE OR REPLACE FUNCTION public.mark_voice_callback_done(
  p_call_id uuid,
  p_outcome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can complete a callback';
  END IF;

  SELECT * INTO _call FROM public.voice_calls WHERE id = p_call_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voice call % not found', p_call_id;
  END IF;

  -- Idempotent: a second call is a no-op, not an error. Agents retry.
  IF _call.callback_status = 'completed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'call_id', p_call_id,
      'callback_status', 'completed',
      'callback_completed_at', _call.callback_completed_at
    );
  END IF;

  IF _call.callback_status NOT IN ('scheduled', 'pending') THEN
    RAISE EXCEPTION 'Callback for call % is %, expected scheduled or pending', p_call_id, _call.callback_status;
  END IF;

  UPDATE public.voice_calls
     SET callback_status = 'completed',
         callback_completed_at = now(),
         metadata = CASE
           WHEN p_outcome IS NULL THEN metadata
           ELSE COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('callback_outcome', p_outcome)
         END,
         updated_at = now()
   WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'ok', true,
    'call_id', p_call_id,
    'callback_status', 'completed',
    'callback_completed_at', now(),
    'callback_outcome', p_outcome
  );
END $function$;

CREATE OR REPLACE FUNCTION public.support_assign_conversation(
  p_conversation_id uuid,
  p_agent_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _conv record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can assign a support conversation';
  END IF;

  IF p_agent_id IS NULL AND p_status IS NULL THEN
    RAISE EXCEPTION 'Provide p_agent_id, p_status, or both';
  END IF;

  SELECT * INTO _conv FROM public.chat_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation % not found', p_conversation_id;
  END IF;

  -- The skill advertised `status`; the column is conversation_status. Writing
  -- through the generic handler silently targeted a column that does not exist.
  UPDATE public.chat_conversations
     SET assigned_agent_id = COALESCE(p_agent_id, assigned_agent_id),
         conversation_status = COALESCE(p_status, conversation_status),
         updated_at = now()
   WHERE id = p_conversation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', p_conversation_id,
    'assigned_agent_id', COALESCE(p_agent_id, _conv.assigned_agent_id),
    'conversation_status', COALESCE(p_status, _conv.conversation_status)
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.schedule_voice_callback(uuid, timestamptz, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_voice_callback_done(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.support_assign_conversation(uuid, uuid, text) TO authenticated, service_role;
