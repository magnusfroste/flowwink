-- Databasens egna beskrivningar säger vad kolumnen ÄR, inte vad den heter hos
-- en annan leverantör. 29 tabell- och kolumnkommentarer och 8
-- funktionskommentarer bar en parentes som "(Odoo partner_id)" eller
-- "Odoos address_get"; de skrivs om utan att innehållet ändras. Två strängar
-- som faktiskt når en användare eller en agent får samma behandling: felet ur
-- partner_address() och noten ur backfill_commercial_fields(). Funktionerna
-- återskapas ordagrant i övrigt (CREATE OR REPLACE behåller rättigheterna).
--
-- Kvar med flit: import_links, crm_tasks.activity_type och leads.tags, som
-- beskriver vad Odoo-IMPORTÖREN gör — den namnger källan den läser från.
-- Idempotent: COMMENT ON och CREATE OR REPLACE kan köras om.

COMMENT ON COLUMN public.service_orders.partner_id IS
  'Parten dokumentet gäller. Nullbar under övergången: de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.';

COMMENT ON COLUMN public.invoices.partner_id IS
  'Parten dokumentet gäller. Nullbar under övergången: de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.';

COMMENT ON COLUMN public.invoices.partner_invoice_id IS
  'Fakturaadressen som PART. Defaultas från kunden, går att skriva över.';

COMMENT ON COLUMN public.invoices.partner_shipping_id IS
  'Leveransadressen som PART. Skatt och fraktzon härleds ur den.';

COMMENT ON COLUMN public.invoices.partner_bank_id IS
  'Kontot betalningen går TILL. För en leverantörsfaktura leverantörens konto; för en kundfaktura vårt eget.';

COMMENT ON COLUMN public.bank_accounts.partner_id IS
  'Kontohavaren — alltid vårt eget bolags part. Finns för att uttrycka regeln om vem pengarna går till; de två banktabellerna slås ihop i ett senare steg.';

COMMENT ON COLUMN public.bookings.partner_id IS
  'Parten dokumentet gäller. Nullbar under övergången: de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.';

COMMENT ON COLUMN public.contracts.partner_id IS
  'Parten dokumentet gäller. Nullbar under övergången: de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.';

COMMENT ON COLUMN public.deals.partner_id IS
  'Parten dokumentet gäller. Nullbar under övergången: de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.';

COMMENT ON COLUMN public.journal_entry_lines.partner_id IS
  'Alltid verifikationens KOMMERSIELLA part, aldrig adressaten. Det är den här kolumnen reskontran summerar.';

COMMENT ON COLUMN public.leads.partner_id IS
  'Parten bakom leadet. NULL är ett giltigt och vanligt tillstånd: ett lead som ännu bara är pipeline har ingen part.';

COMMENT ON COLUMN public.orders.partner_id IS
  'Parten dokumentet gäller. Nullbar under övergången: de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.';

COMMENT ON COLUMN public.orders.partner_invoice_id IS
  'Fakturaadressen som PART. Defaultas från kunden, går att skriva över.';

COMMENT ON COLUMN public.orders.partner_shipping_id IS
  'Leveransadressen som PART. Skatt och fraktzon härleds ur den.';

COMMENT ON COLUMN public.projects.partner_id IS
  'Parten dokumentet gäller. Nullbar under övergången: de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.';

COMMENT ON COLUMN public.quotes.prepayment_pct IS
  'Optional prepayment percentage (1-100). When set, the public sign-and-pay flow charges only this share of the invoice total as a deposit. NULL = full amount.';

COMMENT ON COLUMN public.quotes.partner_id IS
  'Parten dokumentet gäller. Nullbar under övergången: de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.';

COMMENT ON COLUMN public.quotes.partner_invoice_id IS
  'Fakturaadressen som PART. Defaultas från kunden, går att skriva över.';

COMMENT ON COLUMN public.quotes.partner_shipping_id IS
  'Leveransadressen som PART. Skatt och fraktzon härleds ur den.';

COMMENT ON COLUMN public.subscriptions.partner_id IS
  'Parten dokumentet gäller. Nullbar under övergången: de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.';

COMMENT ON COLUMN public.tickets.partner_id IS
  'Parten dokumentet gäller. Nullbar under övergången: de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.';

