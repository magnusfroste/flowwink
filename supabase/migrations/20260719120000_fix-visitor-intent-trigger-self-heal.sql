-- visitor-intent lead trigger self-heal (latent fleet incident, found 2026-07-17).
--
-- Migration 20260704152107 (Lovable, rzhj) created trigger_score_visitor_intent()
-- with dev's project URL AND dev's anon key HARDCODED in the function body. The
-- follow-up 20260704170000 shipped register_visitor_intent_trigger(url, key) to
-- rebuild it per-instance — but that registrar is PROVISIONING-OPT-IN, never
-- self-invoked. So every fleet instance that wasn't manually re-registered still
-- has dev's URL/key baked in: each lead insert/update POSTs the lead id to DEV's
-- score-visitor-intent endpoint with DEV's key (cross-instance leakage + load on
-- dev), never its own. Exact analog of the newsletter-cron incident (3d38362a).
--
-- Self-healing fix (same mechanism as the newsletter fix): read THIS instance's
-- own base URL + anon key from the always-self-referential `knowledge-indexer`
-- cron job, then call the existing registrar with them. No hardcoded URL, so it
-- corrects every instance without knowing its own ref. On dev the extracted
-- values equal the already-self-pointing body → harmless no-op. Idempotent +
-- forward-dated (a back-dated file is silently skipped by managed migrate
-- ledgers). Unlike the silent original, the skip paths RAISE NOTICE so a missing
-- source is visible in the migrate log instead of leaving a quiet stale trigger.
DO $fix$
DECLARE
  v_cmd      text;
  v_base_url text;
  v_anon     text;
BEGIN
  -- Registrar must exist (shipped by 20260704170000); if not, nothing to call.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'register_visitor_intent_trigger'
  ) THEN
    RAISE NOTICE 'visitor-intent self-heal skipped: register_visitor_intent_trigger() not found';
    RETURN;
  END IF;

  -- The knowledge-indexer cron command is the self-referential source of truth
  -- (own host + own anon key). If it is absent (retrieval engine not deployed
  -- on this instance), we cannot derive the self URL — skip loudly.
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'knowledge-indexer';
  IF v_cmd IS NULL THEN
    RAISE NOTICE 'visitor-intent self-heal skipped: knowledge-indexer cron job not found (cannot derive self URL)';
    RETURN;
  END IF;

  v_base_url := substring(v_cmd from 'https://[a-z0-9]+\.supabase\.co');
  v_anon     := substring(v_cmd from 'Bearer ([A-Za-z0-9._\-]+)');

  IF v_base_url IS NULL OR v_anon IS NULL THEN
    RAISE NOTICE 'visitor-intent self-heal skipped: could not parse url/key from knowledge-indexer command';
    RETURN;
  END IF;

  -- Rebuild trigger_score_visitor_intent() with THIS instance's url/key.
  PERFORM public.register_visitor_intent_trigger(v_base_url, v_anon);
  RAISE NOTICE 'visitor-intent trigger re-registered to self (%).', v_base_url;
END
$fix$;
