-- The inbound mailbox follows the connection.
--
-- Connecting Gmail through Composio IS the intent "replies should land in
-- FlowWink", yet the router row (`inbound_email_accounts`), the webhook
-- subscription and the GMAIL_NEW_GMAIL_MESSAGE trigger needed two more clicks
-- on another page. composio-proxy now registers all three by itself: from the
-- admin UI the moment an ACTIVE Gmail account is shown, and from this cron's
-- `gmail_reconcile` poll, so a headless instance catches up within one tick.
--
-- That second path needs this gate to open. Until now `run_gmail_reconcile()`
-- skipped unless an ENABLED mailbox already existed — exactly the state the
-- poll is now meant to create. So the poll also runs when the Composio
-- integration is switched on (`site_settings.integrations.composio.enabled`,
-- the same opt-in email-send gates on). Cost on an instance with Composio on
-- but no Gmail connected: one quick "Gmail not connected" 400 per tick, no
-- Composio tool call. Everything else — vault/cron key lookup, fixed poll shape,
-- anon caller — is unchanged from 20260802190000.

CREATE OR REPLACE FUNCTION public.run_gmail_reconcile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
DECLARE
  v_url text;
  v_key text;
  v_enabled boolean;
  v_key_source text := 'vault';
BEGIN
  -- An enabled mailbox, OR Composio switched on (the mailbox is then what the
  -- poll registers on its first run).
  SELECT EXISTS (
    SELECT 1 FROM public.inbound_email_accounts
    WHERE enabled = true AND composio_account_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.site_settings
    WHERE key = 'integrations'
      AND COALESCE((value -> 'composio' ->> 'enabled')::boolean, false)
  ) INTO v_enabled;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object('skipped', 'no enabled composio mailbox and composio integration off');
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_url := NULL; v_key := NULL;
  END;

  IF v_url IS NULL THEN
    SELECT substring(command from 'https://[a-z0-9]+\.supabase\.co')
      INTO v_url
      FROM cron.job
     WHERE command LIKE '%functions/v1/%'
     LIMIT 1;
  END IF;

  -- New publishable format first: it is what SUPABASE_ANON_KEY resolves to
  -- inside an edge function, and therefore what composio-proxy compares against.
  IF v_key IS NULL THEN
    v_key_source := 'cron:sb_';
    SELECT substring(command from 'Bearer (sb_[A-Za-z0-9_\-]+)')
      INTO v_key
      FROM cron.job
     WHERE command LIKE '%Bearer sb\_%'
     LIMIT 1;
  END IF;

  -- Legacy JWT only if no sb_ key exists anywhere — an older instance that has
  -- not been migrated will still have a matching env var on its side.
  IF v_key IS NULL THEN
    v_key_source := 'cron:ey';
    SELECT substring(command from 'Bearer (ey[A-Za-z0-9_.\-]+)')
      INTO v_key
      FROM cron.job
     WHERE command LIKE '%Bearer ey%'
     LIMIT 1;
  END IF;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no supabase url/key available for reconcile');
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/composio-proxy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'action', 'gmail_reconcile',
      'entity_id', 'default',
      -- Sent for older deployments that still read them. A current composio-proxy
      -- pins the poll's shape server-side for an anon caller and ignores these,
      -- because that key is public and a caller-chosen query turns the response
      -- count into a search oracle over the mailbox.
      'params', jsonb_build_object('max_results', 15, 'query', 'in:inbox newer_than:1d')
    ),
    timeout_milliseconds := 30000
  );

  -- Dispatched is NOT delivered: net.http_post is fire-and-forget, so this says
  -- the request left, never that it was accepted. Naming the key and its source
  -- is what makes the difference diagnosable from the run log.
  RETURN jsonb_build_object(
    'dispatched', true,
    'key_source', v_key_source,
    'key_format', CASE WHEN v_key LIKE 'sb\_%' THEN 'sb_' ELSE 'ey' END,
    'at', now()
  );
END;
$function$;

COMMENT ON FUNCTION public.run_gmail_reconcile() IS
  'Polls the company mailbox via composio-proxy as a fallback for Composio push, '
  'which arrives in bursts with observed gaps up to 12h. Runs when an enabled '
  'mailbox exists OR the Composio integration is on — composio-proxy registers '
  'the mailbox itself on the first poll. Returns key_source and key_format '
  'because the anon key exists in two formats across the fleet and a mismatch '
  'surfaces only as a 401 in net._http_response, which nothing reads.';

-- Same audience as before: pg_cron (postgres) and service_role, nobody else.
REVOKE ALL ON FUNCTION public.run_gmail_reconcile() FROM public;
GRANT EXECUTE ON FUNCTION public.run_gmail_reconcile() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_gmail_reconcile() TO postgres;
