-- Funktioner föds inte längre anropbara för en anonym besökare.
--
-- FYND (2026-09-17, alla sju instanser vi når): 30 SECURITY DEFINER-funktioner
-- utan vakt i kroppen var körbara för rollen `anon` — den publika nyckeln som
-- ligger i varje besökares webbläsare. Bland dem refund_return,
-- approve_expense_report, mark_expense_report_paid (bokför), receive_purchase_order,
-- record_pos_sale, merge_leads, grni_reconciliation (läser huvudboken) och
-- create_webmeet_room (behöver inte ens ett id).
--
-- ORSAK: augustisvepet (20260822020000) återkallade EXECUTE från PUBLIC — men
-- Supabases default-privilegier i schemat public ger `anon` EXECUTE UTTRYCKLIGEN
-- på varje ny funktion (pg_default_acl: anon=X/postgres). Allt som skapats eller
-- återskapats efter svepet föddes öppet, och svepet själv missade några.
-- Minnesanteckningen från samma kväll sa det redan: revoken måste namnge anon.
--
-- TRE DELAR
--   A. Default-privilegierna: nya funktioner i public föds UTAN anon-EXECUTE.
--      Den avsedda publika ytan är nu opt-in: GRANT EXECUTE ... TO anon.
--   B. anon återkallas på de 30. Varje anropare är admin-UI (authenticated),
--      edge-funktioner (service_role) eller triggers som personal utlöser —
--      verifierat mot src/, supabase/functions/, pg_policies, vyer och
--      kolumn-defaults. Ingen publik sida anropar någon av dem.
--   C. Femton skrivande personalåtgärder får en vakt i kroppen. Att dra in anon
--      räcker inte: varje inloggad portalkund är `authenticated`. Vakten följer
--      syskonens mönster (inspect_return, pay_vendor_invoice, refund_pos_sale):
--      service_role ELLER modulen i rollmatrisen. Den injiceras i den LIVE
--      definitionen, så varje instans behåller sin egen kropp; en markör gör det
--      idempotent.
--
-- generate_monthly_expense_report är en självservice: den anställde får göra
-- sin egen rapport, personal med expenses-modulen vem som helst. Dess fel
-- "No user_id available" säger nu vad en agent ska skicka.

-- ── A ────────────────────────────────────────────────────────────────────────
-- Two entries decide what a new function is born with. The schema-level one
-- (IN SCHEMA public) can only ADD grants; the built-in EXECUTE for PUBLIC — which
-- anon inherits — is removed only by the GLOBAL entry, without IN SCHEMA. The
-- August sweep wrote the schema-level REVOKE FROM PUBLIC, which is a no-op.
-- Every function this repo creates lives in public (1 061 of 1 061), where the
-- schema entry still grants authenticated and service_role explicitly.
DO $a$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'default privileges for postgres not changed (%)', SQLERRM;
END $a$;

DO $a2$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon';
EXCEPTION WHEN OTHERS THEN
  -- Migrations run as postgres, which may not alter supabase_admin's defaults.
  -- Functions this repo creates are owned by postgres, so A above is the one that matters.
  RAISE NOTICE 'default privileges for supabase_admin not changed (%)', SQLERRM;
END $a2$;

