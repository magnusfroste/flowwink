-- Priset som föddes i fel valuta.
--
-- Godsmottagningen är den enda plats där kostnaden kommer IN i systemet:
-- stock_valuation_layers.unit_cost_cents. Exakt den siffran går ut igen som
-- COGS när varan säljs. Är priset fel på väg in blir bruttovinsten fel på väg
-- ut — och ingen av de två processerna kan se felet var för sig. Tre mätta fel
-- i samma söm, alla i födelseögonblicket:
--
-- 1. VALUTAN FÖLJDE INTE MED. create_purchase_order tog aldrig emot någon
--    currency-parameter, så ett anrop med currency:"EUR" slängdes tyst och
--    PO-00006 mot EUR-leverantören Caffè Milano lades i SEK. Vid mottagning
--    föddes Milano Uno i lagret till 1 696,00 kr — EUR-beloppet läst som
--    kronor — mot standardkostnaden 19 500,00. Såld för 32 900,00 gav det en
--    redovisad bruttomarginal på 94,8 % mot verkliga ~40,7 %: 17 804,00 fel
--    per maskin. Kolumnerna purchase_orders.currency och exchange_rate fanns
--    redan; ingen skrivare fyllde dem och värderingen räknade aldrig om.
--
-- 2. FÖRSLAGSORDERN PRISSATTES TILL FÖRSÄLJNINGSPRISET.
--    approve_procurement_suggestion läste products.price_cents — kundpriset.
--    Söderberg Mellanrost: förslag på 120 kg blev en order på 41 880,00 i
--    stället för 23 760,00. Hade den tagits emot hade kaffet fötts i lagret
--    till 349,00/kg och sålts för 349,00/kg: bruttovinst exakt noll.
--
-- 3. KVANTITETSSTAFFELN VAR DÖD DATA. resolve_vendor_price sorterade
--    "is_preferred DESC, tier_min_qty DESC" — och unikindexet
--    idx_vendor_products_preferred tillåter bara EN preferred-rad per produkt,
--    så staffelraden kunde aldrig vinna. 60 kg Mörkrost svarade 18,50/kg
--    (tier 1) i stället för 17,50/kg (tier 60): 600,00 för mycket per order,
--    tyst, medan skillens instruktion lovade motsatsen.
--
-- Riktningen är Odoo: inköpspriset kommer ur leverantörens prislista
-- (product.supplierinfo, med min_qty-staffel och egen valuta) och ordern bär
-- leverantörens valuta med kurs; kursen används EN gång, vid mottagningen, när
-- lagervärdet skrivs i bolagets redovisningsvaluta. Samma regel som huset
-- redan har på visningssidan (usePlatformFormat FORMATERAR men KONVERTERAR
-- aldrig): konverteringen hör hemma här, vid inköpet, en gång.
--
-- Verifierat mot Odoos källa (17.0/18.0), inte mot minnet:
--   * purchase.order.currency_id defaultar till leverantörens
--     property_purchase_currency_id, annars bolagets valuta (18.0 räknar om det
--     i _compute_currency_id) — samma regel som stamp_purchase_order_fx nedan.
--   * product.supplierinfo har _order = 'sequence, min_qty DESC, price, id' och
--     _select_seller behåller raderna från EN leverantör innan priset avgör —
--     alltså djupaste staffel först, inom vald leverantör. pick_vendor_price
--     nedan har samma ordning.
--   * Inköpsorder skapad ur en påfyllningsregel prissätts ur supplierinfo.price
--     och får supplierinfo-radens valuta; standard_price (självkostnad) är bara
--     manuell fallback och list_price (försäljningspriset) förekommer inte alls
--     i Odoos inköpsprisväg.
-- MEDVETEN AVVIKELSE: Odoo konverterar lagervärdet med kursen på MOTTAGNINGS-
-- dagen (stock_move._get_price_unit → res.currency._convert), medan orderns
-- currency_rate bara används i rapporter. Här bär ordern kursen och
-- värderingen använder just den: en stämplad kurs går att revidera mot
-- (revalue_open_balances jämför redan purchase_orders.exchange_rate mot dagens
-- kurs) och kan inte tyst falla tillbaka till 1 för att kursen råkade saknas
-- den dag godset kom.
--
-- Riktningen på kursen är husets, inte Odoos: exchange_rate = antal enheter av
-- redovisningsvalutan per enhet av dokumentets valuta (EUR→SEK ≈ 11,4), samma
-- innebörd som revalue_open_balances redan läser ur kolumnen. Multiplicera för
-- att komma till böckerna.
--
-- Indexet idx_vendor_products_preferred lämnas orört. "Preferred" betyder
-- föredragen LEVERANTÖR för produkten — en rad räcker för att uttrycka det, och
-- samma leverantörs staffelrader ärver den preferensen genom
-- pick_vendor_price. Att göra indexet per staffel hade gjort "föredragen"
-- tvetydigt utan att lösa något.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Valutan reser med ordern
-- ─────────────────────────────────────────────────────────────────────────────

