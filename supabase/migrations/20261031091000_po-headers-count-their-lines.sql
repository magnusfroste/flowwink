-- ============================================================
-- Migration: a purchase order's header counts its lines
-- Date: 2026-10-31
-- Safe to re-run: Yes (touches only headers that read 0 against priced lines)
-- ============================================================
--
-- create_purchase_order summed subtotal / tax / total BEFORE it looked up the
-- price of a line sent without unit_price_cents, so every looked-up price
-- counted as 0 in the header while the line itself carried it. On Nordbrygg:
-- PO-00022 (draft) 0,00 against 1 776,00 of lines, PO-00015 (received) 0,00
-- against 10 500,00. The handler now sums after pricing; this repairs the
-- headers that bug wrote — only the unambiguous case: header subtotal 0 and
-- lines worth more than 0. Tax follows each line's tax_rate (a percentage,
-- 25.00), the same rule the handler uses.

WITH sums AS (
  SELECT l.purchase_order_id,
         SUM(l.total_cents)::bigint AS subtotal,
         SUM(ROUND(l.total_cents * COALESCE(l.tax_rate, 25) / 100.0))::bigint AS tax
    FROM public.purchase_order_lines l
   GROUP BY l.purchase_order_id
)
UPDATE public.purchase_orders po
   SET subtotal_cents = s.subtotal,
       tax_cents      = s.tax,
       total_cents    = s.subtotal + s.tax,
       updated_at     = now()
  FROM sums s
 WHERE s.purchase_order_id = po.id
   AND COALESCE(po.subtotal_cents, 0) = 0
   AND s.subtotal > 0;
