-- Combined deploy: comms-send cron repoint (B2), flowpilot-lifecycle cron repoint (B5),
-- auth user-created trigger backfill, and instance_sync_status v2 (name-match).

-- 1) B2: repoint comms-send cron jobs
DO $$
DECLARE r RECORD; new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN
      SELECT jobid, jobname, schedule, command FROM cron.job
       WHERE command LIKE '%/functions/v1/send-booking-reminders%'
          OR command LIKE '%/functions/v1/send-calendar-reminders%'
          OR command LIKE '%/functions/v1/csat-dispatch%'
          OR command LIKE '%/functions/v1/send-webinar-reminders%'
          OR command LIKE '%/functions/v1/survey-send%'
          OR command LIKE '%/functions/v1/send-order-confirmation%'
    LOOP
      new_cmd := replace(replace(replace(replace(replace(replace(r.command,
        '/functions/v1/send-booking-reminders',  '/functions/v1/comms-send?kind=booking_reminders'),
        '/functions/v1/send-calendar-reminders', '/functions/v1/comms-send?kind=calendar_reminders'),
        '/functions/v1/csat-dispatch',           '/functions/v1/comms-send?kind=csat_dispatch'),
        '/functions/v1/send-webinar-reminders',  '/functions/v1/comms-send?kind=webinar_reminders'),
        '/functions/v1/survey-send',             '/functions/v1/comms-send?kind=survey_send'),
        '/functions/v1/send-order-confirmation', '/functions/v1/comms-send?kind=order_confirmation');
      PERFORM cron.unschedule(r.jobid);
      PERFORM cron.schedule(r.jobname, r.schedule, new_cmd);
    END LOOP;
  END IF;
END $$;

-- 2) B5: repoint flowpilot-lifecycle and cron-health cron jobs
DO $$
DECLARE r RECORD; new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN
      SELECT jobid, jobname, schedule, command FROM cron.job
       WHERE command LIKE '%/functions/v1/flowpilot-learn%'
          OR command LIKE '%/functions/v1/flowpilot-followthrough%'
          OR command LIKE '%/functions/v1/flowpilot-briefing%'
          OR command LIKE '%/functions/v1/flowpilot-distill%'
          OR command LIKE '%/functions/v1/skill-curator%'
          OR command LIKE '%/functions/v1/cron-health%'
    LOOP
      new_cmd := replace(replace(replace(replace(replace(replace(r.command,
        '/functions/v1/flowpilot-learn',         '/functions/v1/flowpilot-lifecycle?task=learn'),
        '/functions/v1/flowpilot-followthrough', '/functions/v1/flowpilot-lifecycle?task=followthrough'),
        '/functions/v1/flowpilot-briefing',      '/functions/v1/flowpilot-lifecycle?task=briefing'),
        '/functions/v1/flowpilot-distill',       '/functions/v1/flowpilot-lifecycle?task=distill'),
        '/functions/v1/skill-curator',           '/functions/v1/flowpilot-lifecycle?task=curator'),
        '/functions/v1/cron-health',             '/functions/v1/instance-health?check=cron');
      PERFORM cron.unschedule(r.jobid);
      PERFORM cron.schedule(r.jobname, r.schedule, new_cmd);
    END LOOP;
  END IF;
END $$;

-- 3) auth.users trigger + backfill
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'auth' AND c.relname = 'users'
       AND NOT t.tgisinternal
       AND t.tgfoid = 'public.handle_new_user'::regproc
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data ->> 'full_name', u.email)
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
       CASE COALESCE(u.raw_user_meta_data ->> 'signup_type', 'admin')
         WHEN 'customer' THEN 'customer'::app_role
         WHEN 'admin'    THEN 'admin'::app_role
         ELSE 'writer'::app_role
       END
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT (user_id, role) DO NOTHING;

-- 4) instance_sync_status() v2 — name-match
CREATE OR REPLACE FUNCTION public.instance_sync_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, supabase_migrations
AS $fn$
DECLARE
  v_migration_head  text;
  v_migrations_cnt  bigint;
  v_applied         jsonb := '[]'::jsonb;
  v_skills_total    bigint;
  v_skills_enabled  bigint;
  v_skills_updated  timestamptz;
  v_stamp           jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'instance_sync_status: admin or service_role required';
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    BEGIN
      SELECT max(version), count(*) INTO v_migration_head, v_migrations_cnt
      FROM supabase_migrations.schema_migrations;

      SELECT coalesce(jsonb_agg(jsonb_build_object('version', m.version, 'name', m.name)), '[]'::jsonb)
      INTO v_applied
      FROM (
        SELECT version, name
        FROM supabase_migrations.schema_migrations
        ORDER BY version DESC
        LIMIT 800
      ) m;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'instance_sync_status: ledger read failed (%).', SQLERRM;
    END;
  END IF;

  IF to_regclass('public.agent_skills') IS NOT NULL THEN
    SELECT count(*), count(*) FILTER (WHERE enabled), max(updated_at)
    INTO v_skills_total, v_skills_enabled, v_skills_updated
    FROM public.agent_skills;
  END IF;

  SELECT value INTO v_stamp FROM public.site_settings WHERE key = 'instance_manifest_stamp';

  RETURN jsonb_build_object(
    'checked_at', now(),
    'schema', jsonb_build_object(
      'migration_head', v_migration_head,
      'migrations_count', v_migrations_cnt,
      'applied', v_applied
    ),
    'skills', jsonb_build_object(
      'total', v_skills_total,
      'enabled', v_skills_enabled,
      'last_updated_at', v_skills_updated,
      'stamp', v_stamp
    )
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.instance_sync_status() TO anon, authenticated, service_role;