-- A payment term is a word on this platform, not a number.
--
-- public.vendors.payment_terms is text, and the whole platform reads it as
-- 'immediate' | 'net15' | 'net30' | 'net45' | 'net60': VendorsPage defaults new
-- vendors to 'net30', renders the column as
-- `(v.payment_terms || 'net30').replace('net', 'Net ')`, and the manage_vendor
-- skill declares exactly that enum. The demo seeder
-- (seed_demo_vendors, 20260814150157) has always written 'net30'/'net15'.
--
-- The Nordbrygg P2P chain wrote a bare integer instead — `..., 'EUR', 30, true`
-- — so the value landed as the string '30' and the vendor list rendered "30"
-- where every other vendor reads "Net 30". A text column accepts anything, so
-- nothing failed; it just showed wrong. Verified live on the nordbrygg instance
-- (aynnvczbbeoiaukyrudy): all three seeded vendors carried '30'/'20'/'30'.
--
-- Two halves, because the seed already ran:
--   1. the function stops producing bare numbers, and
--   2. the rows it already produced are normalised in place ('30' → 'net30').
--
-- The already-applied migrations (20260822090000, 20260822130000) are left
-- untouched — instances carry them in their ledger and would never re-run an
-- edit made in place. Forward-dated so managed instances actually apply this,
-- and idempotent: the regex stops matching once the rows are words.

-- ---------------------------------------------------------------------------
-- 1. Normalise what the seed already wrote
-- ---------------------------------------------------------------------------
UPDATE public.vendors
   SET payment_terms = 'net' || payment_terms
 WHERE payment_terms ~ '^[0-9]+$';

