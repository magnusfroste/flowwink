-- Lagret följer ordern.
--
-- Processbatteriet 2026-09-19 (order-to-delivery):
--
--   DUBBELT      Orderraden reserverar sina varor i ordersekunden
--                (trigger_order_item_stock_decrement, referens 'order').
--                allocate_picking reserverade SAMMA varor en gång till (referens
--                'picking_order'): tre sålda höll sex, och med tre på hyllan kom
--                orderns egen plocklista tillbaka "short — free 0, need 3".
--   OMTAG        allocate_picking återanvände plockhuvudet men satte in varje
--                rad igen: andra anropet gav dubbla rader (och reserverade igen).
--   PLOCK        confirm_pick tog emot 5 på en rad om 3.
--   SKEPPNING    ship_picking saknade statusvillkor: en plockning där ingen rad
--                plockats skeppades, ordern blev 'shipped' och varukostnaden
--                bokfördes för varor ingen rört.
--   SPÅRBARHET   apply_stock_movement_event skrev lagerrörelsen utan den
--                referens händelsen bar (RMA, kassaköp, order): rörelsen och dess
--                verifikat gick inte att härleda.
--
-- De tre långa funktionerna ändras IN PLACE: migrationen läser den levande
-- kroppen, sätter in ett markerat stycke vid ett ankare och kör om den. Ankaret
-- MÅSTE finnas — annars avbryts migrationen hellre än att lämna en halv fix.
-- Markören gör omkörning till en no-op.

