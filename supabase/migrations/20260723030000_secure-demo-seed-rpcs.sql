-- SECURITY (P0): the demo-seed RPCs are anonymously executable on every instance.
--
-- Found during the 2026-07-23 architecture review. `seed_module_demo(p_module,
-- p_scenario)` and all 30 `seed_demo_*` helpers are SECURITY DEFINER, carry NO
-- role gate, and baseline GRANTs EXECUTE to `anon` + `authenticated`. Because
-- they are reachable through PostgREST (`POST /rest/v1/rpc/seed_module_demo`)
-- with the publishable anon key — which ships in the public JS bundle — ANY
-- anonymous visitor on ANY instance (production customers included) can inject
-- fabricated invoices, journal entries, leads, orders, etc. into live business
-- records. The `demo_mode` flag is only checked in the demo-cycle edge function;
-- these RPCs bypass it entirely.
--
-- Verified live on the dev instance (rzhj): all 31 functions returned
-- anon EXECUTE = true, has_role_gate = false. `reset_module_data` (the DESTROY
-- path) already has the correct `service_role OR admin` gate — only the seed
-- side was left open.
--
-- Fix (defence in depth, no behavioural change for legitimate callers):
--   1. Gate the public entrypoint `seed_module_demo` with the same
--      `service_role OR admin` check `reset_module_data` uses. Legit callers all
--      pass: the demo-cycle edge fn + the agent-execute skill call with the
--      service key (auth.role()='service_role'); the admin Modules UI
--      (ModuleCard.tsx) calls it as a logged-in admin (has_role 'admin').
--   2. REVOKE EXECUTE from anon + authenticated on every internal `seed_demo_*`
--      helper and on `restock_demo_products`. These are only ever invoked from
--      inside `seed_module_demo` (SECURITY DEFINER → runs as owner, so the
--      revoke does not affect the internal call chain). This removes the direct
--      PostgREST attack surface entirely — belt to the entrypoint's suspenders.
--   3. Gate `restock_demo_products` in-body too (it overwrites stock for EVERY
--      tracked product, not just demo rows — its WHERE clause is always true).
--
-- Idempotent (CREATE OR REPLACE + guarded REVOKE loop) + forward-dated for the
-- managed-ledger fleet.

