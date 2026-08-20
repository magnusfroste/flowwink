-- The receipt reference the cost lookup could not read.
--
-- process_stock_move_valuation asks resolve_inbound_unit_cost what an inbound
-- move cost. For reference_type='goods_receipt' the reference_id is a
-- goods_receipts.id — but the lookup compared it to
-- purchase_order_lines.purchase_order_id. Always zero rows. The fallback then
-- returned products.cost_cents, which is 0 for anything the operator never
-- priced, and the GRNI journal entry is guarded by `v_unit_cost > 0` — so the
-- receipt posted no accounting at all, silently.
--
-- Two fixes:
--   1. Resolve a goods_receipt reference through goods_receipts to its PO.
--   2. Stop swallowing. The old `EXCEPTION WHEN others THEN v_cost := NULL`
--      turned a bad reference into a cost of 0 with nothing in any log — the
--      exact reason this bug lived. A non-uuid reference is now shaped away by
--      a regex instead of an exception, and anything else raises a WARNING that
--      names the reference.

CREATE OR REPLACE FUNCTION public.resolve_inbound_unit_cost(
  p_product_id uuid,
  p_reference_type text,
  p_reference_id text
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_cost bigint;
  v_ref uuid;
BEGIN
  IF p_reference_type IN ('purchase_order','po','goods_receipt') AND p_reference_id IS NOT NULL THEN
    -- Shape-check instead of catch-all: a reference that is not a uuid is not
    -- an error worth aborting valuation over, but it is not silently a cost of 0
    -- either — it falls through to the product cost below, visibly.
    IF p_reference_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_ref := p_reference_id::uuid;

      IF p_reference_type = 'goods_receipt' THEN
        -- The reference is a goods_receipts.id. Reach the PO through it.
        SELECT pol.unit_price_cents INTO v_cost
        FROM goods_receipts gr
        JOIN purchase_order_lines pol
          ON pol.purchase_order_id = gr.purchase_order_id
        WHERE gr.id = v_ref
          AND pol.product_id = p_product_id
        ORDER BY pol.created_at
        LIMIT 1;
      ELSE
        SELECT pol.unit_price_cents INTO v_cost
        FROM purchase_order_lines pol
        WHERE pol.product_id = p_product_id
          AND pol.purchase_order_id = v_ref
        LIMIT 1;
      END IF;

      IF v_cost IS NULL THEN
        RAISE WARNING 'resolve_inbound_unit_cost: no % line found for product % (reference %), falling back to products.cost_cents',
          p_reference_type, p_product_id, p_reference_id;
      END IF;
    ELSE
      RAISE WARNING 'resolve_inbound_unit_cost: reference_id % is not a uuid for reference_type %', p_reference_id, p_reference_type;
    END IF;

    IF v_cost IS NOT NULL THEN RETURN v_cost; END IF;
  END IF;

  SELECT cost_cents INTO v_cost FROM products WHERE id = p_product_id;
  RETURN COALESCE(v_cost, 0);
END;
$function$;
