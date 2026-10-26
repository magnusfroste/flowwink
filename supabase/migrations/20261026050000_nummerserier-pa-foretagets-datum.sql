-- Nummerserier på företagets datum (andra genomgången, 2026-10-26).
--
-- 20261026020000 flyttade CURRENT_DATE och created_at::date till företagets
-- kalender men missade to_char(now(), …): RFQ-, MO-, PO- och returnummer tog
-- år och dag från UTC, så ett nummer skapat 00:30 på nyårsdagen i Stockholm
-- hamnade i förra årets serie. Samma självupptäckande omskrivning: varje
-- funktion och varje kolumndefault som formaterar now() direkt läser nu
-- now() på företagets klocka. Idempotent — det omskrivna mönstret matchar
-- inte längre.

DO $$
DECLARE
  r record;
  v_def text;
  v_new text;
  v_pat constant text := 'to_char\(\s*now\(\)\s*,';
  v_rep constant text := 'to_char(now() AT TIME ZONE public.business_timezone(),';
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname <> 'business_timezone'
      AND pg_get_functiondef(p.oid) ~* v_pat
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, v_pat, v_rep, 'gi');
    IF v_new <> v_def THEN EXECUTE v_new; END IF;
  END LOOP;

  FOR r IN
    SELECT table_name, column_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default ~* v_pat
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT %s',
      r.table_name, r.column_name, regexp_replace(r.column_default, v_pat, v_rep, 'gi'));
  END LOOP;
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE v_fn int; v_col int;
BEGIN
  SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND pg_get_functiondef(p.oid) ~* 'to_char\(\s*now\(\)\s*,';
  SELECT count(*) INTO v_col FROM information_schema.columns
  WHERE table_schema = 'public' AND column_default ~* 'to_char\(\s*now\(\)\s*,';
  IF v_fn + v_col > 0 THEN
    RAISE EXCEPTION 'numbering: % function(s) and % default(s) still read now() on the UTC calendar', v_fn, v_col;
  END IF;
END $$;
