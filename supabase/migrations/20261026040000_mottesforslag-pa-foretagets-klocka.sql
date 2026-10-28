-- Mötesförslag på företagets klocka (andra genomgången, 2026-10-26).
--
-- meeting_polls.timezone och create-funktionens p_timezone defaultade till
-- 'UTC': ett förslag som skapades utan zon (agenten, eller ett formulär som
-- inte frågade) visade och bekräftade sina tider i UTC — 10:00 Stockholm som
-- 08:00. Kolumnen och funktionen läser nu företagets zon
-- (public.business_timezone(), samma källa som resten av databasen).
-- Självupptäckande: varje funktion vars kropp coalescar p_timezone till 'UTC'
-- skrivs om, så en senare omdefinition fångas av nästa körning.

DO $$
BEGIN
  IF to_regclass('public.meeting_polls') IS NOT NULL THEN
    ALTER TABLE public.meeting_polls ALTER COLUMN timezone SET DEFAULT public.business_timezone();
  END IF;
END $$;

DO $$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ 'COALESCE\(p_timezone,\s*''UTC''\)'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, 'COALESCE\(p_timezone,\s*''UTC''\)', 'COALESCE(p_timezone, public.business_timezone())', 'g');
    -- The parameter default must not answer before the COALESCE can.
    v_new := regexp_replace(v_new, 'p_timezone text DEFAULT ''UTC''::text', 'p_timezone text DEFAULT NULL::text', 'g');
    IF v_new <> v_def THEN
      EXECUTE v_new;
    END IF;
  END LOOP;
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~ 'COALESCE\(p_timezone,\s*''UTC''\)';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'meeting polls: % function(s) still default the zone to UTC', v_left;
  END IF;
END $$;
