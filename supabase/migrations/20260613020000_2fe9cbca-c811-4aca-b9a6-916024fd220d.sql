-- Pricelists: tiered quantity pricing (docs/parity/capabilities/pricelists.json#tiered_quantity).
-- The data model already supports quantity breaks (pricelist_items.min_quantity) and
-- resolve_pricelist_price already filters p_quantity >= min_quantity — but when several
-- tiers qualify (e.g. min 1 AND min 10 for qty 20) the tie-break ignored the break size,
-- so the wrong tier could win. Fix: among equally-specific candidates, prefer the
-- HIGHEST qualifying min_quantity (the deepest applicable quantity break).
--
-- Based on the CURRENT (ambiguity-fixed) definition from migration 20260610104500 —
-- products column stays qualified as pr.price_cents. Only the candidates CTE gains
-- qty_break and the ORDER BY gains a tie-break. Idempotent CREATE OR REPLACE.

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
      pli.min_quantity AS qty_break,
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
  SELECT resolved_price, id, name, 'pricelist'::text
  FROM candidates
  -- most specific match first; within that, the deepest qualifying quantity break
  ORDER BY specificity DESC, qty_break DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT v_base_price, NULL::uuid, NULL::text, 'product_base'::text;
  END IF;
END; $function$;
