-- Fix resolve_pricelist_price: "column reference price_cents is ambiguous".
--
-- The function RETURNS TABLE(price_cents …), so inside the body the bare
-- `price_cents` in `SELECT COALESCE(price_cents,0) … FROM products` is ambiguous
-- between the OUT column and products.price_cents — plpgsql raises and the skill
-- always failed. Qualify the products column (and alias the table). Identical
-- logic otherwise. Idempotent CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.resolve_pricelist_price(
  p_product_id uuid,
  p_lead_id uuid DEFAULT NULL::uuid,
  p_company_id uuid DEFAULT NULL::uuid,
  p_quantity numeric DEFAULT 1,
  p_at date DEFAULT CURRENT_DATE,
  p_currency text DEFAULT 'SEK'::text
)
RETURNS TABLE(price_cents integer, pricelist_id uuid, pricelist_name text, source text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_base_price integer;
BEGIN
  SELECT COALESCE(pr.price_cents, 0) INTO v_base_price FROM public.products pr WHERE pr.id = p_product_id;
  RETURN QUERY
  WITH candidates AS (
    SELECT pl.id, pl.name,
      CASE WHEN pli.fixed_price_cents IS NOT NULL THEN pli.fixed_price_cents
           WHEN pli.discount_pct IS NOT NULL THEN GREATEST(0, ROUND(v_base_price * (1 - pli.discount_pct/100.0))::int)
           ELSE v_base_price END AS resolved_price,
      (CASE WHEN pl.lead_id = p_lead_id THEN 1000 ELSE 0 END
       + CASE WHEN pl.company_id = p_company_id THEN 500 ELSE 0 END
       + CASE WHEN pli.product_id = p_product_id THEN 100 ELSE 0 END
       - pl.priority) AS specificity
    FROM public.pricelists pl
    JOIN public.pricelist_items pli ON pli.pricelist_id = pl.id
    WHERE pl.is_active AND pl.currency = p_currency
      AND (pl.valid_from IS NULL OR pl.valid_from <= p_at)
      AND (pl.valid_until IS NULL OR pl.valid_until >= p_at)
      AND (pli.product_id = p_product_id OR pli.product_id IS NULL)
      AND p_quantity >= pli.min_quantity
      AND ((pl.lead_id IS NULL AND pl.company_id IS NULL)
        OR (p_lead_id IS NOT NULL AND pl.lead_id = p_lead_id)
        OR (p_company_id IS NOT NULL AND pl.company_id = p_company_id))
  )
  SELECT resolved_price, id, name, 'pricelist'::text FROM candidates ORDER BY specificity DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT v_base_price, NULL::uuid, NULL::text, 'product_base'::text;
  END IF;
END; $function$;
