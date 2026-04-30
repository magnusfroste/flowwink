-- ============================================================================
-- Stock event listener: stock.movement events → automatic quant updates
-- ============================================================================
-- POS sales emit `stock.movement` events via emit_platform_event.
-- This trigger applies them to the WH/MAIN location automatically.
-- Demonstrates platform event bus → reactive module wiring.
-- ============================================================================

-- 1. Internal applier — bypasses role check (called only from trusted DB trigger)
CREATE OR REPLACE FUNCTION public.apply_stock_movement_event(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_qty_delta numeric;
  v_location_id uuid;
  v_location_code text;
  v_reason text;
  v_move_id uuid;
BEGIN
  v_product_id := NULLIF(p_payload->>'product_id','')::uuid;
  v_qty_delta := COALESCE((p_payload->>'qty_delta')::numeric, 0);
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
    -- Fallback: any internal location
    SELECT id INTO v_location_id
      FROM public.stock_locations
     WHERE location_type = 'internal' AND is_active = true
     ORDER BY created_at LIMIT 1;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE NOTICE 'apply_stock_movement_event: no internal location found, skipping';
    RETURN;
  END IF;

  -- Upsert quant
  INSERT INTO public.stock_quants (product_id, location_id, quantity, lot_id)
  VALUES (v_product_id, v_location_id, v_qty_delta, NULL)
  ON CONFLICT (product_id, location_id, lot_id) WHERE lot_id IS NULL
  DO UPDATE SET quantity = stock_quants.quantity + EXCLUDED.quantity, updated_at = now();

  -- Best-effort: keep products.stock_quantity mirror in sync for low_stock alerts
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + v_qty_delta::int,
         updated_at = now()
   WHERE id = v_product_id AND track_inventory = true;

  -- Log a stock_move row for traceability
  BEGIN
    INSERT INTO public.stock_moves
      (product_id, source_location_id, destination_location_id, quantity, state, notes)
    SELECT
      v_product_id,
      CASE WHEN v_qty_delta < 0 THEN v_location_id ELSE (SELECT id FROM stock_locations WHERE code='WH/CUSTOMERS' LIMIT 1) END,
      CASE WHEN v_qty_delta > 0 THEN v_location_id ELSE (SELECT id FROM stock_locations WHERE code='WH/CUSTOMERS' LIMIT 1) END,
      abs(v_qty_delta), 'done', v_reason
    WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stock_moves');
  EXCEPTION WHEN others THEN
    -- stock_moves shape may differ; don't fail the event apply
    NULL;
  END;
END;
$$;

-- 2. Trigger function on agent_events
CREATE OR REPLACE FUNCTION public.handle_stock_movement_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Never block the event insert; log and continue
  RAISE NOTICE 'handle_stock_movement_event failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_events_stock_movement ON public.agent_events;
CREATE TRIGGER trg_agent_events_stock_movement
AFTER INSERT ON public.agent_events
FOR EACH ROW
WHEN (NEW.event_name = 'stock.movement')
EXECUTE FUNCTION public.handle_stock_movement_event();

COMMENT ON FUNCTION public.apply_stock_movement_event IS
  'Internal: applies a stock.movement event payload to stock_quants + products mirror. Called only by handle_stock_movement_event trigger.';
COMMENT ON FUNCTION public.handle_stock_movement_event IS
  'Reactive listener on agent_events: when a stock.movement event is emitted (e.g. by record_pos_sale_v2), automatically decrements/increments the relevant stock_quant on WH/MAIN.';