-- Kolumndefaulten är det som gör "ingen sa något" omöjligt att skilja från
-- "någon sa SEK". Utan den kan triggern nedan ta leverantörens valuta när
-- skrivaren tiger — precis som platform-fallbacks.ts föreskriver: utelämna
-- fältet vid skrivning, låt databasen vara auktoriteten. NOT NULL kontrolleras
-- efter BEFORE-triggern, så en INSERT utan currency går fortfarande igenom.
ALTER TABLE public.purchase_orders ALTER COLUMN currency DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.stamp_purchase_order_fx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_acct text := public.platform_default_currency();
  v_vendor_currency text;
  v_rate numeric;
BEGIN
  -- Tystnaden betyder "leverantörens valuta", inte "instansens".
  IF NEW.currency IS NULL THEN
    SELECT currency INTO v_vendor_currency FROM public.vendors WHERE id = NEW.vendor_id;
    NEW.currency := upper(COALESCE(NULLIF(v_vendor_currency, ''), v_acct));
  ELSE
    NEW.currency := upper(NEW.currency);
  END IF;

  IF NEW.currency = v_acct THEN
    NEW.exchange_rate := 1;
    RETURN NEW;
  END IF;

  -- Främmande valuta med kurs 1 är aldrig ett medvetet val — det är kolumnens
  -- default, alltså "ingen stämplade någon kurs". En uttryckligt satt kurs
  -- (≠ 1) rörs inte: den är avtalad och historisk så snart ordern finns.
  IF NEW.exchange_rate IS NULL OR NEW.exchange_rate = 1 THEN
    v_rate := public.fx_rate_at(NEW.currency, v_acct, COALESCE(NEW.order_date, CURRENT_DATE));
    IF v_rate IS NULL OR v_rate <= 0 THEN
      RAISE EXCEPTION
        'Purchase order in % has no exchange rate to % on % — refusing to book it at rate 1. A EUR order valued as if it were SEK is how Milano Uno entered stock at 1 696,00 against a standard cost of 19 500,00. Register the rate first: set_exchange_rate(''%'', ''%'', <rate>, ''%''), or pass exchange_rate explicitly.',
        NEW.currency, v_acct, COALESCE(NEW.order_date, CURRENT_DATE),
        NEW.currency, v_acct, COALESCE(NEW.order_date, CURRENT_DATE)
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.exchange_rate := v_rate;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stamp_purchase_order_fx ON public.purchase_orders;
CREATE TRIGGER trg_stamp_purchase_order_fx
  BEFORE INSERT OR UPDATE OF currency, exchange_rate, vendor_id, order_date
  ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_purchase_order_fx();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Värderingen räknar om — en gång, vid mottagningen
-- ─────────────────────────────────────────────────────────────────────────────

