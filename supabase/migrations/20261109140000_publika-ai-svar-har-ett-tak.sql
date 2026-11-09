-- ============================================================================
-- The public AI endpoints have a ceiling (2026-11-09).
--
-- chat-completion (the visitor chat), docs-chat and consultant-match answer
-- anyone with the site's publishable key, and every answer is a paid model
-- call. Nothing counted them: a loop could spend the instance's AI budget in
-- an afternoon. public_ai_rate_check counts in fixed windows — per visitor
-- (a hashed IP, never the address) and per instance per hour — and answers
-- whether this call may run. The edge layer asks it before the model
-- (_shared/rate-limit.ts); the limits are a dial in site_settings.security.
-- Service role only: no browser ever calls it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policy: only the service role (which bypasses RLS) reads or writes it.
REVOKE ALL ON TABLE public.public_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_ai_rate_check(
  p_fn text,
  p_visitor text,
  p_per_visitor integer,
  p_window_seconds integer,
  p_per_hour integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_now timestamptz := now();
  v_win timestamptz := to_timestamp(floor(extract(epoch FROM v_now) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  v_hour timestamptz := date_trunc('hour', v_now);
  v_visitor_hits integer;
  v_instance_hits integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'public_ai_rate_check: service role only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.public_rate_limits AS r (bucket, window_start, hits)
  VALUES ('instance:' || p_fn, v_hour, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING hits INTO v_instance_hits;

  INSERT INTO public.public_rate_limits AS r (bucket, window_start, hits)
  VALUES ('visitor:' || p_fn || ':' || coalesce(p_visitor, 'unknown'), v_win, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING hits INTO v_visitor_hits;

  -- Yesterday's windows are noise: one cheap sweep per new hour.
  IF v_instance_hits = 1 THEN
    DELETE FROM public.public_rate_limits WHERE window_start < v_now - interval '1 day';
  END IF;

  IF p_per_hour > 0 AND v_instance_hits > p_per_hour THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'instance',
      'retry_after', ceil(extract(epoch FROM (v_hour + interval '1 hour' - v_now)))::int);
  END IF;
  IF p_per_visitor > 0 AND v_visitor_hits > p_per_visitor THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'visitor',
      'retry_after', ceil(extract(epoch FROM (v_win + make_interval(secs => p_window_seconds) - v_now)))::int);
  END IF;
  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.public_ai_rate_check(text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_ai_rate_check(text, text, integer, integer, integer) TO service_role;
COMMENT ON FUNCTION public.public_ai_rate_check(text, text, integer, integer, integer) IS
  'Fixed-window counter for the public AI endpoints: per visitor (hashed IP) and per instance per hour. Service role only. See _shared/rate-limit.ts.';