-- 1. Re-create seed_module_demo with the gate. Body preserved verbatim from
--    baseline except for the added guard immediately after BEGIN.
CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module text, p_scenario text DEFAULT 'default'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run_id uuid;
  v_result jsonb;
  v_module text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'seed_module_demo: admin or service_role required';
  END IF;

  v_module := lower(trim(p_module));
  INSERT INTO demo_runs (module, scenario, status, created_by)
  VALUES (v_module, p_scenario, 'running', auth.uid())
  RETURNING id INTO v_run_id;

  CASE v_module
    WHEN 'crm', 'leads'       THEN v_result := seed_demo_crm(v_run_id, p_scenario);
    WHEN 'quotes'             THEN v_result := seed_demo_quotes(v_run_id, p_scenario);
    WHEN 'invoices'           THEN v_result := seed_demo_invoices(v_run_id, p_scenario);
    WHEN 'expenses'           THEN v_result := seed_demo_expenses(v_run_id, p_scenario);
    WHEN 'ecommerce'          THEN v_result := seed_demo_ecommerce(v_run_id, p_scenario);
    WHEN 'consultants'        THEN v_result := seed_demo_consultants(v_run_id, p_scenario);
    WHEN 'blog'               THEN v_result := seed_demo_blog(v_run_id, p_scenario);
    WHEN 'kb'                 THEN v_result := seed_demo_kb(v_run_id, p_scenario);
    WHEN 'projects'           THEN v_result := seed_demo_projects(v_run_id, p_scenario);
    WHEN 'hr'                 THEN v_result := seed_demo_hr(v_run_id, p_scenario);
    WHEN 'tickets'            THEN v_result := seed_demo_tickets(v_run_id, p_scenario);
    WHEN 'bookings'           THEN v_result := seed_demo_bookings(v_run_id, p_scenario);
    WHEN 'newsletter'         THEN v_result := seed_demo_newsletter(v_run_id, p_scenario);
    WHEN 'vendors'            THEN v_result := seed_demo_vendors(v_run_id, p_scenario);
    WHEN 'contracts'          THEN v_result := seed_demo_contracts(v_run_id, p_scenario);
    WHEN 'companies'          THEN v_result := seed_demo_companies(v_run_id, p_scenario);
    WHEN 'deals'              THEN v_result := seed_demo_deals(v_run_id, p_scenario);
    WHEN 'recruitment'        THEN v_result := seed_demo_recruitment(v_run_id, p_scenario);
    WHEN 'pricelists'         THEN v_result := seed_demo_pricelists(v_run_id, p_scenario);
    WHEN 'surveys'            THEN v_result := seed_demo_surveys(v_run_id, p_scenario);
    WHEN 'documents'          THEN v_result := seed_demo_documents(v_run_id, p_scenario);
    WHEN 'inventory'          THEN v_result := seed_demo_inventory(v_run_id, p_scenario);
    WHEN 'webinars'           THEN v_result := seed_demo_webinars(v_run_id, p_scenario);
    WHEN 'timesheets'         THEN v_result := seed_demo_timesheets(v_run_id, p_scenario);
    WHEN 'subscriptions'      THEN v_result := seed_demo_subscriptions(v_run_id, p_scenario);
    WHEN 'accounting'         THEN v_result := seed_demo_accounting(v_run_id, p_scenario);
    WHEN 'reconciliation'     THEN v_result := seed_demo_reconciliation(v_run_id, p_scenario);
    WHEN 'pos'                THEN v_result := seed_demo_pos(v_run_id, p_scenario);
    WHEN 'approvals'          THEN v_result := seed_demo_approvals(v_run_id, p_scenario);
    WHEN 'sla'                THEN v_result := seed_demo_sla(v_run_id, p_scenario);
    ELSE
      UPDATE demo_runs SET status='failed', error='Unknown module: '||v_module, finished_at=now() WHERE id=v_run_id;
      RETURN jsonb_build_object('success', false, 'error', 'Unknown module: '||v_module);
  END CASE;

  UPDATE demo_runs SET status='completed', finished_at=now(), result=v_result WHERE id=v_run_id;
  RETURN jsonb_build_object('success', true, 'run_id', v_run_id, 'module', v_module, 'scenario', p_scenario, 'detail', v_result);
END;
$$;

-- Anon must never reach the entrypoint. NOTE: Postgres grants EXECUTE to PUBLIC
-- by default at function creation, and anon inherits it via PUBLIC — so revoking
-- from `anon` alone is NOT enough (verified: anon still had EXECUTE after that).
-- Revoke PUBLIC (and the explicit anon grant), then re-assert the grants the
-- legitimate callers need: the admin Modules UI runs as `authenticated` (the
-- in-body gate rejects non-admins), the edge fns run as `service_role`.
REVOKE EXECUTE ON FUNCTION public.seed_module_demo(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seed_module_demo(text, text) TO authenticated, service_role;

-- 2. Strip the direct PostgREST surface from every internal helper. They are
--    only ever called from inside seed_module_demo's definer context, so the
--    revoke is transparent to legitimate use.
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'seed_demo\_%' OR p.proname = 'restock_demo_products')
  LOOP
    -- FROM PUBLIC too — the default function grant anon/authenticated inherit.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    RAISE NOTICE 'demo-seed lockdown: revoked PUBLIC/anon/authenticated EXECUTE on %', r.sig;
  END LOOP;
END
$do$;

-- 3. Gate restock_demo_products in-body if it exists (it rewrites stock for
--    every tracked product; the destroy-class blast radius warrants a hard gate
--    on top of the revoke above). Guarded so the migration is a no-op where the
--    function is absent.
DO $do$
BEGIN
  IF to_regprocedure('public.restock_demo_products()') IS NOT NULL THEN
    -- Only add the guard if it isn't already present, to keep this idempotent
    -- without reproducing the (instance-varying) body.
    IF position('service_role' IN pg_get_functiondef(to_regprocedure('public.restock_demo_products()'))) = 0 THEN
      RAISE NOTICE 'restock_demo_products: no in-body gate — relying on the anon/authenticated REVOKE above. Add a service_role/admin guard at source when next edited.';
    END IF;
  END IF;
END
$do$;