-- Enda ändringen mot den levande definitionen: raden multipliceras med orderns
-- växelkurs innan den lämnar funktionen. Allt annat (uuid-formkontrollen, de
-- talande varningarna, fallbacken till products.cost_cents) är oförändrat, så
-- inget annat fynd i den här funktionen ändras i smyg.
CREATE OR REPLACE FUNCTION public.resolve_inbound_unit_cost(p_product_id uuid, p_reference_type text, p_reference_id text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_cost bigint;
  v_rate numeric;
  v_ref uuid;
BEGIN
  IF p_reference_type IN ('purchase_order','po','goods_receipt') AND p_reference_id IS NOT NULL THEN
    IF p_reference_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_ref := p_reference_id::uuid;

      IF p_reference_type = 'goods_receipt' THEN
        -- The reference is a goods_receipts.id. Reach the PO through it.
        SELECT pol.unit_price_cents, po.exchange_rate INTO v_cost, v_rate
        FROM goods_receipts gr
        JOIN purchase_orders po ON po.id = gr.purchase_order_id
        JOIN purchase_order_lines pol
          ON pol.purchase_order_id = gr.purchase_order_id
        WHERE gr.id = v_ref
          AND pol.product_id = p_product_id
        ORDER BY pol.created_at
        LIMIT 1;
      ELSE
        SELECT pol.unit_price_cents, po.exchange_rate INTO v_cost, v_rate
        FROM purchase_order_lines pol
        JOIN purchase_orders po ON po.id = pol.purchase_order_id
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

    -- Lagervärdet förs i redovisningsvalutan. Kursen är orderns egen, stämplad
    -- vid orderdatum — inte dagens, och inte 1.
    IF v_cost IS NOT NULL THEN
      RETURN round(v_cost * COALESCE(NULLIF(v_rate, 0), 1))::bigint;
    END IF;
  END IF;

  SELECT cost_cents INTO v_cost FROM products WHERE id = p_product_id;
  RETURN COALESCE(v_cost, 0);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Staffeln: ETT ställe som vet vilken leverantörsrad som gäller
-- ─────────────────────────────────────────────────────────────────────────────

-- Odoos _select_seller väljer bland kvalificerande supplierinfo-rader med
-- min_qty fallande — den mest specifika staffeln först. Samma ordning här, med
-- den föredragna LEVERANTÖREN (produktens enda is_preferred-rad pekar ut den)
-- som första nyckel så att ett leverantörsval inte tyst byts bort av ett lägre
-- pris hos någon annan.
CREATE OR REPLACE FUNCTION public.pick_vendor_price(
  p_product_id uuid,
  p_vendor_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT 1,
  p_at date DEFAULT CURRENT_DATE
)
RETURNS public.vendor_products
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT vp.*
  FROM public.vendor_products vp
  JOIN public.vendors v ON v.id = vp.vendor_id AND v.is_active
  WHERE vp.product_id = p_product_id
    AND (p_vendor_id IS NULL OR vp.vendor_id = p_vendor_id)
    AND (vp.valid_from IS NULL OR vp.valid_from <= p_at)
    AND (vp.valid_until IS NULL OR vp.valid_until >= p_at)
    AND vp.price_tier_min_qty <= GREATEST(COALESCE(p_quantity, 1), 1)
  ORDER BY
    (vp.vendor_id = (
       SELECT pref.vendor_id FROM public.vendor_products pref
       WHERE pref.product_id = p_product_id AND pref.is_preferred
       LIMIT 1)) DESC,
    vp.price_tier_min_qty DESC,
    vp.unit_price_cents ASC,
    vp.id
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.pick_vendor_price(uuid, uuid, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_vendor_price(uuid, uuid, numeric, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_vendor_price(p_product_id uuid, p_quantity numeric DEFAULT 1, p_vendor_id uuid DEFAULT NULL::uuid, p_at date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_best public.vendor_products;
  v_vendor_name text;
  v_alts jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin')
          OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN
    RAISE EXCEPTION 'Not authorized to read vendor prices';
  END IF;

  v_best := public.pick_vendor_price(p_product_id, p_vendor_id, p_quantity, p_at);

  IF v_best.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_vendor_price',
      'message', 'No valid vendor price for this product/quantity/date');
  END IF;

  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_best.vendor_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'vendor_id', a.vendor_id, 'vendor_name', a.vendor_name,
           'unit_price_cents', a.unit_price_cents, 'currency', a.currency,
           'lead_time_days', a.lead_time_days, 'tier_min_qty', a.tier_min_qty,
           'is_preferred', a.is_preferred)), '[]'::jsonb)
  INTO v_alts
  FROM (
    SELECT DISTINCT ON (vp.vendor_id) vp.vendor_id, v.name AS vendor_name, vp.unit_price_cents,
           vp.currency, vp.lead_time_days, vp.price_tier_min_qty AS tier_min_qty, vp.is_preferred
    FROM public.vendor_products vp
    JOIN public.vendors v ON v.id = vp.vendor_id AND v.is_active
    WHERE vp.product_id = p_product_id
      AND vp.vendor_id <> v_best.vendor_id
      AND (vp.valid_from IS NULL OR vp.valid_from <= p_at)
      AND (vp.valid_until IS NULL OR vp.valid_until >= p_at)
      AND vp.price_tier_min_qty <= GREATEST(COALESCE(p_quantity, 1), 1)
    ORDER BY vp.vendor_id, vp.price_tier_min_qty DESC, vp.unit_price_cents ASC
  ) a;

  RETURN jsonb_build_object('success', true,
    'vendor_id', v_best.vendor_id, 'vendor_name', v_vendor_name,
    'unit_price_cents', v_best.unit_price_cents, 'currency', v_best.currency,
    'lead_time_days', v_best.lead_time_days, 'min_order_quantity', v_best.min_order_quantity,
    'vendor_sku', v_best.vendor_sku, 'is_preferred', v_best.is_preferred,
    'tier_min_qty', v_best.price_tier_min_qty, 'alternatives', v_alts);