COMMENT ON TABLE public.partners IS
  'Parter: människor och organisationer i samma tabell. is_company skiljer dem, parent_id bär kontakt→bolag och koncern, type gör adresser till barnrader. Kund/leverantör är rank-heltal, inte två tabeller.';

COMMENT ON COLUMN public.partners.commercial_partner_id IS
  'Den juridiska personen fakturan ställs till: närmaste förfader som är bolag, annars parten själv. Fordringar, kreditgräns och dubblettkontroll grupperar på DEN — inte på kontaktpersonen.';

COMMENT ON COLUMN public.partners.active IS
  'Arkiverad i stället för raderad. En part med historik försvinner aldrig.';

COMMENT ON COLUMN public.partners.credit_limit_cents IS
  'Kreditgräns. Kommersiellt fält: bor på den juridiska personen och ärvs ned till kontaktpersoner.';

COMMENT ON COLUMN public.partners.is_self IS
  'Vårt EGET bolag. Exakt en rad per instans. Speglar site_settings.company_profile — redigera där, inte här.';

COMMENT ON TABLE public.partner_bank_accounts IS
  'Motparternas bankkonton. Hör ALLTID till en kommersiell enhet — ett bolag eller en fristående person, aldrig en kontaktperson. Våra egna konton bor kvar i bank_accounts.';

COMMENT ON TABLE public.partner_titles IS
  'Tilltal. Organisationens lista, inte plattformens — därför en tabell och inte en enum.';

COMMENT ON TABLE public.fiscal_positions IS
  'Momsbehandlingar per jurisdiktion. Levereras av locale-paketet — svensk lag hör till se-bas2024, inte till motorn. Parten bär vilken som gäller för den.';

COMMENT ON FUNCTION public.seed_trading_history() IS
  'Plants what happened BEFORE the seed window: an opening inventory count (the usual ERP convention — not fabricated purchase orders) and 24 months of settled service-agreement invoices. Separate from the P2P/O2C/RMA chains on purpose: those assert state was earned by a process that ran, this one states an opening position. Idempotent; gated by seed_chain_mode().';

COMMENT ON FUNCTION public.stock_virtual_available(p_product_id uuid, p_location_id uuid) IS
  'Prognostiserad tillgänglighet: på hand − reserverat + inkommande. ENDA källan för varje påfyllningsmotor (procurement_run, list_reorder_candidates, auto_generate_purchase_orders, mrp_reorder_run, purchase_reorder_check). Motorer som räknade på egen hand svarade 0 respektive 22 förslag på samma lager, och en torrkörning skrev 306 963,75 kr ovanpå fyra redan öppna inköpsordrar. Lägg aldrig till en läsare med egen aritmetik — läs härifrån.';

COMMENT ON FUNCTION public.manage_reorder_rule(p_action text, p_product text, p_location text, p_min_qty numeric, p_max_qty numeric, p_reorder_qty numeric, p_lead_time_days integer, p_procurement_method text, p_preferred_vendor text, p_is_active boolean, p_rule_id uuid) IS
  'Agentytan för reorder_rules — första steget i procure-to-pay. Tabellen hade admin-UI men ingen skill alls: search_skills på "set reordering rule min max reorder point" gav manage_product, place_order och manage_reconciliation_rule, och två skillinstruktioner sa uttryckligen att reglerna sätts i UI:t. Tar emot namn i stället för UUID och svarar med tillgängligheten ur stock_virtual_available, så agenten ser vad regeln gör.';

COMMENT ON FUNCTION public.partners_bump_rank() IS
  'Markerar parten som kund respektive leverantör när ett kommersiellt dokument får sin part. Träffar både adressaten och den kommersiella parten. Idempotent: bara rank = 0 rörs.';

COMMENT ON FUNCTION public.partner_address(p_partner_id uuid, p_type text) IS
  'Adressuppslaget: barn med rätt typ, annars en inom samma kommersiella part, annars parten själv. Skapar aldrig något.';

COMMENT ON FUNCTION public.partner_commercial_fields() IS
  'Fälten som tillhör den kommersiella parten och ärvs ned till icke-bolag. Lägg till ett fält HÄR, inte i triggern.';

COMMENT ON FUNCTION public.document_bank_partner(p_partner_id uuid, p_direction text) IS
  'Vem pengarna går TILL: vårt eget bolag för en kundfaktura, motparten för en leverantörsfaktura.';