-- ---------------------------------------------------------------------------
-- 2. Stop producing them — same body as 20260822130000, terms as words
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sandbox_seed_p2p()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
  v_loc_in uuid;
  v_vendor_machines uuid;
  v_vendor_roastery uuid;
  v_vendor_parts uuid;
  v_machine uuid;
  v_beans uuid;
  v_filter uuid;
  v_po_full uuid;
  v_po_partial uuid;
  v_po_awaiting uuid;
  v_line uuid;
  v_bill uuid;
  v_before numeric;
  v_after numeric;
  v_moves_before int;
  v_moves_after int;
  v_report jsonb := '{}'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can seed the sandbox';
  END IF;

  -- Either flag, because the fleet uses both and a guard that binds to the
  -- wrong one is a guard that never binds. sandbox.flowwink.com carries
  -- demo_mode.enabled and NOT sandbox_mode — the nightly rebuild there runs
  -- through demo-cycle, not sandbox_reset_wipe. Checking only the latter would
  -- have made this function unrunnable on the one instance it exists for.
  -- One reader for the three instance kinds (20260822130000). A testbed is
  -- neither a sandbox nor a demo: it is never reset, so demo-cycle — which
  -- keys on demo_mode alone — must never see it.
  v_mode := public.seed_chain_mode();
  IF v_mode IS NULL THEN
    RAISE EXCEPTION '% refused: this instance is not a sandbox, demo or testbed (site_settings.sandbox_mode / demo_mode.enabled / testbed_mode.enabled)', 'sandbox_seed_p2p';
  END IF;

  -- ── 1. The ground ────────────────────────────────────────────────────────
  -- The reset truncates every table outside its KEEP list, and stock_locations
  -- is not on it — so the warehouse layout is gone every morning and goods
  -- receipt refuses with "no active internal destination location". Asserting
  -- it here means the seed cannot run on empty ground, which is exactly the
  -- property that makes the platform-config class disappear.
  PERFORM public.seed_stock_locations();
  SELECT id INTO v_loc_in FROM public.stock_locations
   WHERE location_type = 'internal' AND COALESCE(is_active, true) LIMIT 1;
  IF v_loc_in IS NULL THEN
    RAISE EXCEPTION 'sandbox_seed_p2p: no internal stock location after seeding — the ground is broken, not the seed';
  END IF;

  -- ── 2. Master data ───────────────────────────────────────────────────────
  -- Three vendors, deliberately different, so currency, cadence and 3-way match
  -- each have a reason to exist rather than being asserted about. payment_terms
  -- is the platform's word form ('net30'), not the day count — a bare 30 lands
  -- as the string '30' and the vendor list renders "30" instead of "Net 30".
  INSERT INTO public.vendors (name, email, currency, payment_terms, is_active)
  SELECT 'Caffè Milano S.r.l.', 'ordini@caffemilano.example', 'EUR', 'net30', true
   WHERE NOT EXISTS (SELECT 1 FROM public.vendors WHERE name = 'Caffè Milano S.r.l.');
  INSERT INTO public.vendors (name, email, currency, payment_terms, is_active)
  SELECT 'Söderberg Rosteri AB', 'order@soderbergrosteri.example', 'SEK', 'net20', true
   WHERE NOT EXISTS (SELECT 1 FROM public.vendors WHERE name = 'Söderberg Rosteri AB');
  INSERT INTO public.vendors (name, email, currency, payment_terms, is_active)
  SELECT 'Nordic Parts Distribution AB', 'sales@nordicparts.example', 'SEK', 'net30', true
   WHERE NOT EXISTS (SELECT 1 FROM public.vendors WHERE name = 'Nordic Parts Distribution AB');

  SELECT id INTO v_vendor_machines FROM public.vendors WHERE name = 'Caffè Milano S.r.l.';
  SELECT id INTO v_vendor_roastery FROM public.vendors WHERE name = 'Söderberg Rosteri AB';
  SELECT id INTO v_vendor_parts    FROM public.vendors WHERE name = 'Nordic Parts Distribution AB';

  -- Physical goods. The old catalogue had none, which is why inventory,
  -- picking and returns had never run a single time.
  INSERT INTO public.products (name, description, type, price_cents, currency, is_active, track_inventory, low_stock_threshold)
  SELECT 'Milano Due — espressomaskin, 2 grupper',
         'Halvautomatisk espressomaskin i två grupper. Serienummermärkt, två års garanti.',
         'one_time', 4890000, 'SEK', true, true, 2
   WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name LIKE 'Milano Due%');
  INSERT INTO public.products (name, description, type, price_cents, currency, is_active, track_inventory, low_stock_threshold)
  SELECT 'Söderberg Mörkrost — 1 kg',
         'Mörkrostade bönor för espresso. Levereras veckovis.',
         'one_time', 34900, 'SEK', true, true, 40
   WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name LIKE 'Söderberg Mörkrost%');
  INSERT INTO public.products (name, description, type, price_cents, currency, is_active, track_inventory, low_stock_threshold)
  SELECT 'Vattenfilter FX-200', 'Utbytesfilter, rekommenderat byte var sjätte månad.',
         'one_time', 89900, 'SEK', true, true, 15
   WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name LIKE 'Vattenfilter FX-200%');

  SELECT id INTO v_machine FROM public.products WHERE name LIKE 'Milano Due%';
  SELECT id INTO v_beans   FROM public.products WHERE name LIKE 'Söderberg Mörkrost%';
  SELECT id INTO v_filter  FROM public.products WHERE name LIKE 'Vattenfilter FX-200%';

  -- ── 3. Live P2P: fully received ──────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE notes = 'seed:p2p:full') THEN
    SELECT COALESCE(stock_quantity, 0) INTO v_before FROM public.products WHERE id = v_beans;
    SELECT count(*) INTO v_moves_before FROM public.stock_moves WHERE product_id = v_beans;

    INSERT INTO public.purchase_orders (vendor_id, status, currency, order_date, expected_delivery, notes)
    VALUES (v_vendor_roastery, 'confirmed', 'SEK', current_date - 9, current_date - 7, 'seed:p2p:full')
    RETURNING id INTO v_po_full;
    INSERT INTO public.purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price_cents, tax_rate, total_cents)
    VALUES (v_po_full, v_beans, 'Söderberg Mörkrost 1 kg', 120, 18500, 0.25, 120 * 18500)
    RETURNING id INTO v_line;

    PERFORM public.receive_purchase_order(
      v_po_full,
      jsonb_build_array(jsonb_build_object('po_line_id', v_line, 'quantity_received', 120)),
      v_loc_in);

    SELECT COALESCE(stock_quantity, 0) INTO v_after FROM public.products WHERE id = v_beans;
    SELECT count(*) INTO v_moves_after FROM public.stock_moves WHERE product_id = v_beans;

    -- The invariant, asserted where it is cheapest to assert: the receipt said
    -- 120, so the balance moved 120 and the journal grew. A receipt that
    -- returns success while the world stands still is the failure this whole
    -- exercise exists to catch.
    IF (v_after - v_before) <> 120 THEN
      RAISE EXCEPTION 'sandbox_seed_p2p: received 120 but balance moved % (from % to %)',
        (v_after - v_before), v_before, v_after;
    END IF;
    IF v_moves_after <= v_moves_before THEN
      RAISE EXCEPTION 'sandbox_seed_p2p: balance moved but no stock_move was written';
    END IF;

    v_report := v_report || jsonb_build_object('po_full', jsonb_build_object(
      'received', 120, 'balance_before', v_before, 'balance_after', v_after));
  END IF;

  -- ── 4. Live P2P: partially received, backorder standing ──────────────────
  -- Odoo calls the remainder a backorder. The middles are where the bugs live,
  -- so the seed leaves one standing on purpose.
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE notes = 'seed:p2p:partial') THEN
    INSERT INTO public.purchase_orders (vendor_id, status, currency, order_date, expected_delivery, notes)
    VALUES (v_vendor_parts, 'confirmed', 'SEK', current_date - 5, current_date - 2, 'seed:p2p:partial')
    RETURNING id INTO v_po_partial;
    INSERT INTO public.purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price_cents, tax_rate, total_cents)
    VALUES (v_po_partial, v_filter, 'Vattenfilter FX-200', 40, 42000, 0.25, 40 * 42000)
    RETURNING id INTO v_line;

    PERFORM public.receive_purchase_order(
      v_po_partial,
      jsonb_build_array(jsonb_build_object('po_line_id', v_line, 'quantity_received', 25)),
      v_loc_in);

    IF (SELECT status FROM public.purchase_orders WHERE id = v_po_partial) <> 'partially_received' THEN
      RAISE EXCEPTION 'sandbox_seed_p2p: 25 of 40 received but PO status is %, expected partially_received',
        (SELECT status FROM public.purchase_orders WHERE id = v_po_partial);
    END IF;

    v_report := v_report || jsonb_build_object('po_partial',
      jsonb_build_object('ordered', 40, 'received', 25, 'backorder', 15));
  END IF;

  -- ── 5. In flight: confirmed, awaiting delivery ───────────────────────────
  -- The long-lead-time import. An agent arriving to work has something to
  -- follow up.
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE notes = 'seed:p2p:awaiting') THEN
    INSERT INTO public.purchase_orders (vendor_id, status, currency, order_date, expected_delivery, notes)
    VALUES (v_vendor_machines, 'confirmed', 'EUR', current_date - 12, current_date + 9, 'seed:p2p:awaiting')
    RETURNING id INTO v_po_awaiting;
    INSERT INTO public.purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price_cents, tax_rate, total_cents)
    VALUES (v_po_awaiting, v_machine, 'Milano Due, 2 grupper', 2, 285000, 0.25, 2 * 285000);

    v_report := v_report || jsonb_build_object('po_awaiting',
      jsonb_build_object('vendor', 'Caffè Milano S.r.l.', 'currency', 'EUR', 'due_in_days', 9));
  END IF;

  -- ── 6. Vendor bill awaiting 3-way match ──────────────────────────────────
  IF v_po_full IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.vendor_invoices WHERE notes = 'seed:p2p:bill') THEN
    INSERT INTO public.vendor_invoices (
      invoice_number, vendor_id, purchase_order_id, invoice_date, due_date,
      subtotal_cents, tax_cents, total_cents, currency, status, notes)
    VALUES ('SR-2026-0413', v_vendor_roastery, v_po_full, current_date - 6, current_date + 14,
            120 * 18500, (120 * 18500 * 0.25)::bigint, (120 * 18500 * 1.25)::bigint,
            'SEK', 'received', 'seed:p2p:bill')
    RETURNING id INTO v_bill;
    v_report := v_report || jsonb_build_object('vendor_bill', 'SR-2026-0413');
  END IF;

  RETURN jsonb_build_object(
    'seeded', true,
    'instance_kind', v_mode,
    'chain', 'procure-to-pay',
    'detail', v_report,
    'note', 'Stock in this instance is earned: every unit arrived on a goods receipt that ran.');
END; $function$;


GRANT EXECUTE ON FUNCTION public.sandbox_seed_p2p() TO authenticated, service_role;
