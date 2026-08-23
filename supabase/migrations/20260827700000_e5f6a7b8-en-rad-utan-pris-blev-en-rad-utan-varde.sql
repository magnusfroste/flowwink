-- A purchase order line with no price became a line priced at zero.
--
--     unit_price_cents: l.unit_price_cents || 0
--
-- Measured on the Nordbrygg testbed 2026-08-23: an order for 60 kg of coffee,
-- created through the gateway with only product_id and quantity, was booked at
-- 0,00 kr — while `pick_vendor_price` for that exact product, vendor and
-- quantity answers 175,00 kr/kg. The lookup existed; nobody asked it.
--
-- Zero is not a missing price, and the consequence is not cosmetic: goods
-- received against a zero line enter stock at zero cost, and the first sale
-- reports an infinite margin. It is the same silent-cost class as the currency
-- that was dropped on its way to the valuation layer — and the `|| 0` sits three
-- lines below a comment explaining why the currency must be OMITTED rather than
-- guessed.
--
-- The rule lives in the DATABASE, not in the handler, for the same reason the
-- currency stamp does: there are six writers of purchase order lines (the skill
-- handler, the PO editor, approve_procurement_suggestion,
-- auto_generate_purchase_orders, award_rfq and the replenishment loop). Fixing
-- the one that happened to be measured leaves five.
--
-- Order of resolution, and it is deliberate:
--   1. the price the caller stated — never overridden, they may have negotiated
--   2. the vendor's own price for THIS quantity (pick_vendor_price, tier included)
--   3. the product's cost price
--   4. refuse — with the product named and the way out spelled out
-- FIRST, the load-bearing line: drop the column default.
--
--     unit_price_cents  bigint  DEFAULT 0  NOT NULL
--
-- That default is what makes "nobody said a price" indistinguishable from "the
-- price is zero" — at the column level, before any trigger can look. It is the
-- SAME structural bug that 20260827300000 removed from purchase_orders.currency
-- (DEFAULT 'SEK' hid "nobody said a currency"), in the same table family, found
-- independently a few hours apart. A default is an answer given on behalf of
-- someone who did not speak.
--
-- NOT NULL stays: it is checked AFTER the BEFORE trigger, so an insert that
-- omits the price still succeeds — the trigger has filled it by then — while an
-- insert that survives with no price at all is still refused by the column.
-- Legitimate zero (a free sample) is still expressible: state it, and the
-- trigger leaves it alone.
ALTER TABLE public.purchase_order_lines ALTER COLUMN unit_price_cents DROP DEFAULT;
ALTER TABLE public.purchase_order_lines ALTER COLUMN total_cents DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.stamp_purchase_order_line_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vendor uuid;
  v_price  bigint;
  v_name   text;
BEGIN
  -- A stated price wins, including a deliberate 0 (free of charge, samples).
  -- Only NULL means "nobody said".
  --
  -- The line amount is still computed here when the caller omitted it. Found by
  -- verifying the claim rather than asserting it: dropping the total_cents
  -- default meant a caller who stated a price but no amount got a NOT NULL
  -- violation, because this branch returned before the sum was reached. A fix
  -- that trades one silent zero for one hard refusal has moved the bug, not
  -- removed it.
  IF NEW.unit_price_cents IS NOT NULL THEN
    IF NEW.total_cents IS NULL THEN
      NEW.total_cents := COALESCE(NEW.quantity, 1) * NEW.unit_price_cents;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.product_id IS NULL THEN
    RAISE EXCEPTION
      'Purchase order line "%" has no unit_price_cents and no product_id to look one up from. Send a price, or a product that carries a vendor price or a cost price.',
      COALESCE(NEW.description, '(unnamed)');
  END IF;

  SELECT po.vendor_id INTO v_vendor
    FROM public.purchase_orders po WHERE po.id = NEW.purchase_order_id;

  SELECT (public.pick_vendor_price(NEW.product_id, v_vendor, COALESCE(NEW.quantity, 1))).unit_price_cents
    INTO v_price;

  IF v_price IS NULL THEN
    SELECT p.cost_cents, p.name INTO v_price, v_name
      FROM public.products p WHERE p.id = NEW.product_id;
  ELSE
    SELECT p.name INTO v_name FROM public.products p WHERE p.id = NEW.product_id;
  END IF;

  IF v_price IS NULL THEN
    RAISE EXCEPTION
      'No purchase price known for %: the vendor has no price for this product and the product has no cost price. Set one with manage_vendor_price, or send unit_price_cents explicitly. Booking it at 0 would let the goods enter stock at zero cost and report an infinite margin when sold.',
      COALESCE(v_name, NEW.product_id::text);
  END IF;

  NEW.unit_price_cents := v_price;
  -- total_cents is the line amount; recompute it from the price we just found,
  -- otherwise the header sums a price the line no longer carries.
  NEW.total_cents := COALESCE(NEW.quantity, 1) * v_price;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_stamp_purchase_order_line_price ON public.purchase_order_lines;
CREATE TRIGGER trg_stamp_purchase_order_line_price
  BEFORE INSERT ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.stamp_purchase_order_line_price();

REVOKE EXECUTE ON FUNCTION public.stamp_purchase_order_line_price() FROM PUBLIC, anon, authenticated;
