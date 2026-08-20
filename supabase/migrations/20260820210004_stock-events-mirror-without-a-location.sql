-- The stock event that gave up on everything because one thing was missing.
--
-- Return-to-stock, POS decrements and service-order consumption all travel as
-- an agent_events row named 'stock.movement'. apply_stock_movement_event booked
-- them. Three faults, each hidden by the next:
--
--   1. No stock location → `RETURN`. But products.stock_quantity — the number
--      the storefront, the low-stock alert and the reorder loop actually read —
--      needs no location. One missing row threw away the part that still worked.
--   2. The quant upsert targeted `ON CONFLICT (product_id, location_id, lot_id)
--      WHERE lot_id IS NULL`, and no such partial index existed. That is not a
--      no-op, it RAISES — so on an instance that DID have locations, the whole
--      function aborted. (The index arrives in 20260820210002.)
--   3. The traceability INSERT wrote `source_location_id` /
--      `destination_location_id`; stock_moves has `from_location_id` /
--      `to_location_id`. Every insert failed and was eaten by
--      `EXCEPTION WHEN others THEN NULL`.
--
-- And the trigger above it turned any of the above into `RAISE NOTICE`, which
-- goes nowhere a human or an agent will ever look. agent_events has a
-- `last_error` column; failures land there now.

CREATE OR REPLACE FUNCTION public.apply_stock_movement_event(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id uuid;
  v_qty_delta numeric;
  v_location_id uuid;
  v_location_code text;
  v_reason text;
  v_customer_loc uuid;
BEGIN
  v_product_id := NULLIF(p_payload->>'product_id','')::uuid;
  -- Accept qty_delta | quantity_delta | quantity | qty — emitters disagree
  -- (record_pos_sale_v2 + emit_service_order_event send `quantity`) and the
  -- old single-name read made every deduction a silent no-op.
  v_qty_delta := COALESCE(
    (p_payload->>'qty_delta')::numeric,
    (p_payload->>'quantity_delta')::numeric,
    (p_payload->>'quantity')::numeric,
    (p_payload->>'qty')::numeric,
    0);
  v_location_code := COALESCE(p_payload->>'location_code', 'WH/MAIN');
  v_reason := COALESCE(p_payload->>'reason', 'event:stock.movement');

  -- Skip if no product or zero delta (e.g. POS line with custom product_name only)
  IF v_product_id IS NULL OR v_qty_delta = 0 THEN
    RETURN;
  END IF;

  -- Resolve location
  SELECT id INTO v_location_id
    FROM public.stock_locations
   WHERE code = v_location_code AND is_active = true
   LIMIT 1;

  IF v_location_id IS NULL THEN
    v_location_id := public.default_internal_location();
  END IF;

  -- The mirror does not need a location. Do it FIRST, unconditionally, so a
  -- missing warehouse row can never again cost us the number the product page
  -- and the reorder loop read.
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + v_qty_delta::int,
         updated_at = now()
   WHERE id = v_product_id AND track_inventory = true;

  IF v_location_id IS NULL THEN
    RAISE WARNING 'apply_stock_movement_event: no stock location for code % — mirrored products.stock_quantity but booked no quant. Run SELECT public.seed_stock_locations().', v_location_code;
    RETURN;
  END IF;

  PERFORM public.upsert_stock_quant(v_product_id, v_location_id, v_qty_delta, NULL);

  -- Traceability. Column names now match stock_moves; no swallow.
  SELECT id INTO v_customer_loc FROM public.stock_locations
   WHERE code = 'WH/CUSTOMERS' AND is_active = true LIMIT 1;
  IF v_customer_loc IS NULL THEN
    SELECT id INTO v_customer_loc FROM public.stock_locations
     WHERE location_type = 'customer' AND is_active = true ORDER BY created_at LIMIT 1;
  END IF;

  INSERT INTO public.stock_moves
    (product_id, quantity, move_type, from_location_id, to_location_id, state, notes)
  VALUES (
    v_product_id,
    abs(v_qty_delta)::int,
    CASE WHEN v_qty_delta < 0 THEN 'out' ELSE 'in' END,
    CASE WHEN v_qty_delta < 0 THEN v_location_id ELSE v_customer_loc END,
    CASE WHEN v_qty_delta > 0 THEN v_location_id ELSE v_customer_loc END,
    'done', v_reason
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_stock_movement_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line jsonb;
BEGIN
  IF NEW.event_name <> 'stock.movement' THEN RETURN NEW; END IF;

  -- Two payload shapes supported:
  --   single: { product_id, qty_delta, location_code?, reason? }
  --   batch:  { lines: [ {...}, {...} ], location_code?, reason? }
  IF jsonb_typeof(NEW.payload->'lines') = 'array' THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(NEW.payload->'lines')
    LOOP
      PERFORM public.apply_stock_movement_event(
        v_line || jsonb_build_object(
          'location_code', COALESCE(v_line->>'location_code', NEW.payload->>'location_code', 'WH/MAIN'),
          'reason', COALESCE(v_line->>'reason', NEW.payload->>'reason', 'event:stock.movement')
        )
      );
    END LOOP;
  ELSE
    PERFORM public.apply_stock_movement_event(NEW.payload);
  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Still never block the event insert — but a swallowed RAISE NOTICE is how
  -- three separate stock bugs stayed invisible. Park the reason on the row so
  -- an operator (and an agent reading agent_events) can see it.
  BEGIN
    UPDATE public.agent_events
       SET last_error = left('handle_stock_movement_event: ' || SQLERRM, 2000)
     WHERE id = NEW.id;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_stock_movement_event failed and could not be recorded: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- The trigger-shaped legacy sibling (apply_stock_movement_event() with no args)
-- still references stock_quants.location_code, a column that does not exist. It
-- is attached to nothing — trg_agent_events_stock_movement runs
-- handle_stock_movement_event — so drop it rather than leave a loaded gun that
-- reads plausible in pg_proc. Only where nothing is wired to it: an instance
-- that still uses it keeps it, and a failed deploy is worse than a stale body.
DO $$
DECLARE v_oid oid;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc
   WHERE proname = 'apply_stock_movement_event'
     AND pronamespace = 'public'::regnamespace
     AND pronargs = 0;
  IF v_oid IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgfoid = v_oid) THEN
    RAISE NOTICE 'apply_stock_movement_event() still has a trigger attached — left in place';
    RETURN;
  END IF;
  DROP FUNCTION public.apply_stock_movement_event();
END $$;
