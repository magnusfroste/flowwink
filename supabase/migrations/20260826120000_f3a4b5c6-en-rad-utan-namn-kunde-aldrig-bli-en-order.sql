-- En rad utan namn kunde aldrig bli en order.
--
-- procurement_run() skrev förslag troget. approve_procurement_suggestion()
-- skulle göra förslaget till en inköpsorder — men den INSERT:en satte aldrig
-- purchase_order_lines.description, och kolumnen är NOT NULL. Hela skenan
-- beställningspunkt → förslag → inköpsorder har därför aldrig kunnat gå i mål:
-- varje godkännande rullade tillbaka med
--   null value in column "description" of relation "purchase_order_lines".
-- Felet syns inte i någon av delarna för sig — procurement_run rapporterar
-- "24 förslag skapade" och ser frisk ut; det är sömmen mellan dem som brister.
--
-- Två lager, för att klassen inte ska kunna återuppstå:
--   1. Funktionen sätter description explicit (produktnamnet).
--   2. En BEFORE INSERT-spärr fyller description från produkten när en skrivare
--      utelämnar den. Ingen framtida skrivare kan skapa en namnlös orderrad.
--
-- OBS: prissättningen i denna funktion (products.price_cents = FÖRSÄLJNINGS-
-- priset) är ett separat, rapporterat fynd och rörs INTE här.

-- 1) Spärren: en orderrad med en produkt bär alltid produktens namn.
CREATE OR REPLACE FUNCTION public.fill_po_line_description()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.description IS NULL OR btrim(NEW.description) = '' THEN
    IF NEW.product_id IS NOT NULL THEN
      SELECT name INTO NEW.description FROM public.products WHERE id = NEW.product_id;
    END IF;
    -- Ingen produkt och inget namn: raden är en fritextrad utan innehåll.
    -- Bättre en ärlig platshållare än ett avbrutet flöde långt nedströms.
    IF NEW.description IS NULL OR btrim(NEW.description) = '' THEN
      NEW.description := 'Orderrad utan beskrivning';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fill_po_line_description ON public.purchase_order_lines;
CREATE TRIGGER trg_fill_po_line_description
  BEFORE INSERT OR UPDATE OF description, product_id ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.fill_po_line_description();

-- 2) Funktionen säger själv vad raden heter.
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
    v_po_number := 'PO-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);
    SELECT COALESCE(price_cents,0), name INTO v_unit_price, v_name FROM products WHERE id = s.product_id;
    v_total := COALESCE(v_unit_price,0) * s.suggested_qty::int;
    INSERT INTO purchase_orders (po_number, vendor_id, status, order_date, expected_delivery, subtotal_cents, total_cents, created_by)
    VALUES (v_po_number, s.preferred_vendor_id, 'draft', CURRENT_DATE, s.needed_by, v_total, v_total, auth.uid())
    RETURNING id INTO v_po_id;
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
