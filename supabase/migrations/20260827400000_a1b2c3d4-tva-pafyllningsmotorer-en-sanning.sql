-- Två påfyllningsmotorer som inte var överens.
--
-- Mätt på Nordbrygg med fyra öppna inköpsordrar (8 PO-rader, inget mottaget):
--
--   procurement_run()            →  0 förslag av 28 utvärderade regler.  RÄTT.
--   list_reorder_candidates()    → 22 kandidater.                        FEL.
--   auto_generate_purchase_orders(true) → 3 order, 22 rader,
--                                  245 571,00 kr + 25 % moms = 306 963,75 kr
--                                  OVANPÅ det som redan var beställt.
--
-- Bland de 22: 120 kg Söderberg Mellanrost trots att 240 kg redan låg i order,
-- och tre kaffemaskiner trots att två var på väg. Det är
-- dubbelbeställningsklassen, i sin renaste form.
--
-- Varför de skilde sig:
--
--   1. TILLGÄNGLIGHETEN. procurement_run räknar Odoo-format —
--        virtuellt = på hand − reserverat + inkommande
--      medan list_reorder_candidates (och purchase_reorder_check, och
--      mrp_reorder_run) läste COALESCE(product_stock.quantity_on_hand,
--      products.stock_quantity, 0). product_stock är tom på varje instans, och
--      products.stock_quantity är NULL på varje produkt som aldrig tagits emot
--      — så "0 på hand" betydde i praktiken "vi vet inte", och tolkades som
--      "slut". Inkommande och reserverat fanns inte i beräkningen alls.
--
--   2. LEVERANTÖREN. procurement_run läste reorder_rules.preferred_vendor_id,
--      auto_generate läste vendor_products.is_preferred. Är bara det ena satt
--      pekar de på olika leverantörer — eller så tappar den ena raden helt —
--      utan att någon får veta.
--
-- Åtgärden är en sanning, inte en tredje motor:
--
--   * stock_virtual_available(product, location) — EN tillgänglighetsberäkning
--     som alla påfyllningsmotorer läser. Den återger på hand, reserverat,
--     inkommande OCH virtuellt, så svaret bär sin egen proveniens.
--   * reorder_preferred_vendor(product, location) — EN leverantörsupplösning:
--     regelns preferred_vendor_id först, vendor_products.is_preferred som
--     fallback. Ingen motor får ha sin egen åsikt om vem som säljer varan.
--   * procurement_run och list_reorder_candidates räknar båda ur dessa två.
--     auto_generate_purchase_orders överlever som VERB (den skapar order där
--     procurement_run föreslår) men bygger på samma liggare via
--     list_reorder_candidates — den har ingen egen aritmetik kvar.
--
-- Efter migrationen på samma data: procurement_run 0 förslag,
-- list_reorder_candidates 0 kandidater, auto_generate_purchase_orders(true)
-- 0 order och 0 kr. Motorerna säger samma sak för att de räknar på samma tal.
--
-- Kvarstående, avsiktlig skillnad i POPULATION (inte i aritmetik):
-- procurement_run itererar reorder_rules (per produkt+plats, den skriver
-- procurement_suggestions som kräver en plats), list_reorder_candidates
-- itererar produkter och tar med produkter helt utan regel via
-- products.low_stock_threshold. Den fallback-banan räknar numera också
-- virtuellt lager, så dubbelbeställningsklassen är stängd i BÅDA banorna.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tillgängligheten. En beräkning, alla läsare.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.stock_virtual_available(
  p_product_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE(on_hand numeric, reserved numeric, incoming numeric, virtual numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH q AS (
    -- Kvantiteterna är sanningen. Antalet rader skiljer "0 på hand" från
    -- "ingen lagerrad alls" — utan den skillnaden blir en produkt som aldrig
    -- fått en quant-rad omöjlig att skilja från en som är slut.
    SELECT
      COUNT(*)                                AS quant_rows,
      COALESCE(SUM(sq.quantity), 0)           AS qty,
      COALESCE(SUM(sq.reserved_quantity), 0)  AS res
    FROM public.stock_quants sq
    WHERE sq.product_id = p_product_id
      AND (p_location_id IS NULL OR sq.location_id = p_location_id)
  ),
  inc AS (
    -- Inkommande har ingen plats — en PO-rad vet inte vilket lager den landar
    -- på förrän godsmottagningen. Den räknas därför alltid produktbrett.
    -- GREATEST per rad: en överleverans får inte bli NEGATIVT inkommande.
    SELECT COALESCE(SUM(GREATEST(pol.quantity - COALESCE(pol.received_quantity, 0), 0)), 0) AS qty
    FROM public.purchase_order_lines pol
    JOIN public.purchase_orders po ON po.id = pol.purchase_order_id
    WHERE pol.product_id = p_product_id
      AND po.status IN ('draft', 'sent', 'confirmed', 'partially_received')
  )
  SELECT oh.v, q.res, inc.qty, oh.v - q.res + inc.qty
  FROM q
  CROSS JOIN inc
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN q.quant_rows > 0 THEN q.qty
             -- Ingen lagerrad: spegeln på produkten är enda beviset som finns.
             -- NULL där betyder frånvaro av uppgift, inte noll i hyllan — men
             -- 0 är det enda tal vi ärligt kan räkna med.
             ELSE COALESCE((SELECT p.stock_quantity::numeric FROM public.products p WHERE p.id = p_product_id), 0)
           END AS v
  ) oh;
$function$;

COMMENT ON FUNCTION public.stock_virtual_available(uuid, uuid) IS
  'Odoo-formad tillgänglighet: på hand − reserverat + inkommande. ENDA källan '
  'för varje påfyllningsmotor (procurement_run, list_reorder_candidates, '
  'auto_generate_purchase_orders, mrp_reorder_run, purchase_reorder_check). '
  'Motorer som räknade på egen hand svarade 0 respektive 22 förslag på samma '
  'lager, och en torrkörning skrev 306 963,75 kr ovanpå fyra redan öppna '
  'inköpsordrar. Lägg aldrig till en läsare med egen aritmetik — läs härifrån.';

REVOKE ALL ON FUNCTION public.stock_virtual_available(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_virtual_available(uuid, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Leverantören. En upplösning, alla läsare.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reorder_preferred_vendor(
  p_product_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE(
  vendor_id uuid,
  vendor_name text,
  unit_price_cents integer,
  lead_time_days integer,
  min_order_quantity integer,
  vendor_source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ruled AS (
    SELECT rr.preferred_vendor_id AS vid
    FROM public.reorder_rules rr
    WHERE rr.product_id = p_product_id
      AND rr.is_active = true
      AND rr.preferred_vendor_id IS NOT NULL
      AND (p_location_id IS NULL OR rr.location_id = p_location_id)
    ORDER BY rr.updated_at DESC
    LIMIT 1
  ),
  flagged AS (
    SELECT vp.vendor_id AS vid
    FROM public.vendor_products vp
    WHERE vp.product_id = p_product_id AND vp.is_preferred = true
    LIMIT 1
  ),
  pick AS (
    -- Regeln är operatörens uttryckliga val och vinner. Flaggan på
    -- vendor_products är sortimentsdata och fyller i när regeln tiger.
    SELECT
      COALESCE((SELECT vid FROM ruled), (SELECT vid FROM flagged)) AS vid,
      CASE
        WHEN (SELECT vid FROM ruled) IS NOT NULL THEN 'reorder_rule'
        WHEN (SELECT vid FROM flagged) IS NOT NULL THEN 'vendor_products'
        ELSE NULL
      END AS src
  ),
  price AS (
    -- Prisstegen (price_tier_min_qty) ägs av prissättningen; påfyllningen tar
    -- grundsteget och gissar aldrig en volym den ännu inte beslutat.
    SELECT vp.*
    FROM public.vendor_products vp, pick
    WHERE vp.product_id = p_product_id AND vp.vendor_id = pick.vid
    ORDER BY vp.price_tier_min_qty ASC
    LIMIT 1
  )
  SELECT
    v.id,
    v.name,
    COALESCE((SELECT unit_price_cents FROM price), p.cost_cents, 0)::integer,
    COALESCE((SELECT lead_time_days FROM price), 7)::integer,
    COALESCE((SELECT min_order_quantity FROM price), 1)::integer,
    pick.src
  FROM pick
  JOIN public.vendors v ON v.id = pick.vid AND v.is_active = true
  LEFT JOIN public.products p ON p.id = p_product_id;
$function$;

COMMENT ON FUNCTION public.reorder_preferred_vendor(uuid, uuid) IS
  'Enda leverantörsupplösningen för påfyllning: reorder_rules.preferred_vendor_id '
  'först, vendor_products.is_preferred som fallback, vendor_source säger vilken. '
  'procurement_run läste bara det första och auto_generate_purchase_orders bara '
  'det andra — var bara det ena satt pekade motorerna på olika leverantör, eller '
  'tappade raden, utan att någon fick veta.';

REVOKE ALL ON FUNCTION public.reorder_preferred_vendor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_preferred_vendor(uuid, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Kandidatlistan räknar virtuellt lager.
--    Signaturen växer med reserved_qty/incoming_qty/virtual_qty, så svaret bär
--    sin egen proveniens — därför DROP + CREATE, inte CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.list_reorder_candidates();
DROP FUNCTION IF EXISTS public.list_reorder_candidates(numeric);

CREATE OR REPLACE FUNCTION public.list_reorder_candidates(p_threshold_override numeric DEFAULT NULL)
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
  estimated_cost_cents bigint,
  reserved_qty numeric,
  incoming_qty numeric,
  virtual_qty numeric,
  vendor_source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH rule AS (
    SELECT
      rr.product_id,
      COUNT(*)                                                      AS rules_total,
      COUNT(*) FILTER (WHERE rr.procurement_method = 'buy')         AS buy_rules,
      SUM(rr.min_qty) FILTER (WHERE rr.procurement_method = 'buy')  AS min_qty,
      SUM(rr.max_qty) FILTER (WHERE rr.procurement_method = 'buy')  AS max_qty,
      SUM(COALESCE(rr.reorder_qty, 0))
        FILTER (WHERE rr.procurement_method = 'buy')                AS reorder_qty
    FROM public.reorder_rules rr
    WHERE rr.is_active = true
    GROUP BY rr.product_id
  ),
  candidate AS (
    SELECT
      p.id,
      p.name,
      a.on_hand,
      a.reserved,
      a.incoming,
      a.virtual,
      -- p_threshold_override är en TILLFÄLLIG tröskel som ersätter allihop
      -- ("visa vad som ligger under 25 oavsett regler"). Den gör INTE en egen
      -- motor: samma virtuella lager, samma leverantörsupplösning, bara en
      -- annan beställningspunkt. Den läser vid-eller-under, som legacy-tröskeln.
      (p_threshold_override IS NULL AND COALESCE(r.buy_rules, 0) > 0)        AS has_rule,
      COALESCE(r.rules_total, 0)                                            AS rules_total,
      -- Beställningspunkten: override först, sedan regeln, legacy-override,
      -- produkttröskel. NULL = ingen tröskel satt någonstans → föreslås inte.
      COALESCE(p_threshold_override, r.min_qty, ps.reorder_point, p.low_stock_threshold)::numeric AS rp,
      CASE
        WHEN p_threshold_override IS NULL AND COALESCE(r.buy_rules, 0) > 0 THEN
          -- Exakt samma härledning som procurement_run, och numera på samma
          -- tal: kvantiteten fyller upp till max_qty från VIRTUELLT lager,
          -- inte från det som råkar stå i hyllan just nu.
          COALESCE(
            NULLIF(r.reorder_qty, 0),
            NULLIF(GREATEST(r.max_qty - a.virtual, 0), 0),
            r.min_qty - a.virtual
          )
        ELSE
          COALESCE(
            NULLIF(ps.reorder_quantity, 0),
            GREATEST(COALESCE(p_threshold_override, p.low_stock_threshold) * 3, 10)
          )
      END::numeric                                                          AS rq,
      COALESCE(ps.auto_reorder, true)                                       AS auto_reorder
    FROM public.products p
    LEFT JOIN public.product_stock ps ON ps.product_id = p.id
    LEFT JOIN rule r ON r.product_id = p.id
    CROSS JOIN LATERAL public.stock_virtual_available(p.id, NULL) a
    WHERE p.is_active = true
      AND p.track_inventory = true
  )
  SELECT
    c.id,
    c.name,
    c.on_hand::int,
    CEIL(c.rp)::int,
    GREATEST(CEIL(c.rq), COALESCE(pv.min_order_quantity, 1))::int,
    pv.vendor_id,
    pv.vendor_name,
    pv.unit_price_cents,
    pv.lead_time_days,
    pv.min_order_quantity,
    GREATEST(CEIL(c.rq), COALESCE(pv.min_order_quantity, 1))::bigint
      * COALESCE(pv.unit_price_cents, 0)::bigint,
    c.reserved,
    c.incoming,
    c.virtual,
    pv.vendor_source
  FROM candidate c
  LEFT JOIN LATERAL public.reorder_preferred_vendor(c.id, NULL) pv ON true
  WHERE c.rp IS NOT NULL
    AND CASE
          -- En regel är ett MINIMUM: den slår till UNDER min_qty.
          -- Legacy-tröskeln behåller sin vid-eller-under-betydelse.
          WHEN c.has_rule THEN c.virtual < c.rp
          -- Overriden gäller alla lagerförda produkter, även de vars regel
          -- säger manufacture — den frågar "vad ligger under N", inte "vad
          -- säger reglerna".
          WHEN p_threshold_override IS NOT NULL THEN c.virtual <= c.rp
          -- Har produkten bara manufacture-regler hör den till mrp_reorder_run.
          ELSE c.rules_total = 0 AND c.auto_reorder AND c.virtual <= c.rp
        END
  ORDER BY (c.rp - c.virtual) DESC;
$function$;

COMMENT ON FUNCTION public.list_reorder_candidates(numeric) IS
  'Produkter under sin påfyllningsregel, räknat på VIRTUELLT lager ur '
  'stock_virtual_available (på hand − reserverat + inkommande) och med '
  'leverantören ur reorder_preferred_vendor. Läste tidigare bara '
  'products.stock_quantity och svarade 22 kandidater på ett lager där '
  'procurement_run rätteligen svarade 0 — 306 963,75 kr i dubbelbeställningar '
  'ovanpå fyra öppna inköpsordrar. Raden bär reserved_qty/incoming_qty/'
  'virtual_qty/vendor_source så att svaret går att granska utan att räkna om. '
  'p_threshold_override byter bara ut beställningspunkten (purchase_reorder_check '
  'ad hoc-läge) — aldrig aritmetiken.';

REVOKE ALL ON FUNCTION public.list_reorder_candidates(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_reorder_candidates(numeric) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. procurement_run räknar ur samma funktion (samma svar, en källa).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.procurement_run()
RETURNS TABLE(suggestions_created integer, rules_evaluated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule record;
  v_av record;
  v_vendor record;
  v_qty_to_order numeric;
  v_count integer := 0;
  v_evaluated integer := 0;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(), 'inventory'))) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  FOR v_rule IN SELECT * FROM reorder_rules WHERE is_active = true LOOP
    v_evaluated := v_evaluated + 1;

    -- Aritmetiken bor inte längre här. Samma funktion som kandidatlistan.
    SELECT * INTO v_av
      FROM public.stock_virtual_available(v_rule.product_id, v_rule.location_id);

    IF v_av.virtual < v_rule.min_qty THEN
      v_qty_to_order := COALESCE(NULLIF(v_rule.reorder_qty, 0), v_rule.max_qty - v_av.virtual);
      IF v_qty_to_order <= 0 THEN
        v_qty_to_order := v_rule.min_qty - v_av.virtual;
      END IF;

      -- Leverantören bor inte heller här.
      SELECT * INTO v_vendor
        FROM public.reorder_preferred_vendor(v_rule.product_id, v_rule.location_id);

      IF NOT EXISTS (
        SELECT 1 FROM procurement_suggestions
        WHERE product_id = v_rule.product_id
          AND location_id = v_rule.location_id
          AND status = 'pending'
      ) THEN
        INSERT INTO procurement_suggestions (
          product_id, location_id, suggested_qty, procurement_method,
          preferred_vendor_id, needed_by, reasoning)
        VALUES (
          v_rule.product_id, v_rule.location_id, v_qty_to_order, v_rule.procurement_method,
          COALESCE(v_vendor.vendor_id, v_rule.preferred_vendor_id),
          -- Regelns ledtid är operatörens uttryckliga siffra och vinner;
          -- leverantörens är bara ett fallback. Omvänd ordning hade tyst
          -- ersatt en regel på 14 dagar med vendor_products default 7.
          (CURRENT_DATE + (COALESCE(v_rule.lead_time_days, v_vendor.lead_time_days, 7) || ' days')::interval)::date,
          jsonb_build_object(
            'on_hand', v_av.on_hand, 'reserved', v_av.reserved, 'incoming', v_av.incoming,
            'virtual', v_av.virtual, 'min_qty', v_rule.min_qty, 'max_qty', v_rule.max_qty,
            'vendor_source', v_vendor.vendor_source,
            'availability_source', 'stock_virtual_available'));
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_count, v_evaluated;
END;
$function$;

COMMENT ON FUNCTION public.procurement_run() IS
  'MRP-schemaläggaren: en pending procurement_suggestion per aktiv regel vars '
  'virtuella lager (stock_virtual_available) ligger under min_qty. Räknade rätt '
  'redan innan — 0 förslag där kandidatlistan hittade 22 — men räknade i egen '
  'kod. Aritmetiken och leverantörsvalet är numera delade, så motorerna inte '
  'kan glida isär igen.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. auto_generate_purchase_orders överlever som VERB.
--    Den skapar order där procurement_run föreslår, men har ingen egen
--    aritmetik: varje rad kommer ur list_reorder_candidates.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_generate_purchase_orders(p_dry_run boolean DEFAULT false)
RETURNS TABLE(po_id uuid, po_number text, vendor_id uuid, vendor_name text, line_count integer, total_cents bigint, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vendor RECORD; v_line RECORD;
  v_po_id UUID; v_po_number TEXT;
  v_subtotal BIGINT; v_tax BIGINT;
  v_line_count INTEGER; v_skipped_count INTEGER;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::public.app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'approver'::public.app_role))) THEN
    RAISE EXCEPTION 'Only admins/approvers can auto-generate purchase orders';
  END IF;

  SELECT COUNT(*) INTO v_skipped_count
  FROM public.list_reorder_candidates() c WHERE c.vendor_id IS NULL;

  IF v_skipped_count > 0 THEN
    po_id := NULL; po_number := NULL; vendor_id := NULL;
    vendor_name := v_skipped_count::TEXT || ' product(s) skipped — no preferred vendor';
    line_count := 0; total_cents := 0; status := 'skipped';
    RETURN NEXT;
  END IF;

  FOR v_vendor IN
    SELECT c.vendor_id AS v_id, MAX(c.vendor_name) AS v_name
    FROM public.list_reorder_candidates() c
    WHERE c.vendor_id IS NOT NULL
    GROUP BY c.vendor_id
  LOOP
    v_subtotal := 0; v_tax := 0; v_line_count := 0;

    IF NOT p_dry_run THEN
      INSERT INTO public.purchase_orders (vendor_id, status, order_date, notes, created_by)
      VALUES (v_vendor.v_id, 'draft', CURRENT_DATE,
              'Auto-generated by inventory reorder loop on ' || CURRENT_DATE
                || ' — quantities computed from virtual stock (on hand − reserved + incoming).',
              auth.uid())
      RETURNING id, purchase_orders.po_number INTO v_po_id, v_po_number;

      FOR v_line IN
        SELECT * FROM public.list_reorder_candidates() c WHERE c.vendor_id = v_vendor.v_id
      LOOP
        INSERT INTO public.purchase_order_lines (
          purchase_order_id, product_id, description, quantity, unit_price_cents, tax_rate, total_cents)
        VALUES (
          v_po_id, v_line.product_id, v_line.product_name,
          v_line.reorder_quantity, v_line.unit_price_cents, 25.00,
          v_line.reorder_quantity * v_line.unit_price_cents);
        v_subtotal := v_subtotal + v_line.estimated_cost_cents;
        v_line_count := v_line_count + 1;
      END LOOP;

      v_tax := ROUND(v_subtotal * 0.25);
      UPDATE public.purchase_orders
      SET subtotal_cents = v_subtotal, tax_cents = v_tax,
          total_cents = v_subtotal + v_tax, updated_at = now()
      WHERE id = v_po_id;
    ELSE
      v_po_id := NULL;
      v_po_number := '(dry-run)';
      SELECT COUNT(*), COALESCE(SUM(c.estimated_cost_cents), 0)
        INTO v_line_count, v_subtotal
      FROM public.list_reorder_candidates() c WHERE c.vendor_id = v_vendor.v_id;
      v_tax := ROUND(v_subtotal * 0.25);
    END IF;

    po_id := v_po_id;
    po_number := v_po_number;
    vendor_id := v_vendor.v_id;
    vendor_name := v_vendor.v_name;
    line_count := v_line_count;
    total_cents := v_subtotal + v_tax;
    status := CASE WHEN p_dry_run THEN 'preview' ELSE 'created' END;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.auto_generate_purchase_orders(boolean) IS
  'Verbet i påfyllningen: grupperar list_reorder_candidates per leverantör och '
  'skapar en draft-PO per leverantör. Har medvetet INGEN egen lager- eller '
  'leverantörsberäkning — varje rad kommer ur kandidatlistan, som i sin tur '
  'räknar ur stock_virtual_available. Så länge det gäller kan den inte längre '
  'skriva 306 963,75 kr ovanpå order som redan är lagda.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Tillverkningsbanan hade samma blindhet i sin lagersiffra.
--    Den räknar inte inkommande PO (en tillverkad vara köps inte in) men ska
--    inte heller läsa den tomma legacy-tabellen. På hand − reserverat, ur
--    samma funktion. Idempotensen (öppen MO finns redan) är oförändrad.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mrp_reorder_run(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_candidates jsonb := '[]'::jsonb;
  v_created int := 0;
  v_mo uuid;
BEGIN
  IF NOT p_dry_run AND NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'manufacturing')) THEN
    RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions';
  END IF;

  FOR v_row IN
    WITH rule AS (
      SELECT
        rr.product_id,
        COUNT(*)                                                                AS rules_total,
        COUNT(*) FILTER (WHERE rr.procurement_method = 'manufacture')           AS mfg_rules,
        SUM(rr.min_qty) FILTER (WHERE rr.procurement_method = 'manufacture')    AS min_qty,
        SUM(rr.max_qty) FILTER (WHERE rr.procurement_method = 'manufacture')    AS max_qty,
        SUM(COALESCE(rr.reorder_qty, 0))
          FILTER (WHERE rr.procurement_method = 'manufacture')                  AS reorder_qty
      FROM reorder_rules rr
      WHERE rr.is_active = true
      GROUP BY rr.product_id
    ),
    candidate AS (
      SELECT
        p.id                                                      AS product_id,
        p.name                                                    AS product_name,
        -- På hand − reserverat. Inkommande inköp hör inte hit; det som är
        -- "på väg" för en tillverkad vara är en öppen MO, och den fångas av
        -- NOT EXISTS-villkoret längre ner.
        (a.on_hand - a.reserved)                                  AS available,
        (COALESCE(r.mfg_rules, 0) > 0)                            AS has_rule,
        COALESCE(r.rules_total, 0)                                AS rules_total,
        COALESCE(r.min_qty, ps.reorder_point, p.low_stock_threshold)::numeric AS rp,
        CASE
          WHEN COALESCE(r.mfg_rules, 0) > 0 THEN
            COALESCE(
              NULLIF(r.reorder_qty, 0),
              NULLIF(GREATEST(r.max_qty - (a.on_hand - a.reserved), 0), 0),
              r.min_qty - (a.on_hand - a.reserved)
            )
          ELSE NULL
        END::numeric                                              AS rule_qty,
        b.id                                                      AS bom_id
      FROM products p
      JOIN bom_headers b ON b.product_id = p.id AND b.is_active
      LEFT JOIN product_stock ps ON ps.product_id = p.id
      LEFT JOIN rule r ON r.product_id = p.id
      CROSS JOIN LATERAL public.stock_virtual_available(p.id, NULL) a
    )
    SELECT
      c.product_id,
      c.product_name,
      c.available                                                 AS quantity_on_hand,
      CEIL(c.rp)::int                                             AS reorder_point,
      GREATEST(CEIL(COALESCE(c.rule_qty, c.rp - c.available)), 1)::int AS suggested_qty,
      c.bom_id
    FROM candidate c
    WHERE c.rp IS NOT NULL
      AND c.rp > 0
      AND CASE
            WHEN c.has_rule THEN c.available < c.rp
            ELSE c.rules_total = 0 AND c.available <= c.rp
          END
      AND NOT EXISTS (
        SELECT 1 FROM manufacturing_orders mo
        WHERE mo.product_id = c.product_id AND mo.status NOT IN ('done','cancelled')
      )
  LOOP
    v_candidates := v_candidates || jsonb_build_object(
      'product_id', v_row.product_id, 'product_name', v_row.product_name,
      'quantity_on_hand', v_row.quantity_on_hand, 'reorder_point', v_row.reorder_point,
      'suggested_qty', v_row.suggested_qty, 'bom_id', v_row.bom_id);

    IF NOT p_dry_run THEN
      INSERT INTO manufacturing_orders (mo_number, product_id, bom_id, quantity, status, source_type, created_by)
      VALUES (next_mo_number(), v_row.product_id, v_row.bom_id, v_row.suggested_qty, 'draft', 'reorder', auth.uid())
      RETURNING id INTO v_mo;
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'candidate_count', jsonb_array_length(v_candidates),
    'created', v_created,
    'candidates', v_candidates
  );
END;
$function$;

COMMENT ON FUNCTION public.mrp_reorder_run(boolean) IS
  'Tillverkningsbanans påfyllning. Läser på hand och reserverat ur '
  'stock_virtual_available i stället för den tomma product_stock/NULL-spegeln. '
  'Inkommande inköpsorder räknas medvetet INTE — det som är på väg för en '
  'tillverkad vara är en öppen MO, och den utesluts redan av idempotensvillkoret.';
