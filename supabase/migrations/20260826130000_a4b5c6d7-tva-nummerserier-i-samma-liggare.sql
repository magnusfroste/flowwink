-- Två nummerserier i samma liggare, och den ena förgiftade den andra.
--
-- purchase_orders har EN nummertrigger, generate_po_number(), som räknar
-- MAX(CAST(SUBSTRING(po_number FROM 4) AS INTEGER)) + 1 → 'PO-00004'.
-- Men approve_procurement_suggestion() satte ett eget nummer i ett HELT annat
-- format: 'PO-20260823-c6e934'. Formaten samexisterade tyst tills nästa order
-- skulle skapas — då försökte triggern casta '20260823-c6e934' till integer:
--   invalid input syntax for type integer: "20260823-c6e934"
-- Från det ögonblicket kunde INGEN skrivare skapa en inköpsorder: agentytan,
-- admin-UI:t och den automatiska påfyllningen dog alla på samma rad. En order
-- från påfyllningsskenan låste hela inköpsfunktionen.
--
-- Varje del fungerade för sig. Sömmen var att båda ägde numret.
--
-- Två lager:
--   1. Räknaren läser bara sin EGEN serie (^PO-\d+$). Främmande format kan
--      finnas i liggaren utan att bryta sekvensen.
--   2. Bara en skrivare sätter numret: approve_procurement_suggestion lämnar
--      po_number åt triggern och läser tillbaka det som faktiskt tilldelades.

-- 1) Räknaren ignorerar allt som inte är dess egen serie.
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 4) AS INTEGER)), 0) + 1
    INTO next_num
    FROM public.purchase_orders
   WHERE po_number ~ '^PO-[0-9]+$';

  NEW.po_number := 'PO-' || LPAD(next_num::TEXT, 5, '0');
  RETURN NEW;
END;
$function$;

-- 2) En skrivare per sanning: förslagsskenan mintar inga egna nummer.
CREATE OR REPLACE FUNCTION public.approve_procurement_suggestion(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s procurement_suggestions%ROWTYPE;
  v_po_id uuid; v_po_number text;
  v_unit_price integer; v_total integer; v_name text;
  v_bom uuid; v_mo uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory')) THEN
    RAISE EXCEPTION 'Requires the inventory module — an admin can grant it under Users → Role Permissions';
  END IF;
  SELECT * INTO s FROM procurement_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'Suggestion already %', s.status; END IF;

  IF s.procurement_method = 'buy' THEN
    IF s.preferred_vendor_id IS NULL THEN RAISE EXCEPTION 'No preferred vendor; cannot create PO'; END IF;
    SELECT COALESCE(price_cents,0), name INTO v_unit_price, v_name FROM products WHERE id = s.product_id;
    v_total := COALESCE(v_unit_price,0) * s.suggested_qty::int;

    -- po_number lämnas åt trigger_generate_po_number och läses tillbaka.
    INSERT INTO purchase_orders (vendor_id, status, order_date, expected_delivery, subtotal_cents, total_cents, created_by)
    VALUES (s.preferred_vendor_id, 'draft', CURRENT_DATE, s.needed_by, v_total, v_total, auth.uid())
    RETURNING id, po_number INTO v_po_id, v_po_number;

    INSERT INTO purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price_cents, total_cents)
    VALUES (v_po_id, s.product_id, COALESCE(v_name, 'Orderrad utan beskrivning'), s.suggested_qty::int, COALESCE(v_unit_price,0), v_total);

    UPDATE procurement_suggestions SET status='materialized', resolved_at=now(), resolved_by=auth.uid(),
      materialized_ref_type='purchase_order', materialized_ref_id=v_po_id WHERE id=p_id;
    RETURN jsonb_build_object('type','purchase_order','id',v_po_id,'po_number',v_po_number);

  ELSIF s.procurement_method = 'manufacture' THEN
    SELECT id INTO v_bom FROM bom_headers WHERE product_id = s.product_id AND is_active = true LIMIT 1;
    IF v_bom IS NULL THEN RAISE EXCEPTION 'No active BOM for product %', s.product_id; END IF;
    v_mo := create_manufacturing_order(v_bom, s.suggested_qty::int, s.needed_by);
    UPDATE procurement_suggestions SET status='materialized', resolved_at=now(), resolved_by=auth.uid(),
      materialized_ref_type='manufacturing_order', materialized_ref_id=v_mo WHERE id=p_id;
    RETURN jsonb_build_object('type','manufacturing_order','id',v_mo);
  END IF;

  RAISE EXCEPTION 'Unknown procurement_method %', s.procurement_method;
END;
$function$;
