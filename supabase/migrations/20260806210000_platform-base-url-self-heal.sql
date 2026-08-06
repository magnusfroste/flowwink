-- The event rail was dead on every instance in the fleet, silently.
--
-- dispatch_automation_event is how the DATABASE emits events: 16 functions
-- call it after an invoice registers, an email lands, a work order completes.
-- It reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from vault.decrypted_secrets
-- to build the pg_net call — and vault.secrets is EMPTY on all five instances.
-- Nothing ever seeded it; migrations can't (the URL differs per instance) and
-- no bootstrap step did. So every trigger-born event hit
-- `RAISE WARNING ... RETURN` and vanished into the Postgres log nobody reads.
--
-- Three closures, in order of what actually prevents recurrence:
--
-- 1. The layer that KNOWS the value writes it. An edge function has
--    Deno.env.get('SUPABASE_URL') by definition; the database does not.
--    ensure_platform_secret() lets the edge layer push it down, and
--    automation-dispatcher (already on a per-minute cron on every instance)
--    calls it. A fresh install self-heals within a minute of its first cron
--    tick — no runbook step to forget.
--
-- 2. The service key is no longer required. All four dispatch targets
--    (send-webhook, signal-dispatcher, event-dispatcher, automation-dispatcher)
--    are deployed verify_jwt=false, so the Authorization header was never what
--    made the call work — it was just a second thing that had to be present for
--    the function to proceed. Now it's sent when available and omitted when not,
--    which means a missing key degrades nothing.
--
-- 3. The failure is observable. A silent RETURN is what let this live for
--    months; platform_dispatch_failures records every skipped emit so
--    instance-health can see a dead rail instead of an empty one.

-- ─── Resolve the base URL ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._platform_base_url()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT rtrim(decrypted_secret, '/')
  FROM vault.decrypted_secrets
  WHERE name IN ('SUPABASE_URL', 'PROJECT_URL')
    AND decrypted_secret ~ '^https?://'
  ORDER BY (name = 'SUPABASE_URL') DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._platform_base_url() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._platform_base_url() TO service_role;

-- ─── Let the edge layer push config down into the database ──────────────────
-- Idempotent: same value = no write, changed value = update, missing = create.
CREATE OR REPLACE FUNCTION public.ensure_platform_secret(p_name text, p_value text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
  v_current text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only the service role or an admin can set platform secrets';
  END IF;
  IF p_name IS NULL OR trim(p_name) = '' OR p_value IS NULL OR trim(p_value) = '' THEN
    RETURN jsonb_build_object('error', 'p_name and p_value are both required');
  END IF;

  SELECT id, decrypted_secret INTO v_id, v_current
  FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, p_name, 'Platform config, written by the edge layer');
    RETURN jsonb_build_object('name', p_name, 'action', 'created');
  ELSIF v_current IS DISTINCT FROM p_value THEN
    PERFORM vault.update_secret(v_id, p_value);
    RETURN jsonb_build_object('name', p_name, 'action', 'updated');
  END IF;
  RETURN jsonb_build_object('name', p_name, 'action', 'unchanged');
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_platform_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_platform_secret(text, text) TO service_role;

-- ─── Make the silence audible ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_dispatch_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text,
  signal_name text,
  entity_type text,
  entity_id text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_dispatch_failures_created
  ON public.platform_dispatch_failures (created_at DESC);

ALTER TABLE public.platform_dispatch_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read dispatch failures" ON public.platform_dispatch_failures;
CREATE POLICY "Admins read dispatch failures" ON public.platform_dispatch_failures
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- ─── The emit itself ────────────────────────────────────────────────────────
-- CREATE OR REPLACE cannot drop the existing defaults, so the old signature has
-- to go first. The defaults are preserved below — 16 callers pass three args.
DROP FUNCTION IF EXISTS public.dispatch_automation_event(text, text, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.dispatch_automation_event(
  event_name text,
  signal_name text,
  payload jsonb,
  entity_type text DEFAULT NULL,
  entity_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url text;
  v_key text;
  v_headers jsonb;
BEGIN
  v_url := public._platform_base_url();

  IF v_url IS NULL THEN
    -- Never raise: this runs inside the business transaction that emitted the
    -- event, and a missing webhook URL must not roll back an invoice. Record it
    -- instead, so a dead rail is visible rather than merely quiet.
    INSERT INTO public.platform_dispatch_failures
      (event_name, signal_name, entity_type, entity_id, reason)
    VALUES (event_name, signal_name, entity_type, entity_id,
            'No platform base URL — vault has no SUPABASE_URL. The edge layer seeds it via ensure_platform_secret(); check that automation-dispatcher is deployed and running on cron.');
    RAISE WARNING 'dispatch_automation_event: no platform base URL configured';
    RETURN;
  END IF;

  -- The dispatch targets are all verify_jwt=false, so the key is optional.
  -- Sent when present (defence in depth if a target is ever gated), omitted
  -- when not — a missing key must not stop the rail.
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  v_headers := jsonb_build_object('Content-Type', 'application/json');
  IF v_key IS NOT NULL AND trim(v_key) <> '' THEN
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_key);
  END IF;

  IF event_name IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/send-webhook',
      headers := v_headers,
      body := jsonb_build_object('event', event_name, 'data', payload)
    );
  END IF;

  IF signal_name IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/signal-dispatcher',
      headers := v_headers,
      body := jsonb_build_object(
        'signal', signal_name,
        'data', payload,
        'context', jsonb_build_object(
          'entity_type', COALESCE(entity_type, 'unknown'),
          'entity_id', COALESCE(entity_id, '')
        )
      )
    );
  END IF;
END;
$$;