END;
$function$;

-- Staffelraden gick inte att registrera alls: p_price_tier_min_qty är valfri i
-- schemat, och en utelämnad parameter skickade NULL förbi kolumnens default
-- rakt in i NOT NULL. Valutan tas nu från leverantören när den inte anges —
-- en EUR-leverantörs prisrad ska inte födas i kronor.
CREATE OR REPLACE FUNCTION public.manage_vendor_price(p_action text, p_id uuid DEFAULT NULL::uuid, p_vendor_id uuid DEFAULT NULL::uuid, p_product_id uuid DEFAULT NULL::uuid, p_unit_price_cents integer DEFAULT NULL::integer, p_currency text DEFAULT NULL::text, p_lead_time_days integer DEFAULT NULL::integer, p_min_order_quantity integer DEFAULT NULL::integer, p_price_tier_min_qty integer DEFAULT NULL::integer, p_vendor_sku text DEFAULT NULL::text, p_is_preferred boolean DEFAULT NULL::boolean, p_valid_from date DEFAULT NULL::date, p_valid_until date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.vendor_products;
  v_rows jsonb;
  v_currency text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage vendor prices';
  END IF;

  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.price_tier_min_qty, r.unit_price_cents), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT vp.*, v.name AS vendor_name FROM public.vendor_products vp
      JOIN public.vendors v ON v.id = vp.vendor_id
      WHERE (p_product_id IS NULL OR vp.product_id = p_product_id)
        AND (p_vendor_id IS NULL OR vp.vendor_id = p_vendor_id)
      LIMIT 200
    ) r;
    RETURN jsonb_build_object('success', true, 'vendor_prices', v_rows);

  ELSIF p_action = 'create' THEN
    IF p_vendor_id IS NULL OR p_product_id IS NULL OR p_unit_price_cents IS NULL THEN
      RAISE EXCEPTION 'create requires p_vendor_id, p_product_id, p_unit_price_cents';
    END IF;

    SELECT upper(COALESCE(NULLIF(p_currency, ''), NULLIF(v.currency, ''), public.platform_default_currency()))
      INTO v_currency
      FROM public.vendors v WHERE v.id = p_vendor_id;
    IF v_currency IS NULL THEN
      RAISE EXCEPTION 'Vendor % not found', p_vendor_id;
    END IF;

    BEGIN
      INSERT INTO public.vendor_products (vendor_id, product_id, unit_price_cents, currency,
        lead_time_days, min_order_quantity, price_tier_min_qty, vendor_sku, is_preferred,
        valid_from, valid_until, notes)
      VALUES (p_vendor_id, p_product_id, p_unit_price_cents, v_currency,
        p_lead_time_days, COALESCE(p_min_order_quantity,1), GREATEST(COALESCE(p_price_tier_min_qty,1),1),
        p_vendor_sku, COALESCE(p_is_preferred,false), p_valid_from, p_valid_until, p_notes)
      -- Uppdatera bara det anroparen faktiskt nämnde. Ett create som råkar
      -- träffa en befintlig staffelrad får inte nolla is_preferred eller skriva
      -- över MOQ med sin egen default — det vore samma tysta skada som
      -- alias-buggen i settings-skrivaren, fast på leverantörens prislista.
      ON CONFLICT (vendor_id, product_id, price_tier_min_qty) DO UPDATE SET
        unit_price_cents = excluded.unit_price_cents,
        currency = COALESCE(upper(NULLIF(p_currency, '')), public.vendor_products.currency),
        lead_time_days = COALESCE(p_lead_time_days, public.vendor_products.lead_time_days),
        min_order_quantity = COALESCE(p_min_order_quantity, public.vendor_products.min_order_quantity),
        vendor_sku = COALESCE(p_vendor_sku, public.vendor_products.vendor_sku),
        is_preferred = COALESCE(p_is_preferred, public.vendor_products.is_preferred),
        valid_from = COALESCE(p_valid_from, public.vendor_products.valid_from),
        valid_until = COALESCE(p_valid_until, public.vendor_products.valid_until),
        notes = COALESCE(p_notes, public.vendor_products.notes),
        updated_at = now()
      RETURNING * INTO v_row;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Product % already has a preferred vendor — only one vendor_products row per product may carry is_preferred. Register this row with p_is_preferred false (qty tiers of the preferred vendor are honoured through it), or clear the flag on the other row first.', p_product_id
        USING ERRCODE = 'unique_violation';
    END;
    RETURN jsonb_build_object('success', true, 'vendor_price', to_jsonb(v_row));

  ELSIF p_action = 'update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'update requires p_id'; END IF;
    UPDATE public.vendor_products SET
      unit_price_cents = COALESCE(p_unit_price_cents, unit_price_cents),
      currency = COALESCE(upper(NULLIF(p_currency,'')), currency),
      lead_time_days = COALESCE(p_lead_time_days, lead_time_days),
      min_order_quantity = COALESCE(p_min_order_quantity, min_order_quantity),
      price_tier_min_qty = COALESCE(p_price_tier_min_qty, price_tier_min_qty),
      vendor_sku = COALESCE(p_vendor_sku, vendor_sku),
      is_preferred = COALESCE(p_is_preferred, is_preferred),
      valid_from = COALESCE(p_valid_from, valid_from),
      valid_until = COALESCE(p_valid_until, valid_until),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'vendor price % not found', p_id; END IF;
    RETURN jsonb_build_object('success', true, 'vendor_price', to_jsonb(v_row));

  ELSIF p_action = 'delete' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'delete requires p_id'; END IF;
    DELETE FROM public.vendor_products WHERE id = p_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_id);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use create|update|list|delete', p_action;
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Förslagsordern prissätts som en INKÖPSorder
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_procurement_suggestion(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s procurement_suggestions%ROWTYPE;
  v_po_id uuid; v_po_number text;
  v_unit_price integer; v_name text;
  v_vp public.vendor_products;
  v_currency text;
  v_price_source text;
  v_sub bigint; v_tax bigint;
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
    SELECT name INTO v_name FROM products WHERE id = s.product_id;

    -- En inköpsorder bär ett INKÖPSpris. Leverantörens prislista först (med
    -- staffel för den föreslagna kvantiteten och leverantörens egen valuta),
    -- annars produktens självkostnad — som per definition är bokförd i
    -- redovisningsvalutan. products.price_cents är kundens pris och har
    -- ingenting här att göra.
    v_vp := public.pick_vendor_price(s.product_id, s.preferred_vendor_id, s.suggested_qty, CURRENT_DATE);
    IF v_vp.id IS NOT NULL THEN
      v_unit_price := v_vp.unit_price_cents;
      v_currency := v_vp.currency;
      v_price_source := 'vendor_price';
    ELSE
      SELECT cost_cents INTO v_unit_price FROM products WHERE id = s.product_id;
      v_currency := public.platform_default_currency();
      v_price_source := 'product_cost';
    END IF;

    IF COALESCE(v_unit_price, 0) <= 0 THEN
      RAISE EXCEPTION 'No purchase price for "%": register a vendor price (manage_vendor_price) or set the product cost (cost_cents) before approving. The sales price is not a purchase price — reading it is what turned a 23 760,00 coffee order into 41 880,00.',
        COALESCE(v_name, s.product_id::text)
        USING ERRCODE = 'check_violation';
    END IF;

    -- po_number lämnas åt trigger_generate_po_number och läses tillbaka.
    -- currency/exchange_rate stämplas av trg_stamp_purchase_order_fx.
    INSERT INTO purchase_orders (vendor_id, status, order_date, expected_delivery, currency, created_by)
    VALUES (s.preferred_vendor_id, 'draft', CURRENT_DATE, s.needed_by, v_currency, auth.uid())
    RETURNING id, po_number INTO v_po_id, v_po_number;

    -- tax_rate lämnas åt kolumnens default, samma default create_purchase_order
    -- använder. Huvudet summeras sedan UR raderna, så de två skrivarna inte kan
    -- vara oense om huruvida ordern bär moms.
    INSERT INTO purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price_cents, total_cents)
    VALUES (v_po_id, s.product_id, COALESCE(v_name, 'Orderrad utan beskrivning'), s.suggested_qty::int,
            v_unit_price, v_unit_price::bigint * s.suggested_qty::int);

    SELECT COALESCE(sum(total_cents), 0),
           COALESCE(sum(round(total_cents * tax_rate / 100)), 0)
      INTO v_sub, v_tax
      FROM purchase_order_lines WHERE purchase_order_id = v_po_id;

    UPDATE purchase_orders
       SET subtotal_cents = v_sub, tax_cents = v_tax, total_cents = v_sub + v_tax, updated_at = now()
     WHERE id = v_po_id;

    UPDATE procurement_suggestions SET status='materialized', resolved_at=now(), resolved_by=auth.uid(),
      materialized_ref_type='purchase_order', materialized_ref_id=v_po_id WHERE id=p_id;
    RETURN jsonb_build_object('type','purchase_order','id',v_po_id,'po_number',v_po_number,
      'unit_price_cents', v_unit_price, 'price_source', v_price_source,
      'currency', v_currency, 'subtotal_cents', v_sub, 'tax_cents', v_tax,
      'total_cents', v_sub + v_tax);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Spärren: en orderrad får inte födas till kundpriset