-- ── B ────────────────────────────────────────────────────────────────────────
DO $b$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY[
         'account_for','approve_expense_report','approve_return','auto_approve_vendor_invoice',
         'award_rfq','confirm_pick','consume_order_stock','consume_stock_fefo','create_webmeet_room',
         'evaluate_approval_required','fefo_suggest_lot','generate_monthly_expense_report',
         'get_expense_rate','grni_reconciliation','invoice_outstanding','list_reorder_candidates',
         'log_cache_invalidation','log_migration_run','mark_expense_report_paid','match_consultants','merge_leads',
         'next_document_number','next_mo_number','open_pos_session','pick_vendor_price',
         'receive_purchase_order','record_pos_sale','refund_return','reorder_preferred_vendor',
         'request_entity_approval'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $b$;

-- ── C ────────────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  g record;
  f record;
  v_def text;
  v_pos int;
  v_guard text;
  v_marker constant text := '-- staff-guard 20260917090000';
BEGIN
  FOR g IN
    SELECT * FROM (VALUES
      ('approve_expense_report',      'expenses',    'Approving an expense report requires the expenses module'),
      ('mark_expense_report_paid',    'expenses',    'Paying an expense report requires the expenses module'),
      ('approve_return',              'returns',     'Approving a return requires the returns module'),
      ('refund_return',               'returns',     'Refunding a return requires the returns module'),
      ('auto_approve_vendor_invoice', 'purchasing',  'Approving a vendor invoice requires the purchasing module'),
      ('award_rfq',                   'purchasing',  'Awarding an RFQ requires the purchasing module'),
      ('receive_purchase_order',      'purchasing',  'Receiving goods requires the purchasing module'),
      ('confirm_pick',                'inventory',   'Confirming a pick requires the inventory module'),
      ('merge_leads',                 'leads',       'Merging leads requires the leads module'),
      ('open_pos_session',            'pos',         'Opening a POS session requires the POS module'),
      ('record_pos_sale',             'pos',         'Recording a POS sale requires the POS module'),
      ('create_webmeet_room',         'webmeet',     'Creating a meeting room requires the webmeet module'),
      ('grni_reconciliation',         'accounting',  'The GRNI reconciliation requires the accounting module'),
      ('log_migration_run',           '-admin-',     'Only admins can log migration runs'),
      ('generate_monthly_expense_report', '-self-',  'You can generate your own expense report; other people''s require the expenses module')
    ) AS t(fn, module_id, message)
  LOOP
    FOR f IN
      SELECT p.oid FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
       WHERE n.nspname = 'public' AND p.proname = g.fn AND l.lanname = 'plpgsql'
    LOOP
      v_def := pg_get_functiondef(f.oid);
      CONTINUE WHEN position(v_marker IN v_def) > 0;

      v_guard := CASE g.module_id
        WHEN '-admin-' THEN
          format(E'  %s\n  IF NOT (auth.role() = ''service_role'' OR public.has_role(auth.uid(), ''admin''::public.app_role)) THEN\n    RAISE EXCEPTION %L USING ERRCODE = ''42501'';\n  END IF;\n', v_marker, g.message)
        WHEN '-self-' THEN
          format(E'  %s\n  IF NOT (auth.role() = ''service_role''\n          OR (auth.uid() IS NOT NULL AND (p_user_id IS NULL OR p_user_id = auth.uid()))\n          OR public.can_access_module(auth.uid(), ''expenses'')) THEN\n    RAISE EXCEPTION %L USING ERRCODE = ''42501'';\n  END IF;\n', v_marker, g.message)
        ELSE
          format(E'  %s\n  IF NOT (auth.role() = ''service_role'' OR public.can_access_module(auth.uid(), %L)) THEN\n    RAISE EXCEPTION %L USING ERRCODE = ''42501'';\n  END IF;\n', v_marker, g.module_id, g.message)
      END;

      -- The body's top-level BEGIN: pg_get_functiondef prints it on its own line.
      v_pos := position(E'\nbegin\n' IN lower(v_def));
      IF v_pos = 0 THEN
        RAISE EXCEPTION 'staff guard: no top-level BEGIN found in %', f.oid::regprocedure;
      END IF;
      v_def := substr(v_def, 1, v_pos + length(E'\nBEGIN\n') - 1) || v_guard || substr(v_def, v_pos + length(E'\nBEGIN\n'));

      IF g.fn = 'generate_monthly_expense_report' THEN
        v_def := replace(v_def, '''No user_id available''',
          '''user_id is required when no user is signed in — an agent or service call must pass user_id''');
      END IF;

      EXECUTE v_def;
    END LOOP;
  END LOOP;
END $c$;

-- ── Bevisar sig själv ────────────────────────────────────────────────────────
DO $proof$
DECLARE v_open text; v_unguarded text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('refund_return','approve_expense_report','mark_expense_report_paid','receive_purchase_order',
                       'record_pos_sale','merge_leads','grni_reconciliation','create_webmeet_room','log_migration_run')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'still executable by anon: %', v_open;
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_unguarded
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
     AND p.proname IN ('approve_expense_report','mark_expense_report_paid','approve_return','refund_return',
                       'auto_approve_vendor_invoice','award_rfq','receive_purchase_order','confirm_pick','merge_leads',
                       'open_pos_session','record_pos_sale','create_webmeet_room','grni_reconciliation',
                       'log_migration_run','generate_monthly_expense_report')
     AND position('-- staff-guard 20260917090000' IN pg_get_functiondef(p.oid)) = 0;
  IF v_unguarded IS NOT NULL THEN
    RAISE EXCEPTION 'staff guard missing on: %', v_unguarded;
  END IF;

  -- A function created now must be born closed to anon — when this migration
  -- runs as postgres, which owns everything the repo creates.
  IF current_user = 'postgres' THEN
    CREATE FUNCTION public.zz_born_closed_probe() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'select 1';
    IF has_function_privilege('anon', 'public.zz_born_closed_probe()', 'EXECUTE') THEN
      DROP FUNCTION public.zz_born_closed_probe();
      RAISE EXCEPTION 'a new function is still born executable by anon';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.zz_born_closed_probe()', 'EXECUTE') THEN
      DROP FUNCTION public.zz_born_closed_probe();
      RAISE EXCEPTION 'a new function is no longer born executable by authenticated';
    END IF;
    DROP FUNCTION public.zz_born_closed_probe();
  END IF;
END $proof$;
