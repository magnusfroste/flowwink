-- Bekräftade läckor stängda — anon/authenticated-fynd som REVOKE inte räcker för.
--
-- Anon-svepen (20260822010000 tabellgrants, 20260822020000 funktionsgrants)
-- drog in döda grants. Men tre fynd är LÄCKANDE POLICIES respektive
-- FUNKTIONER SOM authenticated-dörren fortfarande öppnar — grants räcker inte,
-- själva vakten måste rättas. Verifierade live på optic med SET ROLE anon /
-- has_function_privilege('authenticated', …).
--
-- Kvar som eget spår (agent i arbete): webinar_registrations SELECT (kräver en
-- count-RPC innan blockets publika räknare kan tappa tabelläsningen), newsletter
-- tracking-policies (skrivarna är service-role), cron-schemaläggarnas interna
-- admin-vakt, och de vaktlösa payroll/accounting-skrivarna.

-- ── 1. agent_objective_activities: FlowPilot-historik låg öppen ─────────────
-- SELECT-policyn "Authenticated can view objective activities" hade qual = true
-- TO public — 337 rader FlowPilot-objektivhistorik läsbara för hela internet
-- (verifierat med SET ROLE anon). Byts till matrisratten: FlowPilot-modulens
-- medlemmar ser loggen, ingen annan. "Admins can manage" (ALL) behålls.
DROP POLICY IF EXISTS "Authenticated can view objective activities" ON public.agent_objective_activities;
DROP POLICY IF EXISTS "Staff can read objective activities" ON public.agent_objective_activities;
CREATE POLICY "Staff can read objective activities"
  ON public.agent_objective_activities
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'flowpilot'));

-- ── 2. documents: "shared"-grenen saknade auth-grind ───────────────────────
-- visibility='shared' släppte igenom UTAN någon inloggningskoll — anon läste
-- delade dokument, i strid med "inget uppladdat blir någonsin publikt". Grenen
-- får kravet auth.uid() IS NOT NULL. Resten av policyn oförändrad (admin /
-- role / private / uploaded_by). Radnivåsynligheten i global_search speglar
-- redan denna regel (20260821080000) — nu stämmer källan.
DROP POLICY IF EXISTS "Documents are visible per their visibility setting" ON public.documents;
CREATE POLICY "Documents are visible per their visibility setting"
  ON public.documents
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (visibility = 'shared'::text AND auth.uid() IS NOT NULL)
    OR (visibility = 'role'::text AND (has_role(auth.uid(), visible_to_role) OR uploaded_by = auth.uid()))
    OR (visibility = 'private'::text AND uploaded_by = auth.uid())
  );

-- ── 3. Ren infrastruktur → service_role-only ───────────────────────────────
-- Fem SECURITY DEFINER-funktioner utan intern vakt som authenticated-dörren
-- fortfarande öppnade efter anon-revoken. Ingen av dem har någon klient- eller
-- admin-UI-anropare (verifierat: grep i src/ + supabase/functions/ ger bara
-- genererade typer, en cron-kommentar, eller edge-funktioner som kör med
-- service-nyckeln). De hör innanför förtroendegränsen och ska inte vara
-- körbara av en inloggad portalkund.
--
--   fw_edge_credentials           — returnerar SERVICE_ROLE_KEY ur vault.
--                                   Total övertagning. Absolut service-only.
--   link_employee_to_auth_user    — INSERT:ar rollen 'employee'. Eskalering.
--   activate_confirmed_company_contact — samma klass.
--   purge_audit_logs_past_retention — DELETE på audit_logs (nattlig cron).
--   emit_platform_event           — injicerar agent_events i automationsrälsen.
DO $$
DECLARE
  v_names text[] := ARRAY[
    'fw_edge_credentials',
    'link_employee_to_auth_user',
    'activate_confirmed_company_contact',
    'purge_audit_logs_past_retention',
    'emit_platform_event'
  ];
  v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = ANY (v_names)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', v_fn.proname, v_fn.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', v_fn.proname, v_fn.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', v_fn.proname, v_fn.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', v_fn.proname, v_fn.args);
  END LOOP;
END $$;

-- ── LACKMUS ────────────────────────────────────────────────────────────────
--   SET ROLE anon;         SELECT * FROM agent_objective_activities LIMIT 1;  → 0 rader
--   (inloggad utan flowpilot i matrisen): samma → 0 rader; med flowpilot → rader.
--   SET ROLE anon;         SELECT * FROM documents WHERE visibility='shared';  → 0 rader
--   SET ROLE authenticated (portalkund): SELECT fw_edge_credentials();        → permission denied
--   SET ROLE service_role: SELECT fw_edge_credentials();                      → funkar
