-- Listan kom före vakten.
--
-- Processtestet 2026-09-17 (lokal stack, bekräftat mot optic): fyra SECURITY
-- DEFINER-funktioner har en vakt — men deras `list`-gren returnerar INNAN den.
-- Med bara den publika nyckeln gav /rest/v1/rpc/manage_equipment {"p_action":
-- "list"} hela utrustningsregistret (serienummer, platser); samma för
-- manage_maintenance_request, manage_budget och manage_approval_delegation.
-- Tabellerna själva nekar anon (42501) — funktionen gick runt dem.
--
-- Samma svep: fem personalåtgärder utan vakt som varje inloggad portalkund kan
-- köra (record_pos_sale_v2, close_pos_session, close_pos_session_v2,
-- receive_return, propose_annual_depreciation). anon hade redan dragits in; det
-- räcker inte — portalkunder är authenticated.
--
-- Fix: samma injektion som 20260917090000 — en vakt överst i den LEVANDE kroppen,
-- idempotent med markör, och anon återkallad. Läsvakten är modulen i rollmatrisen,
-- samma modul som funktionens egen skrivvakt redan namnger.

DO $b$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY['manage_equipment','manage_maintenance_request','manage_budget',
         'manage_approval_delegation','record_pos_sale_v2','close_pos_session','close_pos_session_v2',
         'receive_return','propose_annual_depreciation'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $b$;

DO $c$
DECLARE
  g record; f record; v_def text; v_pos int; v_guard text;
  v_marker constant text := '-- staff-guard 20260917100000';
BEGIN
  FOR g IN
    SELECT * FROM (VALUES
      ('manage_equipment',            'maintenance', 'Reading equipment requires the maintenance module'),
      ('manage_maintenance_request',  'maintenance', 'Reading maintenance requests requires the maintenance module'),
      ('manage_budget',               'accounting',  'Reading budgets requires the accounting module'),
      ('manage_approval_delegation',  'approvals',   'Reading approval delegations requires the approvals module'),
      ('record_pos_sale_v2',          'pos',         'Recording a POS sale requires the POS module'),
      ('close_pos_session',           'pos',         'Closing a POS session requires the POS module'),
      ('close_pos_session_v2',        'pos',         'Closing a POS session requires the POS module'),
      ('receive_return',              'returns',     'Receiving a return requires the returns module'),
      ('propose_annual_depreciation', 'fixedAssets', 'Depreciation proposals require the fixed assets module')
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
      -- The four managers keep their own writer rule for writes; only reading
      -- needs the new check, so it guards the whole body and the writer rule
      -- stays as the stricter second gate.
      v_guard := format(E'  %s\n  IF NOT (auth.role() = ''service_role'' OR public.has_role(auth.uid(), ''admin''::public.app_role) OR public.can_access_module(auth.uid(), %L)) THEN\n    RAISE EXCEPTION %L USING ERRCODE = ''42501'';\n  END IF;\n',
        v_marker, g.module_id, g.message);
      v_pos := position(E'\nbegin\n' IN lower(v_def));
      IF v_pos = 0 THEN
        RAISE EXCEPTION 'staff guard: no top-level BEGIN found in %', f.oid::regprocedure;
      END IF;
      v_def := substr(v_def, 1, v_pos + 6) || v_guard || substr(v_def, v_pos + 7);
      EXECUTE v_def;
    END LOOP;
  END LOOP;
END $c$;

DO $proof$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
     AND p.proname IN ('manage_equipment','manage_maintenance_request','manage_budget','manage_approval_delegation',
                       'record_pos_sale_v2','close_pos_session','close_pos_session_v2','receive_return','propose_annual_depreciation')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR position('-- staff-guard 20260917100000' IN pg_get_functiondef(p.oid)) = 0);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'still open or unguarded: %', v_bad;
  END IF;
END $proof$;
