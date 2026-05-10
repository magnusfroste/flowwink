CREATE OR REPLACE FUNCTION public.log_ai_usage(
  p_source text,
  p_provider text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_prompt_tokens integer DEFAULT 0,
  p_completion_tokens integer DEFAULT 0,
  p_total_tokens integer DEFAULT 0,
  p_latency_ms integer DEFAULT NULL,
  p_status text DEFAULT 'success',
  p_error text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_source IS NULL OR length(p_source) = 0 THEN
    RAISE EXCEPTION 'source is required';
  END IF;

  INSERT INTO public.ai_usage_logs (
    source, provider, model,
    prompt_tokens, completion_tokens, total_tokens,
    latency_ms, status, error,
    user_id, conversation_id, request_id, metadata
  ) VALUES (
    p_source,
    p_provider,
    p_model,
    COALESCE(p_prompt_tokens, 0),
    COALESCE(p_completion_tokens, 0),
    COALESCE(p_total_tokens, 0),
    p_latency_ms,
    COALESCE(p_status, 'success'),
    CASE WHEN p_error IS NOT NULL THEN left(p_error, 1000) ELSE NULL END,
    p_user_id,
    p_conversation_id,
    p_request_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_ai_usage(text, text, text, integer, integer, integer, integer, text, text, uuid, uuid, text, jsonb) TO anon, authenticated, service_role;