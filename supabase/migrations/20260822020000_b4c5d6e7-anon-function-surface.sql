-- ─────────────────────────────────────────────────────────────────────────────
-- Anon-rollens FUNKTIONSyta — kartan, städningen och NULL-uid-läckorna
-- ─────────────────────────────────────────────────────────────────────────────
--
-- BAKGRUND
-- I Postgres får varje ny funktion `EXECUTE` till PUBLIC vid CREATE, om ingen
-- REVOKE görs. Supabase lägger dessutom en egen default-privilegie ovanpå som
-- ger `anon`, `authenticated` och `service_role` explicit EXECUTE i schemat
-- `public`. Följden: ALLT som någonsin skapats i public har varit körbart för
-- en anonym besökare via PostgREST:s `/rest/v1/rpc/<namn>`.
--
-- För vanliga SECURITY INVOKER-funktioner spelar det liten roll — RLS gäller
-- ändå. Men SECURITY DEFINER-funktioner kör som `postgres` och passerar RLS
-- rakt igenom. Där ÄR vakten i funktionskroppen den enda vakten. Saknas den
-- är funktionen en öppen dörr.
--
-- MÄTNING PÅ optic (2026-08-21): 695 funktioner i public, 589 SECURITY
-- DEFINER, varav 537 körbara för `anon`. Svepet delade dem i tre klasser:
--
--   (85 av de 537 är triggerfunktioner — de returnerar `trigger` och går inte
--    att anropa som RPC alls. De räknas inte i klasserna nedan.)
--
--   Klass 1 — AVSEDD PUBLIK yta (~45 st). Token- eller e-postgrindade läsare
--             och besökarskrivningar. Dokumenteras nedan, rörs INTE.
--   Klass 2 — INTERN men med egen vakt i kroppen (~296 st): `has_role()`,
--             `can_access_module()` eller `auth.uid() IS NULL`-som-NEKAN.
--             De failar closed för anon (NULL-uid ⇒ vakten faller). Låg risk,
--             städbara — men vi lämnar dem STÅENDE med en notering hellre än
--             att bryta något. En dubbelvakt kostar ingenting.
--   Klass 3 — INTERN UTAN VAKT (111 st). Det är fynden. De revokas här.
--
-- ── DEN AVSEDDA PUBLIKA YTAN (dokumenterad, orörd) ──────────────────────────
-- Verifierad genom att korsläsa mot faktiska anropare i src/pages/*,
-- src/components/public/* och src/components/chat/* (allt utanför admin/account):
--
--   Lead-/besökarfångst  ingest_form_lead, ingest_webinar_lead,
--                        register_for_webinar, capture_chat_lead,
--                        stitch_visitor_to_lead, submit_support_request
--   Sidleverans          get_page_translations, resolve_redirect,
--                        get_public_terms, get_experiment_variant,
--                        record_experiment_conversion, bump_kb_article_feedback,
--                        get_support_agent_user_id
--   Kassa                list_shipping_options, validate_discount_code,
--                        validate_address, estimate_delivery_date,
--                        select_shipping_carrier, resolve_pricelist_price
--   Order (e-postgrind)  lookup_order_tracking, get_order_status
--   Nyhetsbrev           confirm_newsletter_subscription, unsubscribe_newsletter,
--                        unsubscribe_newsletter_by_email
--   Offert (tokengrind)  get_public_quote, get_quote_by_token,
--                        get_quote_payment_status, set_quote_item_selection,
--                        get_quote_certificate
--   Avtal (tokengrind)   get_public_contract, get_contract_by_token,
--                        sign_contract_by_token, get_contract_certificate
--   Faktura (token)      get_invoice_by_token, mark_invoice_viewed_by_token
--   Enkät (token)        get_survey_by_token, submit_survey_response
--   Dokument (token)     resolve_document_share,
--                        resolve_document_signature_request,
--                        complete_document_signature
--
-- NOTERING (ej åtgärdad här, kräver eget beslut): `get_order_status(p_id,
-- p_email)` gör e-postkontrollen villkorad — `IF p_email IS NOT NULL AND …`.
-- Utelämnas e-posten hoppas grinden över helt. Order-id är en UUID, så det
-- är uppräkningsskydd genom gissningssvårighet snarare än en vakt. Att göra
-- p_email obligatorisk (som `lookup_order_tracking` redan gör) är rätt fix,
-- men den ändrar ett publikt kontrakt och hör inte hemma i ett REVOKE-svep.
--
-- ── DEL A: REVOKE på 111 klass-3-funktioner ─────────────────────────────────
-- Alla 111 är SECURITY DEFINER, saknar vakt i kroppen, och anropas i koden
-- ENBART från admin-UI (authenticated), edge-funktioner (service_role) eller
-- agent-rälsen (service_role). Ingen av dem har någon anropare i den publika
-- frontenden. De grövsta:
--
--   fw_edge_credentials()      Returnerar SUPABASE_URL + SERVICE_ROLE_KEY ur
--                              vault, med fallback som skrapar Bearer-token ur
--                              cron.job-kommandon. Anonym besökare kunde hämta
--                              instansens servicenyckel. Total övertagning.
--   schedule_cron_job(...)     Schemalägger godtycklig `net.http_post` med
--   unschedule_cron_job(...)   godtycklig URL, headers och body — SSRF och
--   register_flowpilot_cron    exfiltrering från databasen, plus möjligheten
--   register_retrieval_cron    att avschemalägga instansens automationer.
--   _global_search_internal    Rot-implementationen bakom `global_search`.
--                              `global_search` HAR en vakt; den interna hade
--                              ingen och var anropbar direkt. Vakten gick att
--                              gå runt genom att hoppa över ytterhöljet.
--   mcp_global_search          Samma förbigång, via MCP-höljet.
--   preview_payroll_period     Anställdas namn, e-post, PERSONNUMMER, löne-
--                              och frånvarodata. GDPR-klassad läcka.
--   purge_audit_logs_past_...  DELETE på audit_logs. Loggförstörelse.
--   manage_docs_page           create/update/delete på docs-sidor. Defacement.
--   link_employee_to_auth_user Sätter employees.user_id och INSERT:ar rollen
--                              'employee' i user_roles. Rättighetseskalering.
--   activate_confirmed_...     Aktiverar inbjuden company_contact mot ett
--                              auth-user-id. Samma klass.
--   book_invoice_issued/paid   Skriver verifikat i huvudboken.
--   book_expense_report        Bokför utläggsrapporter.
--   pay_vendor_invoice         Markerar leverantörsfaktura betald + verifikat.
--   register/dispose_fixed_...  Anläggningsregister + verifikat.
--   revalue_open_balances      Omvärderar öppna poster i valuta.
--   prepare_vat_return m.fl.   Momsdeklaration, resultat, budget, avstämning,
--                              lagervärde, ABC, churn, attribution, dubbletter
--                              — hela affärsdatan som läsning.
--   search_memories_hybrid /   FlowPilots minnesbank som fritextsök.
--   search_memories_semantic
--   emit_platform_event        Injicerar godtyckliga agent_events, alltså den
--                              rälsen som driver automationer och FlowPilot.
--   mcp_*                      MCP-gatewayens RPC-höljen. Anropas enbart med
--                              servicenyckel. Ingen anledning att anon når dem.
--
-- Vi revokar från BÅDE `PUBLIC` och `anon`. Bara `anon` räcker inte: PUBLIC
-- bär en egen `=X/postgres`-post i varje ACL, och anon ärver den. Kontrollerat
-- före skrivning: alla 111 har explicita grants till `authenticated` och
-- `service_role`, så inloggade användare och edge/agent-rälsen påverkas inte.
--
-- Kontrollerat mot beroenden: ingen av de 111 refereras från en RLS-policy,
-- en vy, ett kolumn-default, en CHECK-constraint eller en SECURITY INVOKER-
-- funktionskropp som anon kan trigga. (Det är den farliga klassen — en
-- funktion i ett policyuttryck utvärderas med ANROPARENS rättigheter, så en
-- REVOKE där ger "permission denied for function" i stället för `false`.)
-- Tre kandidater föll ut på den kontrollen: `next_mo_number` (används av
-- triggern tg_mo_set_mo_number) lämnades kvar; `emit_platform_event` och
-- `create_contract_from_template` refereras bara från invoker-triggrar på
-- tabeller anon inte kan skriva till (deals: staff-RLS; survey_responses:
-- admin-RLS, och den publika vägen dit går genom SECURITY DEFINER-funktionen
-- submit_survey_response som kör som ägaren) — de revokas.
--
-- ── DEL B: NULL-uid-escaper (15 st) ─────────────────────────────────────────
-- Mönstret: `IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),…)
-- OR auth.uid() IS NULL) THEN RAISE`. `auth.uid() IS NULL` var tänkt som
-- "systemet/cron kör detta". Men anon har OCKSÅ NULL uid. Disjunktionen
-- gjorde vakten till en dörr som stod på glänt för precis den roll den skulle
-- stänga ute. Service-rollen känns igen på `auth.role() = 'service_role'` —
-- ALDRIG på frånvaron av ett uid.
--
-- Alla 15 har redan `auth.role() = 'service_role'` i samma uttryck, så
-- systemvägen överlever när NULL-disjunkten tas bort. Patchen är textuell och
-- kirurgisk (regex på pg_get_functiondef, endast på de 15 namngivna) i stället
-- för 15 omskrivna funktionskroppar — kropparna driver mellan instanser, och
-- en omskrivning här skulle tysta rulla tillbaka nyare logik. Andra körningen
-- hittar inget att ersätta och är en no-op. Det är idempotensen.
--
-- Kvar (RÄTT och orörda) är de som använder NULL som NEKAN:
--   `IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN RAISE`
-- — clock_in, clock_out, hire_candidate_from_application, match_po_to_invoice,
-- sign_employment_contract, resolve_approval, list_fiscal_years,
-- opening_balances_for_year, global_search, create_ticket_from_portal.
--
-- ── DEL C: default-privilegier för framtida funktioner ──────────────────────
-- pg_default_acl visar att `anon`, `authenticated` och `service_role` har
-- EXPLICIT default-EXECUTE i public (Supabase sätter det), OVANPÅ Postgres
-- inbyggda PUBLIC-default. Vi revokar PUBLIC-defaulten här.
--
-- Var ärlig om vad det gör: det stoppar INTE återfallet. Så länge `anon` har
-- en egen default-grant blir varje NY funktion anon-körbar ändå. Att stänga
-- den ratten är ett eget, medvetet flottbeslut: då måste var och en av de ~45
-- funktionerna i listan högst upp få en EXPLICIT `GRANT EXECUTE … TO anon` i
-- en migration, annars slocknar den publika sajten tyst. Listan ovan finns
-- just för att göra det beslutet möjligt att fatta — inte för att fatta det
-- här.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── DEL A ───────────────────────────────────────────────────────────────────
DO $anon_revoke$
DECLARE
  v_names text[] := ARRAY[
    '_demo_register_row',
    '_ensure_manual_journal',
    '_global_search_internal',
    '_resolve_flowtable_base',
    '_upsert_quant',
    'abc_analysis_report',
    'activate_confirmed_company_contact',
    'apply_stock_movement_event',
    'attach_expense_receipts_to_entry',
    'audit_logs_retention_status',
    'book_expense_report',
    'book_invoice_issued',
    'book_invoice_paid',
    'booked_counterparty_counts',
    'budget_vs_actual',
    'bulk_advance_approvals',
    'calculate_vacation_days',
    'calculate_vat_report',
    'check_approval_escalations',
    'check_mo_availability',
    'checkout_objective',
    'close_pos_session',
    'close_pos_session_v2',
    'complete_migration_run',
    'create_contract_from_template',
    'create_subscription_from_contract',
    'demo_cycle_cron_status',
    'demo_seedable_modules',
    'dispatch_automation_event',
    'dispose_fixed_asset',
    'emit_platform_event',
    'end_webmeet_room',
    'explain_voucher_gap',
    'find_duplicate_companies',
    'find_duplicate_leads',
    'find_media_usage',
    'flag_at_risk_subscriptions',
    'flowpilot_approved_pending',
    'fw_edge_credentials',
    'generate_pos_receipt_number',
    'get_bootstrap_health',
    'get_conversation_token_estimate',
    'get_employee_leave_balances',
    'get_leave_balance',
    'get_user_role',
    'increment_template_usage',
    'inventory_gl_reconciliation',
    'inventory_valuation_report',
    'link_employee_to_auth_user',
    'lint_get_not_null_columns',
    'lint_get_rpc_signatures',
    'list_expiring_lots',
    'list_flowtable_tables',
    'list_quote_revisions',
    'list_reorder_candidates',
    'list_voucher_gaps',
    'list_webmeet_rooms',
    'log_ai_usage',
    'manage_docs_page',
    'match_invoice_to_receipt',
    'mcp_approve_payroll_run',
    'mcp_create_payroll_run',
    'mcp_dispose_fixed_asset',
    'mcp_global_search',
    'mcp_list_payroll_lines',
    'mcp_list_payroll_runs',
    'mcp_mark_payroll_paid',
    'mcp_register_fixed_asset',
    'mcp_revalue_open_balances',
    'mcp_run_monthly_depreciation',
    'mcp_set_exchange_rate',
    'pay_vendor_invoice',
    'prepare_vat_return',
    'preview_payroll_period',
    'propose_accruals',
    'propose_annual_depreciation',
    'publish_scheduled_pages',
    'purge_audit_logs_past_retention',
    'receive_return',
    'reconciliation_report',
    'record_churn_reason',
    'record_pos_sale_v2',
    'register_fixed_asset',
    'register_flowpilot_cron',
    'register_retrieval_cron',
    'release_agent_conversations',
    'release_agent_lock',
    'request_skill_approval',
    'resolve_agent_trust',
    'return_reason_report',
    'revalue_open_balances',
    'route_conversation_to_agent',
    'run_gmail_reconcile',
    'run_preventive_maintenance',
    'run_reconciliation_tests',
    'run_year_end',
    'schedule_cron_job',
    'search_memories_hybrid',
    'search_memories_semantic',
    'seed_default_pipeline_stages',
    'summarize_candidate_pipeline',
    'sweep_stale_voice_calls',
    'try_acquire_agent_lock',
    'unschedule_cron_job',
    'upcoming_renewals',
    'upsert_stock_quant',
    'utm_attribution_report',
    'webinar_reminder_tick',
    'webinar_tick',
    'weekly_business_digest',
    'year_end_readiness'
  ];
  v_fn record;
  v_revoked int := 0;
  v_missing text[] := ARRAY[]::text[];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    ) THEN
      -- En instans kan sakna en funktion (modul aldrig bootstrappad, äldre
      -- baseline). Det är inte ett fel — det är en instans utan den dörren.
      v_missing := v_missing || v_name;
    END IF;
  END LOOP;

  FOR v_fn IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           has_function_privilege('anon', p.oid, 'execute') AS anon_before
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proname = ANY (v_names)
  LOOP
    -- PUBLIC först: anon ärver den posten, så bara `FROM anon` vore verkanslöst.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
                   v_fn.proname, v_fn.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
                   v_fn.proname, v_fn.args);
    -- Re-assertera de avsedda konsumenterna. Idempotent, och skyddar mot att
    -- en instans råkat sakna en av grants:arna.
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
                   v_fn.proname, v_fn.args);

    IF v_fn.anon_before THEN
      v_revoked := v_revoked + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'anon-yta: % funktioner stängda i denna körning (0 = redan stängda)', v_revoked;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE NOTICE 'anon-yta: % namn fanns inte på denna instans: %',
      array_length(v_missing, 1), array_to_string(v_missing, ', ');
  END IF;
END;
$anon_revoke$;


-- ── DEL B: NULL-uid-escaper ─────────────────────────────────────────────────
-- Enbart de 15 namngivna. Regexen får ALDRIG släppas lös brett: mönstret
-- `auth.uid() IS NULL OR …` är KORREKT i de funktioner som använder det som
-- nekan (create_ticket_from_portal: `IF auth.uid() IS NULL OR v_email = ''
-- THEN RAISE`). Skillnaden är semantisk, inte syntaktisk — därför en lista.
DO $null_uid_escape$
DECLARE
  v_targets text[] := ARRAY[
    'allocate_picking',
    'apply_goods_receipt_stock',
    'change_subscription',
    'generate_contract_invoice',
    'generate_subscription_invoice',
    'lock_timesheet_period',
    'log_contract_invoice_reminder',
    'manage_recurring_service_order',
    'mark_contract_obligation_status',
    'mark_voice_callback_done',
    'run_contract_billing',
    'run_subscription_billing',
    'schedule_voice_callback',
    'seed_stock_locations',
    'support_assign_conversation'
  ];
  v_fn record;
  v_def text;
  v_new text;
  v_fixed int := 0;
BEGIN
  FOR v_fn IN
    SELECT p.oid, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proname = ANY (v_targets)
  LOOP
    v_def := pg_get_functiondef(v_fn.oid);

    -- Skyddsräcke: rör bara funktioner där service-vägen redan finns. Utan
    -- den skulle borttagningen av NULL-disjunkten stänga ute cron och
    -- edge-rälsen i stället för att stänga ute anon.
    CONTINUE WHEN position('service_role' in v_def) = 0;

    v_new := regexp_replace(v_def, '\s+OR\s+auth\.uid\(\)\s+IS\s+NULL', '', 'gi');
    v_new := regexp_replace(v_new, 'auth\.uid\(\)\s+IS\s+NULL\s+OR\s+', '', 'gi');

    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE v_new;
      v_fixed := v_fixed + 1;
      RAISE NOTICE 'NULL-uid-escape stängd: %', v_fn.proname;
    END IF;
  END LOOP;

  RAISE NOTICE 'NULL-uid: % vakter rättade i denna körning (0 = redan rättade)', v_fixed;
END;
$null_uid_escape$;


-- ── DEL C: default-privilegier ──────────────────────────────────────────────
-- Gäller per skapande roll. Migrationer körs som `postgres` på hela flottan;
-- vi sätter den både för current_user och explicit för postgres, och sväljer
-- felet om rollen saknas eller vi inte är medlem i den.
DO $default_acl$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'default-acl (current_user): hoppades över — %', SQLERRM;
END;
$default_acl$;

DO $default_acl_pg$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'default-acl (postgres): hoppades över — %', SQLERRM;
END;
$default_acl_pg$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- LACKMUS — kör som anon (anon-nyckeln som Bearer) mot PostgREST:
--
--   # Ska fortfarande FUNGERA (avsedd publik yta):
--   curl -sX POST "$URL/rest/v1/rpc/ingest_form_lead" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     -H 'Content-Type: application/json' \
--     -d '{"p_email":"lackmus@example.com","p_form_name":"litmus"}'
--   # → en lead skapas, 200.
--
--   # Ska nu NEKAS (revokade klass-3-dörrar):
--   curl -sX POST "$URL/rest/v1/rpc/fw_edge_credentials" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{}'
--   curl -sX POST "$URL/rest/v1/rpc/mcp_global_search" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     -H 'Content-Type: application/json' -d '{"p_search_query":"a"}'
--   # → 404/42883 "Could not find the function" eller
--   #   "permission denied for function …". Båda är stängt.
--
--   # NULL-uid-escaperna: nekar anon, släpper service.
--   curl -sX POST "$URL/rest/v1/rpc/run_subscription_billing" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{}'
--   # → "Only admins or system can run subscription billing"
--   curl -sX POST "$URL/rest/v1/rpc/run_subscription_billing" \
--     -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -d '{}'
--   # → körs.
--
-- I SQL, mätning före/efter:
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.prosecdef
--      AND has_function_privilege('anon', p.oid, 'execute');
--   -- optic före: 537   förväntat efter: 426
--
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.prosecdef
--      AND pg_get_functiondef(p.oid) ~* '(OR\s+auth\.uid\(\)\s+IS\s+NULL|auth\.uid\(\)\s+IS\s+NULL\s+OR)';
--   -- förväntat efter: inga rader utom create_ticket_from_portal
--   --                  (där mönstret ÄR en nekan).
-- ─────────────────────────────────────────────────────────────────────────────
