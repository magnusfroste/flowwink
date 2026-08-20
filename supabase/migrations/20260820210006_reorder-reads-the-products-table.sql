-- "All stock levels are healthy."
--
-- list_reorder_candidates selected FROM product_stock — the legacy on-hand table
-- that is empty on every instance. A FROM on an empty table returns nothing, so
-- the reorder loop reported perfect health forever, and
-- auto_generate_purchase_orders (which drives off it) had nothing to generate.
-- Never an error, never a warning: the strongest possible statement about stock
-- made from no stock data at all.
--
-- The live on-hand number is products.stock_quantity (what the receipt writes,
-- what the order decrements, what the storefront renders). Candidates come from
-- there now; product_stock survives as an OPTIONAL override for the instances
-- that actually populated it — reorder_point / reorder_quantity / auto_reorder
-- are read from it when a row exists, and derived from the product otherwise.
--
-- Default for a product with no product_stock row: reorder point =
-- low_stock_threshold, reorder quantity = 3× the threshold (min 10, and at least
-- the vendor's minimum order), auto_reorder = true. That last default is what
-- makes auto_generate_purchase_orders able to act; it creates DRAFT purchase
-- orders for an admin to review and send, so an over-eager candidate costs a
-- glance, not money.

CREATE OR REPLACE FUNCTION public.list_reorder_candidates()
RETURNS TABLE(
  product_id uuid,
  product_name text,
  quantity_on_hand integer,
  reorder_point integer,
  reorder_quantity integer,
  vendor_id uuid,
  vendor_name text,
  unit_price_cents integer,
  lead_time_days integer,
  min_order_quantity integer,
  estimated_cost_cents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH candidate AS (
    SELECT
      p.id,
      p.name,
      COALESCE(ps.quantity_on_hand, p.stock_quantity, 0)::int AS on_hand,
      COALESCE(ps.reorder_point, p.low_stock_threshold, 5)::int AS rp,
      COALESCE(
        NULLIF(ps.reorder_quantity, 0),
        GREATEST(COALESCE(p.low_stock_threshold, 5) * 3, 10)
      )::int AS rq,
      COALESCE(ps.auto_reorder, true) AS auto_reorder
    FROM public.products p
    LEFT JOIN public.product_stock ps ON ps.product_id = p.id
    WHERE p.is_active = true
      AND p.track_inventory = true
  )
  SELECT
    c.id,
    c.name,
    c.on_hand,
    c.rp,
    GREATEST(c.rq, COALESCE(vp.min_order_quantity, 1))::int,
    vp.vendor_id,
    v.name,
    vp.unit_price_cents,
    vp.lead_time_days,
    vp.min_order_quantity,
    GREATEST(c.rq, COALESCE(vp.min_order_quantity, 1))::bigint
      * COALESCE(vp.unit_price_cents, 0)::bigint
  FROM candidate c
  LEFT JOIN public.vendor_products vp ON vp.product_id = c.id AND vp.is_preferred = true
  LEFT JOIN public.vendors v ON v.id = vp.vendor_id AND v.is_active = true
  WHERE c.auto_reorder = true
    AND c.on_hand <= c.rp
  ORDER BY (c.rp - c.on_hand) DESC;
$function$;

COMMENT ON FUNCTION public.list_reorder_candidates() IS
  'Active tracked products at or below their reorder point, with preferred-vendor pricing. On-hand comes from products.stock_quantity; product_stock is an optional per-product override for reorder point/quantity/auto_reorder.';
