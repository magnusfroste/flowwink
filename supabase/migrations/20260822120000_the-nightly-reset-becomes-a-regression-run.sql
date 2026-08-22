-- The nightly rebuild stops being scenery and starts being a test.
--
-- Three chains now exist that seed Nordbrygg AB by RUNNING its processes
-- (20260822090000 P2P, 20260822100000 O2C, 20260822110000 RMA). Each asserts
-- its own invariants and RAISEs when they do not hold. Wiring them into
-- demo-cycle turns every reset into a regression run: if a change breaks
-- receiving, picking, refunding or valuation, the rebuild fails loudly the
-- following night instead of quietly producing a demo that looks fine.
--
-- That is the whole point. Four bugs came out of running these chains once by
-- hand; running them nightly is how the fifth gets found without anyone
-- looking for it.
--
-- Three pieces here:
--   1. sandbox_teardown_chains() — the chains know their own FK graph.
--   2. seed_demo_operations()    — teardown, then the three chains in order.
--   3. restock_demo_products()   — stops overwriting stock that was EARNED.
--
-- Idempotent, and forward-dated so managed instances actually apply it.

-- ---------------------------------------------------------------------------
-- 1. Teardown — keyed strictly off the seed markers, children first
-- ---------------------------------------------------------------------------
-- reset_module_data cannot do this. It deletes by demo_run_items in whatever
-- order GROUP BY hands back, which is fine for the shallow seeders but not for
-- a graph where goods_receipts.purchase_order_id is ON DELETE RESTRICT and
-- stock_valuation_layers.move_id is ON DELETE SET NULL — the first would abort
-- the reset, the second would leave orphaned valuation behind.
--
-- Master data (the three vendors, the three products) is kept, the way a real
-- company keeps its suppliers and its catalogue between months. Only the
-- transactions cycle — and the products' stock, cost and valuation are reset to
-- zero, so the next run has to EARN all of it again. A cost that survived the
-- teardown would mean the "a receipt never taught the product its price"
-- regression could never recur.
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

-- ---------------------------------------------------------------------------
-- 2. The seeder demo-cycle calls
-- ---------------------------------------------------------------------------
-- Signature matches every other seed_demo_* so seed_module_demo can dispatch to
-- it. p_run_id is accepted and unused: these rows are torn down by their own
-- markers above, not through demo_run_items, precisely because the FK graph
-- needs an order that reset_module_data cannot express.
--
-- The chains run in sequence because each refuses without its predecessor —
-- O2C will not sell stock that was never received, RMA will not return goods
-- that were never sold. Running them here in one function is what guarantees
-- that order; demo-cycle iterates modules alphabetically and could not.
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
  v_teardown := public.sandbox_teardown_chains();
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

-- ---------------------------------------------------------------------------
-- 3. Assigned stock stops overwriting earned stock
-- ---------------------------------------------------------------------------
-- restock_demo_products runs LAST in demo-cycle, after every module seeder. It
-- stamped a made-up balance over every tracked product:
--
--   stock_quantity = GREATEST(50, COALESCE(low_stock_threshold, 5) * 10)
--
-- Assigned, never received: no receipt, no movement, no location, no cost. It
-- is why a sandbox could show outbound movements against zero goods receipts.
-- Left as it was, it would also erase the chains' work every night — 95 kg that
-- three processes accounted for, replaced by 50 that nothing did.
--
-- So it now skips any product that is ON a purchase order at all — ordered,
-- not merely received. "Has received goods" was the first rule and it was too
-- narrow: the Milano Due espresso machine is deliberately still in transit from
-- Italy, and a nightly stamp of 50 units erased exactly the state its purchase
-- order exists to show. A product a company has actually ordered has a real
-- stock story, whether the goods have landed or not.
--
-- Earned wins; assigned fills the rest, which keeps the storefront badges alive
-- for catalogue products no process touches. That is an improvement even where
-- the chains never run.
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

REVOKE EXECUTE ON FUNCTION public.sandbox_teardown_chains() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_demo_operations(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_teardown_chains() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_demo_operations(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.sandbox_teardown_chains() IS
  'Removes everything sandbox_seed_p2p/o2c/rma created, children first, keyed off the seed markers. Keeps vendors and products as master data but resets their stock, cost and valuation so the next run must earn them again.';
COMMENT ON FUNCTION public.seed_demo_operations(uuid, text) IS
  'demo-cycle entry point for the P2P → O2C → RMA chains. Tears down the previous run, then re-runs all three in order. Each asserts its own invariants, so a failure here is a regression.';

-- ---------------------------------------------------------------------------
-- 4. Dispatch — and the registration comes free
-- ---------------------------------------------------------------------------
-- demo_seedable_modules() derives its list by regexing the WHEN branches out of
-- this function's own source, and demo-cycle asks the database rather than
-- carrying a list. So adding the branch below is the entire registration: the
-- nightly cycle picks it up with no edge function deploy and no config change.
CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module text, p_scenario text DEFAULT 'default'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- The three chains, in sequence. They are one branch and not three because
    -- each refuses without its predecessor: O2C will not sell stock that was
    -- never received, RMA will not return goods that were never sold. demo-cycle
    -- iterates modules alphabetically and could not guarantee that order.
    WHEN 'operations'         THEN v_result := seed_demo_operations(v_run_id, p_scenario);
    ELSE
      UPDATE demo_runs SET status='failed', error='Unknown module: '||v_module, finished_at=now() WHERE id=v_run_id;
      RETURN jsonb_build_object('success', false, 'error', 'Unknown module: '||v_module);
  END CASE;

  UPDATE demo_runs SET status='completed', finished_at=now(), result=v_result WHERE id=v_run_id;
  RETURN jsonb_build_object('success', true, 'run_id', v_run_id, 'module', v_module, 'scenario', p_scenario, 'detail', v_result);
END;
$function$

;
