-- Selling 500 of a thing we have 43 of.
--
-- QA placed an order for 500 units of a product with stock_quantity = 43,
-- track_inventory = true, allow_backorder = false. The order was created,
-- returned success, and the balance landed on 0 — because the decrement did
-- `GREATEST(stock_quantity - qty, 0)`, which does not clamp an oversell so much
-- as erase the evidence of one. 457 units of shortfall vanished into a floor.
--
-- Two decisions, made explicitly:
--
--   allow_backorder = false → the order is REFUSED, with the available quantity
--   in the message so the caller (human or agent) can re-ask for something
--   possible. This is the product's own switch; honouring it is the whole point
--   of it existing. The check is a BEFORE INSERT trigger on order_items so every
--   writer is covered — the storefront, create-checkout, an agent, a raw insert.
--
--   allow_backorder = true → the order goes through and stock_quantity is
--   ALLOWED TO GO NEGATIVE. The negative IS the backorder quantity, and nothing
--   downstream chokes on it: getStockStatus() in src/hooks/useProducts.ts reads
--   `stock_quantity <= 0` as out_of_stock, and StockStatusBadge already renders
--   that as "Pre-order" when allow_backorder is set. A separate backorder column
--   would need a second writer, a second reader and a reconciliation between
--   them; the sign carries it with none of that. `-457` also says how deep the
--   hole is, which the old clamp destroyed.
--
-- Untracked products (track_inventory = false, or stock_quantity IS NULL) are
-- unaffected — same rule getStockStatus/isProductPurchasable already use.

CREATE OR REPLACE FUNCTION public.trigger_order_item_stock_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_p record;
BEGIN
  IF NEW.product_id IS NULL OR COALESCE(NEW.quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT name, stock_quantity, track_inventory, allow_backorder
    INTO v_p
    FROM public.products
   WHERE id = NEW.product_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Untracked, or explicitly backorderable: nothing to refuse.
  IF NOT v_p.track_inventory OR v_p.stock_quantity IS NULL OR v_p.allow_backorder THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity > v_p.stock_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for "%": % requested, % available. Enable allow_backorder on the product to accept orders beyond the on-hand quantity, or reduce the quantity.',
      v_p.name, NEW.quantity, GREATEST(v_p.stock_quantity, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_order_item_stock_guard ON public.order_items;
CREATE TRIGGER trg_order_item_stock_guard
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_order_item_stock_guard();

-- The decrement itself: no clamp, no legacy table, and the quant moves with the
-- mirror instead of drifting from it.
CREATE OR REPLACE FUNCTION public.trigger_order_item_stock_decrement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loc uuid;
  v_customer_loc uuid;
BEGIN
  IF NEW.product_id IS NULL OR COALESCE(NEW.quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_loc := public.default_internal_location();
  SELECT id INTO v_customer_loc FROM public.stock_locations
   WHERE code = 'WH/CUSTOMERS' AND is_active = true LIMIT 1;
  IF v_customer_loc IS NULL THEN
    SELECT id INTO v_customer_loc FROM public.stock_locations
     WHERE location_type = 'customer' AND is_active = true ORDER BY created_at LIMIT 1;
  END IF;

  INSERT INTO public.stock_moves
    (product_id, variant_id, quantity, move_type, reference_type, reference_id,
     from_location_id, to_location_id, notes)
  VALUES (NEW.product_id, NEW.variant_id, -(NEW.quantity), 'out', 'order', NEW.order_id::text,
          v_loc, v_customer_loc, 'Auto-decrement from order item');

  -- The balance. A negative result is a real backorder position (see the guard
  -- above), not something to hide behind GREATEST(…, 0).
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) - NEW.quantity,
         updated_at = now()
   WHERE id = NEW.product_id
     AND (track_inventory = true OR stock_quantity IS NOT NULL);

  PERFORM public.upsert_stock_quant(NEW.product_id, v_loc, -(NEW.quantity), NULL);

  RETURN NEW;
END;
$function$;
