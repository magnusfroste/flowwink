-- A testbed can be sown, but it can never be torn down.
--
-- 20260822130000 made testbed_mode an UNLOCK: a third instance kind that the
-- seed chains accept, so Nordbrygg AB can be sown without pretending to be a
-- demo. That is half a contract. This migration writes the other half, which is
-- the half that matters: the same flag must be a VETO on every path that
-- destroys.
--
--   sandbox  — wiped nightly. The rebuild IS the permission system.
--   demo     — wiped nightly by demo-cycle. Its value is that it looks new.
--   testbed  — never wiped. Its value is that the history GREW. Nordbrygg is
--              where processes are proven over weeks: an invoice left to age,
--              a return that arrives after the period closed, a valuation layer
--              that only makes sense because six receipts preceded it.
--
-- A night of demo-cycle on the testbed erases months of that in one TRUNCATE,
-- and nothing brings it back. This is not hypothetical for this codebase: the
-- cron-poison class (20260812190000) already shipped a guard for cron jobs
-- pointing at a FOREIGN host, because the fleet has been burned by the right
-- job firing at the wrong instance.
--
-- The asymmetry is deliberate, and it is the whole design:
--
--   testbed_mode WINS over demo_mode and sandbox_mode.
--
-- Not "testbed_mode is checked too". Wins. If an operator sets demo_mode on the
-- testbed — the obvious mistake, because demo_mode is the visible toggle and
-- the one that unlocks seeding on every other instance — the wipe must still
-- refuse. Refusing to destroy a disposable instance costs one puzzled operator
-- and one `UPDATE site_settings`. Destroying a testbed costs months and is
-- recoverable by nothing. Fail toward the recoverable side.
--
-- Sowing is untouched. seed_module_demo, the three chains, and every
-- seed_demo_* still run on a testbed exactly as 20260822130000 arranged — that
-- is the point of having the flag at all. The one seeder that also DESTROYS
-- (seed_demo_operations, which tears the chains down before re-running them)
-- keeps sowing here and skips the teardown, so the testbed accumulates instead
-- of cycling.
--
-- Idempotent and re-runnable: every object is CREATE OR REPLACE, the cron
-- quarantine is a no-op once quiet, and the flag write is an upsert.

-- ---------------------------------------------------------------------------
-- 1. One reader, one veto
-- ---------------------------------------------------------------------------
-- Two functions instead of an inline check in seven bodies, for the same reason
-- seed_chain_mode() exists: a guard copied seven times is a guard that drifts
-- in six of them. When the eighth destructive path is written, it calls this.
--
-- Both jsonb shapes are accepted (`true` and `{"enabled": true}`) because the
-- fleet already carries both for demo_mode, and a guard that binds to the wrong
-- shape is a guard that never binds.
CREATE OR REPLACE FUNCTION public.is_testbed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT (value = 'true'::jsonb) OR ((value ->> 'enabled') = 'true')
       FROM public.site_settings WHERE key = 'testbed_mode'),
    false);
$function$;

COMMENT ON FUNCTION public.is_testbed() IS
  'True when site_settings.testbed_mode marks this instance a long-lived testbed (Nordbrygg AB): it may be SEEDED but must never be reset, wiped or put on the demo cycle. Wins over demo_mode and sandbox_mode — see assert_not_testbed().';

