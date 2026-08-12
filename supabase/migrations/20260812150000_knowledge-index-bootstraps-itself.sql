-- The knowledge index bootstraps itself — no first manual call required.
--
-- CATCH-22 FOUND LIVE (www.flowwink.com, 2026-08-12). The knowledge indexer
-- registers its own cron job on its first run (`register_knowledge_indexer_cron`
-- inside the edge function). On a CLI-free install NOBODY makes that first
-- call, so:
--   • the cron job never exists,
--   • the queue fills (156 rows waiting) and is never drained,
--   • knowledge_chunks stays EMPTY,
--   • and the visitor chat answers with zero grounding — it invented seven
--     "process pages" that do not exist on the site.
-- A self-registering cron that only registers when it runs cannot start.
--
-- It cascaded: `20260718090000_fix-newsletter-cron-self-reference.sql` rebuilds
-- the newsletter cron command from the knowledge-indexer job's command (a
-- clever way to get the instance's own URL without hardcoding it). With no
-- indexer job, that fix was a silent no-op — so the newsletter cron kept DEV's
-- hardcoded URL and every fresh instance POSTed its scheduled newsletters at
-- dev.flowwink.com. One missing job, two broken subsystems, zero errors.
--
-- The fix: register the job from SQL, deriving this instance's own URL and key
-- from a cron job that already points at it. Every FlowWink instance has at
-- least one (flowpilot-heartbeat, automation-dispatcher, …) because those are
-- registered during setup. If none exists yet, this is a no-op and the edge
-- function's self-registration still covers the case — belt and braces, never
-- a gate (Law 4).
--
-- Idempotent: only schedules when the job is absent.
--
-- Placed AFTER the fresh-install finalizer on purpose. Pre-finalizer
-- migrations must leave their cron jobs quiesced (nothing may fire into a
-- half-built schema, and the finalizer switches everything on); a migration
-- that runs after it is past that window, so its job starts active — and must
-- NOT quiesce, or it would strand every job on a live instance. The
-- fresh-install-replay guardrail enforces both directions, and caught this
-- file on the wrong side of the line while it was being written.

DO $bootstrap$
DECLARE
  v_template text;
  v_command  text;
  v_url      text;
  v_headers  text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron not installed — skipping knowledge-indexer bootstrap.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'knowledge-indexer') THEN
    RAISE NOTICE 'knowledge-indexer cron already registered.';
    RETURN;
  END IF;

  -- Borrow the envelope (own host + own service headers) from any job that
  -- already calls a function on THIS instance. Ordered so the most stable
  -- platform jobs win; jobname is irrelevant beyond that.
  SELECT command INTO v_template
    FROM cron.job
   WHERE command LIKE '%/functions/v1/%'
     AND command LIKE '%net.http_post%'
   ORDER BY (jobname = 'flowpilot-heartbeat') DESC,
            (jobname = 'automation-dispatcher-every-minute') DESC,
            jobname
   LIMIT 1;

  IF v_template IS NULL THEN
    RAISE NOTICE 'No HTTP cron job to derive this instance URL from — knowledge-indexer will self-register on its first run.';
    RETURN;
  END IF;

  -- Take only the two parts that are instance-specific — the host and the
  -- auth headers — and BUILD the command, rather than patching the template's
  -- string. Patching looked simpler and produced a subtly wrong job in
  -- testing: templates differ in how they write the body (a literal in one,
  -- `concat(… now() …)` in another), so a body-rewrite regex tuned to one
  -- form silently leaves the other in place.
  v_url := substring(v_template from 'url\s*:=\s*''([^'']+)''');
  v_headers := substring(v_template from 'headers\s*:=\s*''([^'']+)''');

  IF v_url IS NULL OR v_headers IS NULL THEN
    RAISE NOTICE 'Could not parse url/headers from the template job — knowledge-indexer will self-register on its first run.';
    RETURN;
  END IF;

  v_url := regexp_replace(v_url, '/functions/v1/.*$', '/functions/v1/knowledge-indexer');

  v_command := format(
    'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source":"cron"}''::jsonb) AS request_id;',
    v_url,
    v_headers
  );

  PERFORM cron.schedule('knowledge-indexer', '*/5 * * * *', v_command);
  RAISE NOTICE 'knowledge-indexer cron registered (every 5 minutes).';
END $bootstrap$;

-- Seed the queue with everything already in the instance. The original
-- retrieval migration did this too, but it ran on an EMPTY database — the
-- content arrives later, when a template is installed. The reindex triggers
-- cover content created after this point; this covers what is already there.
INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
SELECT 'pages', id::text, 'upsert' FROM public.pages
ON CONFLICT (source_table, entity_id) DO NOTHING;
INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
SELECT 'kb_articles', id::text, 'upsert' FROM public.kb_articles
ON CONFLICT (source_table, entity_id) DO NOTHING;
INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
SELECT 'wiki_pages', slug, 'upsert' FROM public.wiki_pages
ON CONFLICT (source_table, entity_id) DO NOTHING;

DO $seed$
DECLARE v_queued int;
BEGIN
  SELECT count(*) INTO v_queued FROM public.knowledge_index_queue;
  RAISE NOTICE 'Knowledge index queue holds % item(s) for the next sweep.', v_queued;
END $seed$;