COMMENT ON FUNCTION public.archive_partner(p_partner text, p_archive boolean, p_reason text) IS
  'Pensionerar eller återställer en part. Arkiverar, raderar aldrig — dokumenten och huvudboken är orörda. Ingen kaskad till barn, men allt som lämnas kvar rapporteras: aktiva barn, obetalda fakturor, levande prenumerationer, inloggningskonto.';

CREATE OR REPLACE FUNCTION public.partner_address(p_partner_id uuid, p_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_commercial uuid;
BEGIN
  IF p_partner_id IS NULL THEN RETURN NULL; END IF;
  IF p_type NOT IN ('invoice', 'delivery', 'other', 'contact') THEN
    RAISE EXCEPTION 'Unknown address type % — the types are contact, invoice, delivery, other', p_type;
  END IF;

  -- 1. Ett barn med rätt typ.
  SELECT id INTO v_id FROM partners
   WHERE parent_id = p_partner_id AND type = p_type AND active
   ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 2. Uppåt, men bara inom samma kommersiella part: en systerkontakts
  --    fakturaadress hör till samma juridiska person, en annan kunds gör det inte.
  SELECT commercial_partner_id INTO v_commercial FROM partners WHERE id = p_partner_id;
  IF v_commercial IS NOT NULL THEN
    SELECT id INTO v_id FROM partners
     WHERE commercial_partner_id = v_commercial AND type = p_type AND active
       AND id <> p_partner_id
     ORDER BY (parent_id = p_partner_id) DESC, created_at LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  -- 3. Parten själv. Ett bolag utan registrerad fakturaadress ÄR sin adress.
  RETURN p_partner_id;
END $function$;
REVOKE ALL ON FUNCTION public.partner_address(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_address(uuid, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.backfill_commercial_fields(p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empty int; v_conflicting int; v_synced int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: backfilling commercial fields requires the admin role';
  END IF;

  -- Rader som bara saknar värden.
  SELECT count(*) INTO v_empty
    FROM partners c JOIN partners m ON m.id = c.commercial_partner_id
   WHERE c.id <> m.id AND NOT c.is_company
     AND (coalesce(c.vat,'') = '' AND coalesce(m.vat,'') <> ''
       OR coalesce(c.payment_terms,'') = '' AND coalesce(m.payment_terms,'') <> '');

  -- Rader som har ETT EGET värde som skiljer sig — de skrivs över.
  SELECT count(*) INTO v_conflicting
    FROM partners c JOIN partners m ON m.id = c.commercial_partner_id
   WHERE c.id <> m.id AND NOT c.is_company
     AND (coalesce(c.vat,'') <> '' AND coalesce(c.vat,'') IS DISTINCT FROM coalesce(m.vat,'')
       OR coalesce(c.payment_terms,'') <> '' AND coalesce(c.payment_terms,'') IS DISTINCT FROM coalesce(m.payment_terms,''));

  IF NOT p_dry_run THEN
    WITH upd AS (
      UPDATE partners c
         SET vat = m.vat, company_registry = m.company_registry,
             payment_terms = m.payment_terms, currency = m.currency,
             credit_limit_cents = m.credit_limit_cents
        FROM partners m
       WHERE m.id = c.commercial_partner_id AND c.id <> m.id AND NOT c.is_company
         AND (c.vat IS DISTINCT FROM m.vat
           OR c.company_registry IS DISTINCT FROM m.company_registry
           OR c.payment_terms IS DISTINCT FROM m.payment_terms
           OR c.currency IS DISTINCT FROM m.currency
           OR c.credit_limit_cents IS DISTINCT FROM m.credit_limit_cents)
      RETURNING 1
    ) SELECT count(*) INTO v_synced FROM upd;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'contacts_missing_values', v_empty,
    'contacts_whose_own_value_differs', v_conflicting,
    'contacts_synced', v_synced,
    'note', 'The party''s value overwrites the contact''s own: these fields belong to the '
         || 'legal entity, not the person. The second number is how many had a value '
         || 'of their own — read it before running, because a silently overwritten '
         || 'payment term silently changes when the customer has to pay.');
END $function$;
REVOKE ALL ON FUNCTION public.backfill_commercial_fields(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_commercial_fields(boolean) TO authenticated, service_role;