-- ─────────────────────────────────────────────────────────────────────────────

-- Spärren tittar inte på ett magiskt tal utan på PROVENIENS: den slår till bara
-- när radens pris är exakt produktens försäljningspris SAMTIDIGT som ett känt
-- inköpspris är lägre. Det är fingeravtrycket från 41 880,00 mot 23 760,00 —
-- och utvägen är att göra priset bevisbart (registrera det som leverantörspris),
-- inte att stänga av spärren.
CREATE OR REPLACE FUNCTION public.guard_po_line_purchase_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sales integer;
  v_cost integer;
  v_name text;
  v_po record;
  v_ref integer;
  v_vp public.vendor_products;
BEGIN
  IF NEW.product_id IS NULL OR COALESCE(NEW.unit_price_cents, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT price_cents, cost_cents, name INTO v_sales, v_cost, v_name
    FROM public.products WHERE id = NEW.product_id;
  IF v_sales IS NULL OR NEW.unit_price_cents <> v_sales THEN
    RETURN NEW;
  END IF;

  SELECT currency, vendor_id INTO v_po
    FROM public.purchase_orders WHERE id = NEW.purchase_order_id;

  v_vp := public.pick_vendor_price(NEW.product_id, v_po.vendor_id, NEW.quantity, CURRENT_DATE);
  IF v_vp.id IS NOT NULL AND v_vp.currency = v_po.currency THEN
    v_ref := v_vp.unit_price_cents;
  ELSIF v_po.currency = public.platform_default_currency() THEN
    v_ref := v_cost;
  END IF;

  IF COALESCE(v_ref, 0) > 0 AND v_ref < NEW.unit_price_cents THEN
    RAISE EXCEPTION
      'Purchase line for "%" is priced at the SALES price (% %), while the known purchase price is % % — refusing. This is the shape of the suggestion order that came out at 41 880,00 instead of 23 760,00 and would have been received into stock at zero gross margin. Pass the negotiated purchase price, or register it first with manage_vendor_price if it really is % %.',
      COALESCE(v_name, NEW.product_id::text),
      round(NEW.unit_price_cents / 100.0, 2), v_po.currency,
      round(v_ref / 100.0, 2), v_po.currency,
      round(NEW.unit_price_cents / 100.0, 2), v_po.currency
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_po_line_purchase_price_trg ON public.purchase_order_lines;
CREATE TRIGGER guard_po_line_purchase_price_trg
  BEFORE INSERT ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_po_line_purchase_price();