-- The veto. Raises with the instance kind named out loud and the exact way out,
-- because a guard whose message does not say how to proceed gets worked around
-- by whoever hits it at 23:00.
CREATE OR REPLACE FUNCTION public.assert_not_testbed(p_operation text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_testbed() THEN
    RAISE EXCEPTION
      '% refused: this instance is a TESTBED (site_settings.testbed_mode is enabled). A testbed is never reset — its accumulated history is the entire reason it exists, and no reset, wipe, teardown or demo-cycle path may run here. testbed_mode deliberately overrides demo_mode and sandbox_mode, so setting either of those does NOT re-arm this. If this instance really is disposable, remove testbed_mode from site_settings first — on purpose, and knowing what is in it.',
      p_operation
      USING ERRCODE = 'raise_exception',
            HINT = 'DELETE FROM site_settings WHERE key = ''testbed_mode''; -- only if you mean it';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.assert_not_testbed(text) IS
  'Veto called first in every destructive path (sandbox_reset_wipe, reset_site_data, reset_module_data, sandbox_teardown_chains, admin_wipe_journal, restock_demo_products, enable_demo_cycle_cron). Raises when site_settings.testbed_mode is set. Call this BEFORE any other gate so testbed wins over demo_mode/sandbox_mode.';

REVOKE ALL ON FUNCTION public.is_testbed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_not_testbed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_testbed() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_not_testbed(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. sandbox_reset_wipe — the full destroy half of the nightly rebuild
-- ---------------------------------------------------------------------------
-- Body carried unchanged from 20260813100000 (confirmed against the live
-- definition on the fleet). The ONLY change is the veto, placed above the
-- confirm token: a testbed must refuse before it even considers the password.
CREATE OR REPLACE FUNCTION public.sandbox_reset_wipe(p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  KEEP text[] := ARRAY[
    -- identity, config, agent surface
    'agent_skills','agent_automations','agent_trust_policies',
    'site_settings','user_roles','profiles','api_keys',
    -- role/nav matrix (empty here = every non-admin sees an empty product)
    'role_module_access','role_module_access_defaults',
    -- accounting reference
    'chart_of_accounts','account_roles','accounting_templates','locale_packs',
    'account_tax_boxes','journals','currencies',
    -- operational reference
    'payroll_country_profiles','expense_rate_tables','postal_code_rules',
    'pipeline_stages','business_hours',
    'uoms','uom_categories'
  ];
  _demo jsonb;
  _legacy jsonb;
  _admin_email text;
  _tables text[];
  _users_deleted int := 0;
  _skill_count int;
  _settings_count int;
BEGIN
  -- FIRST. Before the confirm token, before the role check, before anything
  -- that could be satisfied by an operator who knows the password. On a testbed
  -- there is no correct set of arguments to this function.
  PERFORM public.assert_not_testbed('sandbox_reset_wipe');

  IF p_confirm IS DISTINCT FROM 'WIPE-SANDBOX' THEN
    RAISE EXCEPTION 'sandbox_reset_wipe requires p_confirm = ''WIPE-SANDBOX''';
  END IF;

  SELECT value INTO _demo   FROM public.site_settings WHERE key = 'demo_mode';
  SELECT value INTO _legacy FROM public.site_settings WHERE key = 'sandbox_mode';
  IF NOT (
       _demo = 'true'::jsonb OR (_demo ->> 'enabled') = 'true'
    OR _legacy = 'true'::jsonb OR (_legacy ->> 'enabled') = 'true'
  ) THEN
    RAISE EXCEPTION 'sandbox_reset_wipe refused: this instance is not a demo (site_settings.demo_mode is not enabled)';
  END IF;

  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only service_role or an admin can reset the sandbox';
  END IF;

  SELECT COALESCE(
    NULLIF((SELECT value #>> '{}' FROM public.site_settings WHERE key = 'sandbox_admin_email'), ''),
    'demo@flowwink.com'
  ) INTO _admin_email;

  SELECT array_agg(tablename ORDER BY tablename) INTO _tables
    FROM pg_tables
   WHERE schemaname = 'public'
     AND NOT (tablename = ANY(KEEP));

  IF _tables IS NOT NULL AND array_length(_tables, 1) > 0 THEN
    EXECUTE 'TRUNCATE TABLE '
      || (SELECT string_agg(format('public.%I', t), ', ') FROM unnest(_tables) AS t)
      || ' RESTART IDENTITY CASCADE';
  END IF;

  DELETE FROM auth.users WHERE lower(email) IS DISTINCT FROM lower(_admin_email);
  GET DIAGNOSTICS _users_deleted = ROW_COUNT;
  UPDATE auth.users
     SET encrypted_password = extensions.crypt('demo1234', extensions.gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now())
   WHERE lower(email) = lower(_admin_email);

  SELECT count(*) INTO _skill_count FROM public.agent_skills;
  SELECT count(*) INTO _settings_count FROM public.site_settings;
  IF _skill_count = 0 OR _settings_count = 0 THEN
    RAISE EXCEPTION 'sandbox_reset_wipe rollback: a keep-table was emptied (agent_skills=%, site_settings=%)',
      _skill_count, _settings_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(_admin_email)) THEN
    RAISE EXCEPTION 'sandbox_reset_wipe rollback: sandbox admin % missing after auth normalize', _admin_email;
  END IF;

  RETURN jsonb_build_object(
    'tables_wiped', COALESCE(array_length(_tables, 1), 0),
    'users_deleted', _users_deleted,
    'admin_email', _admin_email,
    'skills_kept', _skill_count
  );
END $function$;

REVOKE ALL ON FUNCTION public.sandbox_reset_wipe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_reset_wipe(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. reset_site_data — the path that was ALWAYS the most dangerous
-- ---------------------------------------------------------------------------
-- Finding: this function had NO instance gate at all. Not demo_mode, not
-- sandbox_mode, nothing. Confirm token plus admin, and then TRUNCATE of every
-- table in public outside its KEEP list — on ANY instance in the fleet, optic
-- and every future customer site included. sandbox_reset_wipe is the one with
-- the fearsome reputation and the triple gate; this one is strictly more
-- reachable and was strictly less guarded.
--
-- It keeps its "works anywhere" contract for real customer sites, because
-- "reset this site to empty" is a legitimate operator action there. What it
-- gains is the one instance kind where it is never legitimate.
CREATE OR REPLACE FUNCTION public.reset_site_data(p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  KEEP text[] := ARRAY[
    -- identity & access (admin user survives)
    'profiles','user_roles','role_module_access','role_module_access_defaults',
    -- instance config & credentials (Supabase/gateway connections)
    'site_settings','api_keys',
    -- seeded platform layers
    'agent_skills','agent_skill_packs','agent_trust_policies',
    'chart_of_accounts','account_roles','accounting_templates','locale_packs','currencies',
    -- migration bookkeeping
    'schema_migrations','supabase_migrations'
  ];
  _tables text[];
  _skills int;
  _settings int;
  _roles int;
  _profiles int;
BEGIN
  PERFORM public.assert_not_testbed('reset_site_data');

  IF p_confirm IS DISTINCT FROM 'RESET-SITE' THEN
    RAISE EXCEPTION 'reset_site_data requires p_confirm = ''RESET-SITE''';
  END IF;

  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only an admin can reset the site';
  END IF;

  SELECT array_agg(tablename ORDER BY tablename) INTO _tables
    FROM pg_tables
   WHERE schemaname = 'public'
     AND NOT (tablename = ANY(KEEP));

  IF _tables IS NOT NULL AND array_length(_tables, 1) > 0 THEN
    EXECUTE 'TRUNCATE TABLE '
      || (SELECT string_agg(format('public.%I', t), ', ') FROM unnest(_tables) AS t)
      || ' RESTART IDENTITY CASCADE';
  END IF;

  SELECT count(*) INTO _skills FROM public.agent_skills;
  SELECT count(*) INTO _settings FROM public.site_settings;
  SELECT count(*) INTO _roles FROM public.user_roles;
  SELECT count(*) INTO _profiles FROM public.profiles;

  IF _skills = 0 OR _settings = 0 OR _roles = 0 OR _profiles = 0 THEN
    RAISE EXCEPTION 'reset_site_data rollback: a keep-table was emptied (skills=%, settings=%, user_roles=%, profiles=%)',
      _skills, _settings, _roles, _profiles;
  END IF;

  RETURN jsonb_build_object(
    'tables_wiped', COALESCE(array_length(_tables, 1), 0),
    'tables_kept', array_length(KEEP, 1),
    'skills_kept', _skills,
    'admins_kept', _roles
  );
END $function$;

REVOKE ALL ON FUNCTION public.reset_site_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_site_data(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. reset_module_data — the per-module delete demo-cycle drives
-- ---------------------------------------------------------------------------
-- The veto guards the DESTRUCTIVE call only. p_dry_run = true (the default) is
-- a report — it counts rows and deletes none — and a testbed operator should
-- keep being able to ask "what would this remove?". Refusing the question as
-- well would teach people that the guard is noise, which is how guards get
-- worked around.
CREATE OR REPLACE FUNCTION public.reset_module_data(p_module text, p_dry_run boolean DEFAULT true, p_run_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  PROTECTED_TABLES text[] := ARRAY[
    'pages','agent_skills','agent_objectives','agent_memory','site_settings','contract_templates',
    'quote_templates','locale_packs','user_roles','profiles'
  ];
  v_module text;
  v_counts jsonb := '{}'::jsonb;
  v_tbl text;
  v_count int;
  v_total int := 0;
  v_sql text;
BEGIN
  IF NOT p_dry_run THEN
    PERFORM public.assert_not_testbed('reset_module_data');
  END IF;

  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only admins can reset demo data';
  END IF;

  v_module := lower(trim(p_module));

  FOR v_tbl, v_count IN
    SELECT i.table_name, count(*)::int
    FROM public.demo_run_items i
    JOIN public.demo_runs r ON r.id = i.run_id
    WHERE (v_module = 'all' OR r.module = v_module)
      AND (p_run_id IS NULL OR r.id = p_run_id)
    GROUP BY i.table_name
  LOOP
    IF v_tbl = ANY(PROTECTED_TABLES) THEN
      CONTINUE;
    END IF;
    v_counts := v_counts || jsonb_build_object(v_tbl, v_count);
    v_total := v_total + v_count;

    IF NOT p_dry_run THEN
      v_sql := format(
        'DELETE FROM public.%I WHERE id IN (
           SELECT i.row_id FROM public.demo_run_items i
           JOIN public.demo_runs r ON r.id = i.run_id
           WHERE i.table_name = %L
             AND (%L = ''all'' OR r.module = %L)
             AND (%L::uuid IS NULL OR r.id = %L::uuid)
         )',
        v_tbl, v_tbl, v_module, v_module, p_run_id, p_run_id
      );
      EXECUTE v_sql;
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    DELETE FROM public.demo_runs r
    WHERE (v_module = 'all' OR r.module = v_module)
      AND (p_run_id IS NULL OR r.id = p_run_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'module', v_module,
    'run_id', p_run_id,
    'total_rows', v_total,
    'counts_by_table', v_counts
  );
END $function$;

REVOKE ALL ON FUNCTION public.reset_module_data(text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_module_data(text, boolean, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. sandbox_teardown_chains — the one that hurts the testbed most
-- ---------------------------------------------------------------------------
-- This deletes exactly what Nordbrygg is FOR: every purchase order, goods
-- receipt, vendor invoice, quote, order, picking, invoice, return, stock move
-- and valuation layer the three chains produced — and then resets the products'
-- stock and cost to NULL so nothing of what was earned remains. Correct on a
-- sandbox that rebuilds nightly. On the testbed it is the accident this whole
-- migration exists to prevent, and it was gated on admin-or-service-role alone,
-- which every caller in the fleet already satisfies.
--
-- Body carried unchanged from 20260822120000; the veto is the only addition.
CREATE OR REPLACE FUNCTION public.sandbox_teardown_chains()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_products uuid[];
  v_orders uuid[];
  v_pos uuid[];
  v_pickings uuid[];
  v_moves uuid[];
  v_counts jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  PERFORM public.assert_not_testbed('sandbox_teardown_chains');

  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can tear down the sandbox chains';
  END IF;

  SELECT array_agg(id) INTO v_products FROM public.products
   WHERE name LIKE 'Milano Due%' OR name LIKE 'Söderberg Mörkrost%' OR name LIKE 'Vattenfilter FX-200%';
  SELECT array_agg(id) INTO v_orders FROM public.orders WHERE metadata ->> 'seed' = 'o2c:order';
  SELECT array_agg(id) INTO v_pos FROM public.purchase_orders WHERE notes LIKE 'seed:p2p:%';
  SELECT array_agg(id) INTO v_pickings FROM public.picking_orders
   WHERE order_id = ANY(COALESCE(v_orders, ARRAY[]::uuid[]));

  -- Returns first: they hang off the order, and their own children cascade.
  DELETE FROM public.returns WHERE internal_notes LIKE 'seed:rma:%';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('returns', v_n);

  DELETE FROM public.agent_events WHERE event_name = 'stock.movement' AND source = 'returns';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('stock_events', v_n);

  -- invoices.order_id is ON DELETE SET NULL, so an invoice left behind would
  -- survive its order as an orphan receivable.
  DELETE FROM public.invoices WHERE notes LIKE 'seed:o2c:%';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('invoices', v_n);

  -- The picking chain: reservations point at the picking, lines cascade from it.
  DELETE FROM public.stock_reservations
   WHERE reference_type = 'picking_order'
     AND reference_id = ANY(SELECT x::text FROM unnest(COALESCE(v_pickings, ARRAY[]::uuid[])) x);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('reservations', v_n);

  DELETE FROM public.picking_orders WHERE id = ANY(COALESCE(v_pickings, ARRAY[]::uuid[]));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('pickings', v_n);

  DELETE FROM public.orders WHERE id = ANY(COALESCE(v_orders, ARRAY[]::uuid[]));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('orders', v_n);

  DELETE FROM public.quotes WHERE notes LIKE 'seed:o2c:%';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('quotes', v_n);

  DELETE FROM public.vendor_invoices WHERE notes LIKE 'seed:p2p:%';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('vendor_invoices', v_n);

  -- goods_receipts.purchase_order_id is ON DELETE RESTRICT: receipts before POs,
  -- or the delete below aborts the whole teardown.
  DELETE FROM public.goods_receipts WHERE purchase_order_id = ANY(COALESCE(v_pos, ARRAY[]::uuid[]));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('goods_receipts', v_n);

  DELETE FROM public.purchase_orders WHERE id = ANY(COALESCE(v_pos, ARRAY[]::uuid[]));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('purchase_orders', v_n);

  -- Valuation before moves: the FK is ON DELETE SET NULL, so dropping the moves
  -- first would leave the layers behind carrying value against nothing.
  IF v_products IS NOT NULL THEN
    SELECT array_agg(id) INTO v_moves FROM public.stock_moves WHERE product_id = ANY(v_products);

    DELETE FROM public.stock_valuation_layers WHERE product_id = ANY(v_products);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('valuation_layers', v_n);

    DELETE FROM public.stock_moves WHERE id = ANY(COALESCE(v_moves, ARRAY[]::uuid[]));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('stock_moves', v_n);

    DELETE FROM public.stock_quants WHERE product_id = ANY(v_products);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('quants', v_n);

    -- Back to nothing: no stock, no cost. Everything must be earned again.
    UPDATE public.products
       SET stock_quantity = NULL, cost_cents = NULL, updated_at = now()
     WHERE id = ANY(v_products);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('products_reset', v_n);
  END IF;

  RETURN jsonb_build_object('torn_down', true, 'counts', v_counts);
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.sandbox_teardown_chains() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_teardown_chains() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. seed_demo_operations — sowing survives, the teardown does not
-- ---------------------------------------------------------------------------
-- This is where the two halves of the contract meet. The function is a SEEDER
-- whose first act is a demolition, so a blanket veto would have made the
-- testbed's own seed path fail — the exact "protection that breaks the thing it
-- protects" outcome that gets guards deleted a week later.
--
-- So on a testbed it skips the teardown and runs the three chains straight. The
-- chains are written to be re-runnable (master data guarded by NOT EXISTS, each
-- stage asserting its own invariants), so calling this twice on a testbed adds
-- another month of trading rather than replacing last month's. That is what
-- accumulation means, and it is the behaviour the testbed wants anyway.
--
-- Everywhere else — sandbox, demo — it tears down first, exactly as before.
CREATE OR REPLACE FUNCTION public.seed_demo_operations(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_teardown jsonb;
  v_p2p jsonb;
  v_o2c jsonb;
  v_rma jsonb;
BEGIN
  IF public.is_testbed() THEN
    v_teardown := jsonb_build_object(
      'skipped', true,
      'reason', 'testbed: history accumulates here, so the previous run is kept instead of torn down');
  ELSE
    v_teardown := public.sandbox_teardown_chains();
  END IF;

  v_p2p := public.sandbox_seed_p2p();
  v_o2c := public.sandbox_seed_o2c();
  v_rma := public.sandbox_seed_rma();

  RETURN jsonb_build_object(
    'teardown', v_teardown,
    'procure_to_pay', v_p2p,
    'order_to_cash', v_o2c,
    'return_to_refund', v_rma,
    'note', 'Every figure below was earned by a process that ran. A failure here is a regression, not a seeding problem.');
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.seed_demo_operations(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_operations(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. restock_demo_products — assigned stock must not overwrite a real balance
-- ---------------------------------------------------------------------------
-- Not a wipe, but it is data destruction by another name: it stamps a made-up
-- quantity over every tracked product that is not on a purchase order. On a
-- sandbox that keeps storefront badges alive between rebuilds. On a testbed,
-- where a product's stock level may be the outcome of eight weeks of real
-- movements, overwriting it with GREATEST(50, threshold*10) destroys evidence
-- that nothing regenerates.
CREATE OR REPLACE FUNCTION public.restock_demo_products()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated_stock int := 0;
  v_updated_products int := 0;
  v_earned int := 0;
BEGIN
  PERFORM public.assert_not_testbed('restock_demo_products');

  SELECT count(DISTINCT product_id) INTO v_earned
    FROM public.purchase_order_lines WHERE product_id IS NOT NULL;

  WITH upd AS (
    UPDATE public.product_stock ps
    SET quantity_on_hand = GREATEST(50, COALESCE(ps.reorder_point, 5) * 10)
    WHERE COALESCE(ps.reorder_point, 0) >= 0
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_order_lines pol
         WHERE pol.product_id = ps.product_id)
    RETURNING ps.product_id
  )
  SELECT count(*) INTO v_updated_stock FROM upd;

  WITH upd2 AS (
    UPDATE public.products p
    SET stock_quantity = GREATEST(50, COALESCE(p.low_stock_threshold, 5) * 10)
    WHERE p.track_inventory = true
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_order_lines pol
         WHERE pol.product_id = p.id)
    RETURNING p.id
  )
  SELECT count(*) INTO v_updated_products FROM upd2;

  RETURN jsonb_build_object(
    'ok', true,
    'product_stock_rows', v_updated_stock,
    'products_rows', v_updated_products,
    'skipped_products_on_purchase_orders', v_earned,
    'restocked_at', now()
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. admin_wipe_journal — the ledger is the testbed's longest thread
-- ---------------------------------------------------------------------------
-- Deletes every journal entry and line, reopens closed periods, and unbooks the
-- bank events. Its guard was admin-or-service-role and nothing else. On
-- Nordbrygg the ledger is the single most accumulated artefact on the instance
-- — closed periods are the whole point of leaving a company running for months.
CREATE OR REPLACE FUNCTION public.admin_wipe_journal(p_delete_bank_events boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entries int;
  v_lines int;
  v_events int;
  v_periods int;
BEGIN
  PERFORM public.assert_not_testbed('admin_wipe_journal');

  -- Service-role escape + admin guard (fleet lesson: agent-callable SECURITY
  -- DEFINER functions need auth.role() check; this one is UI/admin only).
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can wipe the journal';
  END IF;

  -- Closed periods block entry deletion via guard_journal_entries_period();
  -- a full wipe implies reopening them (reported in the result).
  UPDATE accounting_periods SET status = 'open' WHERE status <> 'open';
  GET DIAGNOSTICS v_periods = ROW_COUNT;

  -- Clear every FK that references journal_entries.
  UPDATE expense_payments SET journal_entry_id = NULL WHERE journal_entry_id IS NOT NULL;
  UPDATE expense_reports SET journal_entry_id = NULL WHERE journal_entry_id IS NOT NULL;
  UPDATE payment_reconciliations SET journal_entry_id = NULL, reversal_journal_entry_id = NULL
    WHERE journal_entry_id IS NOT NULL OR reversal_journal_entry_id IS NOT NULL;
  UPDATE payroll_runs SET approval_journal_id = NULL, payment_journal_id = NULL
    WHERE approval_journal_id IS NOT NULL OR payment_journal_id IS NOT NULL;
  DELETE FROM analytic_lines;
  DELETE FROM accounting_corrections;
  DELETE FROM journal_entry_line_taxes;

  DELETE FROM journal_entry_lines;
  GET DIAGNOSTICS v_lines = ROW_COUNT;

  IF p_delete_bank_events THEN
    DELETE FROM reconciliation_matches;
    DELETE FROM bank_transactions;
    GET DIAGNOSTICS v_events = ROW_COUNT;
  ELSE
    -- Reset events to unbooked so the events-to-book queue refills — the
    -- iterate-on-proposals loop.
    DELETE FROM reconciliation_matches;
    UPDATE bank_transactions
      SET journal_entry_id = NULL, status = 'unmatched', matched_amount_cents = 0
      WHERE journal_entry_id IS NOT NULL OR status <> 'unmatched';
    GET DIAGNOSTICS v_events = ROW_COUNT;
  END IF;

  DELETE FROM journal_entries;
  GET DIAGNOSTICS v_entries = ROW_COUNT;

  RETURN jsonb_build_object(
    'entries_deleted', v_entries,
    'lines_deleted', v_lines,
    'bank_events', v_events,
    'bank_events_deleted', p_delete_bank_events,
    'periods_reopened', v_periods
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. enable_demo_cycle_cron — refuse to SCHEDULE the demolition
-- ---------------------------------------------------------------------------
-- Guarding only the wipe leaves the loaded gun on the table: any admin could
-- schedule demo-cycle-daily here, and every night it would hammer against the
-- refusals above and fill cron.job_run_details with failures (a table this
-- fleet has already had wedge a Postgres instance on disk IO). Refusing at
-- schedule time is where the operator is still in the room to read the message.
CREATE OR REPLACE FUNCTION public.enable_demo_cycle_cron(p_function_url text, p_anon_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_job_id bigint;
  v_command text;
begin
  perform public.assert_not_testbed('enable_demo_cycle_cron');

  -- Left exactly as it was: admin only, no service_role escape. Widening a role
  -- gate inside a migration whose job is to NARROW destructive reach would be
  -- the sort of drive-by that guards are supposed to prevent.
  if not has_role(auth.uid(), 'admin') then
    raise exception 'admin role required';
  end if;
  if p_function_url is null or length(p_function_url) = 0 then
    raise exception 'p_function_url required';
  end if;
  if p_anon_key is null or length(p_anon_key) = 0 then
    raise exception 'p_anon_key required';
  end if;

  v_command := format(
    $cmd$select net.http_post(
      url := %L,
      headers := %L::jsonb,
      body := jsonb_build_object('triggered_at', now())
    );$cmd$,
    p_function_url,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', p_anon_key,
      'Authorization', 'Bearer ' || p_anon_key
    )::text
  );

  -- Clean up legacy hourly job if it still exists
  if exists (select 1 from cron.job where jobname = 'demo-cycle-hourly') then
    perform cron.unschedule('demo-cycle-hourly');
  end if;
  if exists (select 1 from cron.job where jobname = 'demo-cycle-daily') then
    perform cron.unschedule('demo-cycle-daily');
  end if;

  select cron.schedule('demo-cycle-daily', '0 3 * * *', v_command) into v_job_id;

  return jsonb_build_object(
    'scheduled', true,
    'jobname', 'demo-cycle-daily',
    'job_id', v_job_id,
    'schedule', '0 3 * * *'
  );
end;
$function$;

-- Found while auditing the reach of these paths: the three below still carried
-- the default `PUBLIC` execute grant, and anon on top of it. Their internal
-- guards make an anonymous call raise rather than destroy, so this was never
-- exploitable — but "the body refuses" is the second line, not the first, and
-- the anon-surface sweep's standing rule is that a destructive SECURITY DEFINER
-- function is revoked from PUBLIC at definition time. Narrowing them here costs
-- nothing: every real caller is authenticated (admin UI) or service_role
-- (demo-cycle, the skill rail).
REVOKE ALL ON FUNCTION public.admin_wipe_journal(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_wipe_journal(boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enable_demo_cycle_cron(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enable_demo_cycle_cron(text, text) TO authenticated, service_role;

-- restock_demo_products is service_role only today (demo-cycle is its only
-- caller). Keep it that way rather than widening it on the way past.
REVOKE ALL ON FUNCTION public.restock_demo_products() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restock_demo_products() TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Quarantine anything already scheduled
-- ---------------------------------------------------------------------------
-- The guards above stop the gun being loaded from here on. If it is already
-- loaded on this instance — a demo-cycle job scheduled before testbed_mode was
-- set, or carried in by a fork's bootstrap — the guard would only turn tonight's
-- demolition into tonight's stack trace. Unschedule it instead. Same runtime
-- reconciliation the cron-poison class settled on: reconcile the STATE, do not
-- trust that the writer will be well behaved next time.
DO $quarantine$
DECLARE
  v_job record;
BEGIN
  IF NOT public.is_testbed() THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN RETURN; END IF;

  FOR v_job IN
    SELECT jobname FROM cron.job WHERE jobname IN ('demo-cycle-daily', 'demo-cycle-hourly')
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
    RAISE NOTICE 'testbed quarantine: unscheduled %', v_job.jobname;
  END LOOP;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'testbed quarantine: cron not reachable from this role, skipped';
END $quarantine$;

-- ---------------------------------------------------------------------------
-- 11. The flag itself, documented where an operator will find it
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION public.restock_demo_products() IS
  'Fills assigned stock for tracked products that are on no purchase order. Refuses on a testbed (assert_not_testbed) — there a stock level can be the outcome of real movements.';
COMMENT ON FUNCTION public.admin_wipe_journal(boolean) IS
  'Deletes every journal entry/line and reopens closed periods. Refuses on a testbed (assert_not_testbed).';
COMMENT ON FUNCTION public.seed_demo_operations(uuid, text) IS
  'demo-cycle entry point for the P2P → O2C → RMA chains. Tears down the previous run first EXCEPT on a testbed, where history accumulates and only the chains re-run.';