-- Plockningen tar över orderns reservation i stället för att lägga en till.
CREATE OR REPLACE FUNCTION public.release_order_auto_reservation(p_order_id uuid, p_product_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE r record; v_n integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.stock_reservations
     WHERE reference_type = 'order' AND reference_id = p_order_id::text
       AND product_id = p_product_id AND state = 'reserved'
  LOOP
    PERFORM public.cancel_reservation(r.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $fn$;

REVOKE ALL ON FUNCTION public.release_order_auto_reservation(uuid, uuid) FROM PUBLIC, anon, authenticated;

DO $patch$
DECLARE
  v_def text;
  PROCEDURE_MARK constant text := '20260919170000';
BEGIN
  -- ── confirm_pick: aldrig mer än raden begär, aldrig negativt ────────────────
  v_def := pg_get_functiondef('public.confirm_pick(uuid,numeric,uuid)'::regprocedure);
  IF position('-- pick-bounds ' || PROCEDURE_MARK in v_def) = 0 THEN
    IF position('v_picking_id := v_line.picking_order_id;' in v_def) = 0 THEN RAISE EXCEPTION 'lagret-foljer-ordern: anchor missing in confirm_pick'; END IF;
    v_def := replace(v_def, 'v_picking_id := v_line.picking_order_id;',
      'v_picking_id := v_line.picking_order_id;' || E'\n' ||
      '  -- pick-bounds ' || PROCEDURE_MARK || E'\n' ||
      '  IF p_qty_picked IS NULL OR p_qty_picked < 0 THEN RAISE EXCEPTION ''qty_picked must be zero or more''; END IF;' || E'\n' ||
      '  IF p_qty_picked > v_line.qty_requested THEN' || E'\n' ||
      '    RAISE EXCEPTION ''qty_picked % exceeds the % this line asks for — a picking line never ships more than was ordered'', p_qty_picked, v_line.qty_requested;' || E'\n' ||
      '  END IF;');
    EXECUTE v_def;
  END IF;

  -- ── ship_picking: bara det som plockats skeppas ─────────────────────────────
  v_def := pg_get_functiondef('public.ship_picking(uuid,text,text)'::regprocedure);
  IF position('-- pick-before-ship ' || PROCEDURE_MARK in v_def) = 0 THEN
    IF position('RAISE EXCEPTION ''Cannot ship cancelled picking_order''; END IF;' in v_def) = 0 THEN RAISE EXCEPTION 'lagret-foljer-ordern: anchor missing in ship_picking'; END IF;
    v_def := replace(v_def, 'RAISE EXCEPTION ''Cannot ship cancelled picking_order''; END IF;',
      'RAISE EXCEPTION ''Cannot ship cancelled picking_order''; END IF;' || E'\n' ||
      '  -- pick-before-ship ' || PROCEDURE_MARK || E'\n' ||
      '  IF v_po.status <> ''picked'' THEN' || E'\n' ||
      '    RAISE EXCEPTION ''Picking order % is % — every line must be confirmed with confirm_pick before it ships (it becomes "picked" when the last line is confirmed)'', p_picking_order_id, v_po.status;' || E'\n' ||
      '  END IF;' || E'\n' ||
      '  IF NOT EXISTS (SELECT 1 FROM public.picking_lines pl WHERE pl.picking_order_id = p_picking_order_id AND COALESCE(pl.qty_picked, 0) > 0) THEN' || E'\n' ||
      '    RAISE EXCEPTION ''Nothing was picked on picking order % — there is nothing to ship'', p_picking_order_id;' || E'\n' ||
      '  END IF;');
    EXECUTE v_def;
  END IF;

  -- ── allocate_picking: ta över orderns reservation; ett omtag lägger inget till ─
  v_def := pg_get_functiondef('public.allocate_picking(uuid,uuid)'::regprocedure);
  IF position('-- adopt-order-reservation ' || PROCEDURE_MARK in v_def) = 0 THEN
    IF position('v_reservation_id := public.reserve_stock(' in v_def) = 0
       OR position('  IF v_picking_id IS NULL THEN' in v_def) = 0 THEN
      RAISE EXCEPTION 'lagret-foljer-ordern: anchor missing in allocate_picking';
    END IF;
    v_def := replace(v_def, 'v_reservation_id := public.reserve_stock(',
      '-- adopt-order-reservation ' || PROCEDURE_MARK || E'\n' ||
      '        PERFORM public.release_order_auto_reservation(p_order_id, v_item.product_id);' || E'\n' ||
      '        v_reservation_id := public.reserve_stock(');
    v_def := replace(v_def, '  IF v_picking_id IS NULL THEN',
      '  -- allocate-once ' || PROCEDURE_MARK || E'\n' ||
      '  IF v_picking_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.picking_lines pl WHERE pl.picking_order_id = v_picking_id) THEN' || E'\n' ||
      '    RETURN jsonb_build_object(''success'', true, ''picking_order_id'', v_picking_id, ''already_allocated'', true,' || E'\n' ||
      '      ''lines_total'', (SELECT count(*) FROM public.picking_lines pl WHERE pl.picking_order_id = v_picking_id),' || E'\n' ||
      '      ''lines_short'', (SELECT count(*) FROM public.picking_lines pl WHERE pl.picking_order_id = v_picking_id AND pl.status = ''short''),' || E'\n' ||
      '      ''lines'', (SELECT COALESCE(jsonb_agg(jsonb_build_object(''line_id'', pl.id, ''product_id'', pl.product_id, ''qty'', pl.qty_requested, ''reserved'', pl.status <> ''short'', ''short_reason'', pl.notes) ORDER BY pl.created_at), ''[]''::jsonb)' || E'\n' ||
      '                   FROM public.picking_lines pl WHERE pl.picking_order_id = v_picking_id));' || E'\n' ||
      '  END IF;' || E'\n' ||
      '  IF v_picking_id IS NULL THEN');
    EXECUTE v_def;
  END IF;

  -- ── apply_stock_movement_event: rörelsen bär händelsens referens ────────────
  v_def := pg_get_functiondef('public.apply_stock_movement_event(jsonb)'::regprocedure);
  IF position('-- move-reference ' || PROCEDURE_MARK in v_def) = 0 THEN
    IF position('(product_id, quantity, move_type, from_location_id, to_location_id, lot_id, state, notes)' in v_def) = 0
       OR position('(product_id, quantity, move_type, from_location_id, to_location_id, state, notes)' in v_def) = 0
       OR position('v_lot_id := NULLIF(p_payload->>''lot_id'','''')::uuid;' in v_def) = 0
       -- The three VALUES lists get two more values each. A list that is NOT found would leave
       -- an INSERT with more columns than values — and plpgsql only finds that out at run time.
       OR position('v_lot_id, ''done'', v_reason);' in v_def) = 0
       OR position('v_reason || '' — lot '' || COALESCE(v_alloc->>''lot_number'', ''?''));' in v_def) = 0
       OR position('ELSE v_reason END);' in v_def) = 0 THEN
      RAISE EXCEPTION 'lagret-foljer-ordern: anchor missing in apply_stock_movement_event';
    END IF;
    -- Referensen läses ur nyttolasten; typen är orsakens första ord (rma_restock → rma).
    v_def := replace(v_def, 'v_lot_id := NULLIF(p_payload->>''lot_id'','''')::uuid;',
      'v_lot_id := NULLIF(p_payload->>''lot_id'','''')::uuid;' || E'\n' ||
      '  -- move-reference ' || PROCEDURE_MARK);
    v_def := replace(v_def, '(product_id, quantity, move_type, from_location_id, to_location_id, lot_id, state, notes)',
                            '(product_id, quantity, move_type, from_location_id, to_location_id, lot_id, state, notes, reference_type, reference_id)');
    v_def := replace(v_def, '(product_id, quantity, move_type, from_location_id, to_location_id, state, notes)',
                            '(product_id, quantity, move_type, from_location_id, to_location_id, state, notes, reference_type, reference_id)');
    v_def := replace(v_def, 'v_lot_id, ''done'', v_reason);',
      'v_lot_id, ''done'', v_reason, COALESCE(NULLIF(p_payload->>''reference_type'',''''), split_part(v_reason, ''_'', 1)), NULLIF(p_payload->>''reference_id'',''''));');
    v_def := replace(v_def, 'v_reason || '' — lot '' || COALESCE(v_alloc->>''lot_number'', ''?''));',
      'v_reason || '' — lot '' || COALESCE(v_alloc->>''lot_number'', ''?''), COALESCE(NULLIF(p_payload->>''reference_type'',''''), split_part(v_reason, ''_'', 1)), NULLIF(p_payload->>''reference_id'',''''));');
    v_def := replace(v_def, 'ELSE v_reason END);',
      'ELSE v_reason END, COALESCE(NULLIF(p_payload->>''reference_type'',''''), split_part(v_reason, ''_'', 1)), NULLIF(p_payload->>''reference_id'',''''));');
    EXECUTE v_def;
  END IF;
END $patch$;

-- Beviset: varje ändring sitter i den LEVANDE kroppen, och en order om tre håller tre.
DO $proof$
DECLARE v_fn text; v_prod uuid; v_order uuid; v_loc uuid; v_r jsonb; v_held numeric; v_line uuid; v_pick uuid;
BEGIN
  FOR v_fn IN SELECT unnest(ARRAY['confirm_pick(uuid,numeric,uuid)', 'ship_picking(uuid,text,text)', 'allocate_picking(uuid,uuid)', 'apply_stock_movement_event(jsonb)']) LOOP
    IF position('20260919170000' in pg_get_functiondef(('public.' || v_fn)::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'proof: % does not carry the 20260919170000 change', v_fn;
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_loc := public.default_internal_location();
  IF v_loc IS NULL THEN
    RAISE NOTICE 'lagret-foljer-ordern: no internal stock location on this instance — behaviour proof skipped (markers verified)';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO products (name, price_cents, currency, track_inventory, stock_quantity, cost_cents)
    VALUES ('proof: stock follows the order', 10000, 'SEK', true, 0, 4000) RETURNING id INTO v_prod;
    PERFORM public.adjust_quant(v_prod, v_loc, 3, NULL, 'proof opening stock');
    INSERT INTO orders (customer_email, customer_name, total_cents, status, currency) VALUES ('proof-stock@example.test', 'proof', 30000, 'pending', 'SEK') RETURNING id INTO v_order;
    INSERT INTO order_items (order_id, product_id, product_name, quantity, price_cents) VALUES (v_order, v_prod, 'proof', 3, 10000);

    v_r := public.allocate_picking(v_order, NULL);
    IF (v_r->>'lines_short')::int <> 0 THEN RAISE EXCEPTION 'proof: the order''s own picking is short: %', v_r; END IF;
    SELECT COALESCE(sum(quantity), 0) INTO v_held FROM stock_reservations WHERE product_id = v_prod AND state = 'reserved';
    IF v_held <> 3 THEN RAISE EXCEPTION 'proof: three units sold hold % (expected 3)', v_held; END IF;
    v_pick := (v_r->>'picking_order_id')::uuid;
    v_r := public.allocate_picking(v_order, NULL);
    IF (SELECT count(*) FROM picking_lines WHERE picking_order_id = v_pick) <> 1 THEN RAISE EXCEPTION 'proof: a repeated allocation added a line'; END IF;

    BEGIN
      PERFORM public.ship_picking(v_pick, NULL, NULL);
      RAISE EXCEPTION 'proof: a picking nobody picked was shipped';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Picking order % is %' THEN RAISE; END IF;
    END;
    SELECT id INTO v_line FROM picking_lines WHERE picking_order_id = v_pick LIMIT 1;
    BEGIN
      PERFORM public.confirm_pick(v_line, 5, NULL);
      RAISE EXCEPTION 'proof: five were picked on a line of three';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'qty_picked % exceeds%' THEN RAISE; END IF;
    END;
    PERFORM public.confirm_pick(v_line, 3, NULL);
    PERFORM public.ship_picking(v_pick, NULL, NULL);

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'lagret-foljer-ordern: proof passed';
END $proof$;
