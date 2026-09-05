-- Vaulten behöver båda nycklarna.
--
-- lane_has_work('automation') lät dispatchern pulsa när vaulten saknade
-- SUPABASE_URL, men inte när den saknade SUPABASE_SERVICE_ROLE_KEY — som
-- dispatchern (sedan #489) seedar på samma sätt. En tyst instans utan
-- förfallna automationer skulle aldrig pulsa, och nyckeln aldrig komma.
-- Kroppen är 20260906170000:s med ett enda ändrat villkor.

CREATE OR REPLACE FUNCTION public.lane_has_work(p_lane text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v boolean := false;
  v_vault_missing boolean := false;
BEGIN
  IF p_lane = 'event' THEN
    RETURN EXISTS (SELECT 1 FROM public.agent_events WHERE processed_at IS NULL);

  ELSIF p_lane = 'automation' THEN
    -- Samma tre frågor dispatchern själv ställer, plus vaultens födelsevillkor
    -- (ensure_platform_secret körs av dispatchern; utan URL i vaulten måste
    -- den få köra).
    -- Both platform secrets: the dispatcher seeds them at the top of every
    -- run, and the SQL-side dispatchers need the service key to call edge
    -- functions with authority. A quiet instance whose lane never pulsed would
    -- otherwise keep an empty vault forever (new liteit, 2026-09-05).
    IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
      EXECUTE 'SELECT (SELECT count(*) FROM vault.decrypted_secrets WHERE name IN ($1, $2)) < 2'
        INTO v_vault_missing USING 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY';
    END IF;
    IF v_vault_missing THEN RETURN true; END IF;

    IF EXISTS (SELECT 1 FROM public.agent_automations
               WHERE enabled AND trigger_type = 'cron'
                 AND (next_run_at IS NULL OR next_run_at <= now())) THEN
      RETURN true;
    END IF;
    IF EXISTS (SELECT 1 FROM public.agent_workflows
               WHERE enabled AND trigger_type = 'cron'
                 AND (next_run_at IS NULL OR next_run_at <= now())) THEN
      RETURN true;
    END IF;
    IF to_regclass('public.agent_tasks') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.agent_tasks WHERE status = $1 AND due_at <= now())'
        INTO v USING 'pending';
    END IF;
    RETURN v;

  ELSIF p_lane = 'indexer' THEN
    IF EXISTS (SELECT 1 FROM public.knowledge_index_queue WHERE attempts < 5) THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM public.knowledge_chunks WHERE embedding IS NULL AND embedding_attempts < 5) THEN RETURN true; END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.documents
      WHERE (extraction_status = 'pending' AND file_url IS NOT NULL)
         OR (extraction_status = 'processing' AND updated_at < now() - interval '10 minutes')
    );

  ELSIF p_lane = 'newsletter' THEN
    RETURN EXISTS (SELECT 1 FROM public.newsletters WHERE status = 'scheduled' AND scheduled_at <= now());
  END IF;

  -- Okänd bana: hellre en onödig puls än en tyst kö.
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.lane_has_work(text) FROM PUBLIC, anon, authenticated;
