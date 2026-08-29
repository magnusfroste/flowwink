-- Kundryggraden, steg 5: samma part, tre linser.
--
-- Odoo har ingen kundtabell och ingen leverantörstabell. Det finns EN part, och
-- customer_rank / supplier_rank säger vad den har varit med om. "Kunder",
-- "Leverantörer" och "Kontakter" är tre vyer av samma rader — inte tre register
-- som måste hållas i synk. Det är hela poängen med att låna deras modell:
-- ett bolag som både köper av oss och levererar till oss är EN part med två
-- nollskilda tal, inte två poster som ingen vet hör ihop.
--
-- Två fält följer med när vendors viker in, för de skulle annars gå förlorade:
-- betalningsvillkor och valuta. Hos Odoo är de commercial fields — de bor på
-- parten och ärvs nedåt i hierarkin. Här bor de på parten; arvet är ett senare
-- steg och ska inte gissas fram nu.
--
-- Och `active`: Odoo ARKIVERAR parter, raderar dem aldrig. En part med
-- historik får inte försvinna bara för att relationen tog slut.
--
-- Huvudboken (journal_entries, accounting_corrections) får INTE en partner_id
-- här. De raderna ska bära den KOMMERSIELLA parten, inte dokumentets adressat,
-- och den skillnaden förtjänar ett eget steg med egna påståenden. Att lägga in
-- den på köpet här vore precis den sortens tysta antagande som gör att
-- reskontran splittras på kontaktpersoner.

-- ── Fält som annars går förlorade i vikningen ───────────────────────────────
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS active         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_terms  text,
  ADD COLUMN IF NOT EXISTS currency       text,
  ADD COLUMN IF NOT EXISTS notes          text,
  ADD COLUMN IF NOT EXISTS website        text;

-- Vakten är inte pedanteri: varje annan tabellreferens i steg 4 och 5 går via
-- to_regclass. Att just den här antog att vendors finns var den enda platsen
-- filen litade på tur.
DO $$
BEGIN
  IF to_regclass('public.vendors') IS NOT NULL THEN
    ALTER TABLE public.partners
      ADD COLUMN IF NOT EXISTS source_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
  ELSE
    ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS source_vendor_id uuid;
  END IF;
END $$;

COMMENT ON COLUMN public.partners.active IS
  'Arkiverad i stället för raderad (Odoo active). En part med historik försvinner aldrig.';

CREATE UNIQUE INDEX IF NOT EXISTS partners_source_vendor_uniq
  ON public.partners (source_vendor_id) WHERE source_vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS partners_supplier_idx
  ON public.partners (supplier_rank) WHERE supplier_rank > 0;

-- ── Matrisen: purchasing kommer in nu, precis som utlovat i steg 1 ──────────
DROP POLICY IF EXISTS "Partners readable by companies- or crm-module roles" ON public.partners;
CREATE POLICY "Partners readable by companies- or crm-module roles" ON public.partners
  FOR SELECT TO authenticated
  USING (can_access_module(auth.uid(), 'companies')
      OR can_access_module(auth.uid(), 'crm')
      OR can_access_module(auth.uid(), 'purchasing'));

DROP POLICY IF EXISTS "Partners insertable by companies- or crm-module roles" ON public.partners;
CREATE POLICY "Partners insertable by companies- or crm-module roles" ON public.partners
  FOR INSERT TO authenticated
  WITH CHECK (can_access_module(auth.uid(), 'companies')
           OR can_access_module(auth.uid(), 'crm')
           OR can_access_module(auth.uid(), 'purchasing'));

DROP POLICY IF EXISTS "Partners writable by companies- or crm-module roles" ON public.partners;
CREATE POLICY "Partners writable by companies- or crm-module roles" ON public.partners
  FOR UPDATE TO authenticated
  USING (can_access_module(auth.uid(), 'companies')
      OR can_access_module(auth.uid(), 'crm')
      OR can_access_module(auth.uid(), 'purchasing'))
  WITH CHECK (can_access_module(auth.uid(), 'companies')
           OR can_access_module(auth.uid(), 'crm')
           OR can_access_module(auth.uid(), 'purchasing'));

-- ── De tre linserna ─────────────────────────────────────────────────────────
-- Vyer, inte tabeller. security_invoker = true är inte en detalj: utan den kör
-- vyn med ägarens rättigheter och matrisen blir en no-op — exakt den
-- blindfläck som USING(true)-svepet hittade i augusti.
CREATE OR REPLACE VIEW public.v_contacts
WITH (security_invoker = true) AS
  SELECT * FROM public.partners WHERE active;

CREATE OR REPLACE VIEW public.v_customers
WITH (security_invoker = true) AS
  SELECT * FROM public.partners WHERE active AND customer_rank > 0;

CREATE OR REPLACE VIEW public.v_vendors
WITH (security_invoker = true) AS
  SELECT * FROM public.partners WHERE active AND supplier_rank > 0;

COMMENT ON VIEW public.v_contacts  IS 'Lins: alla aktiva parter. Samma rader som v_customers och v_vendors, utan filter.';
COMMENT ON VIEW public.v_customers IS 'Lins: parter vi har sålt till (customer_rank > 0). En part kan synas här OCH i v_vendors.';
COMMENT ON VIEW public.v_vendors   IS 'Lins: parter vi har köpt av (supplier_rank > 0). En part kan synas här OCH i v_customers.';

-- ── Leverantörerna viker in ─────────────────────────────────────────────────
-- Egen funktion, inte en INSERT i migrationen: samma skäl som för
-- backfill_partners. Idempotent på source_vendor_id.
CREATE OR REPLACE FUNCTION public.backfill_vendor_partners(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending int;
  v_made    int := 0;
  v_merged  int := 0;
  v_dupes   int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: backfilling vendor partners requires the admin role';
  END IF;

  SELECT count(*) INTO v_pending
  FROM vendors v
  WHERE NOT EXISTS (SELECT 1 FROM partners p WHERE p.source_vendor_id = v.id);

  -- Två leverantörsrader med samma adress kan inte båda bli SAMMA part
  -- (source_vendor_id är unik). Den ena viker in, den andra blir en egen part
  -- med samma e-post. Inget korrumperas, men utfallet är ett omdöme någon
  -- måste fatta — så det redovisas i stället för att ske tyst.
  SELECT coalesce(sum(c) - count(*), 0) INTO v_dupes FROM (
    SELECT count(*) AS c FROM vendors
    WHERE email IS NOT NULL AND trim(email) <> ''
    GROUP BY lower(trim(email)) HAVING count(*) > 1) x;

  IF NOT p_dry_run THEN
    -- 1. En leverantör vars e-post redan tillhör en part ÄR den parten. Det är
    --    hela vinsten med modellen: bolaget som både köper och levererar blir
    --    en rad med två nollskilda tal, inte två poster.
    WITH upd AS (
      UPDATE partners p
         SET supplier_rank    = greatest(p.supplier_rank, 1),
             source_vendor_id = v.id,
             payment_terms    = coalesce(p.payment_terms, v.payment_terms),
             currency         = coalesce(p.currency, v.currency),
             website          = coalesce(p.website, v.website)
        -- Äldsta leverantörsraden per adress vinner. Utan DISTINCT ON valde
        -- Postgres godtyckligt vilken som vek in.
        FROM (SELECT DISTINCT ON (lower(trim(email))) * FROM vendors
              WHERE email IS NOT NULL AND trim(email) <> ''
              ORDER BY lower(trim(email)), created_at ASC) v
       WHERE lower(p.email) = lower(trim(v.email))
         AND v.email IS NOT NULL AND trim(v.email) <> ''
         AND p.source_vendor_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM partners q WHERE q.source_vendor_id = v.id)
      RETURNING 1
    ) SELECT count(*) INTO v_merged FROM upd;

    -- 2. Resten blir nya parter.
    WITH ins AS (
      INSERT INTO partners (name, is_company, type, email, phone, street, website,
                            notes, payment_terms, currency, supplier_rank, active,
                            source_vendor_id)
      SELECT v.name, true, 'contact', nullif(trim(v.email), ''), v.phone, v.address,
             v.website, v.notes, v.payment_terms, v.currency, 1,
             coalesce(v.is_active, true), v.id
      FROM vendors v
      WHERE NOT EXISTS (SELECT 1 FROM partners p WHERE p.source_vendor_id = v.id)
      ON CONFLICT (source_vendor_id) WHERE source_vendor_id IS NOT NULL DO NOTHING
      RETURNING 1
    ) SELECT count(*) INTO v_made FROM ins;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'pending', v_pending,
    'merged_into_existing_party', v_merged,
    'created', v_made,
    'both_customer_and_vendor', (SELECT count(*) FROM partners WHERE customer_rank > 0 AND supplier_rank > 0),
    'vendors_sharing_an_email', v_dupes,
    'vendors_total', (SELECT count(*) FROM vendors)
  );
END $$;

REVOKE ALL ON FUNCTION public.backfill_vendor_partners(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_vendor_partners(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.backfill_vendor_partners(boolean) IS
  'Viker in vendors i partsregistret. En leverantör vars e-post redan tillhör '
  'en part BLIR den parten med supplier_rank > 0 — inte en andra post.';

-- ── Inköpsdokumenten får sin part ───────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'purchase_orders', 'vendor_invoices', 'vendor_credit_memos',
    'return_to_vendor', 'rfq_bids', 'vendor_products', 'inventory_receipts'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL', t);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (partner_id) WHERE partner_id IS NOT NULL',
      t || '_partner_idx', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.backfill_purchase_partners(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_report jsonb := '{}'::jsonb;
  v_linked int;
  v_left   int;
  t        text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: backfilling purchase partners requires the admin role';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'purchase_orders', 'vendor_invoices', 'vendor_credit_memos',
    'return_to_vendor', 'rfq_bids', 'vendor_products', 'inventory_receipts'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    v_linked := 0;
    IF NOT p_dry_run THEN
      EXECUTE format($q$
        UPDATE public.%I d SET partner_id = p.id
        FROM public.partners p
        WHERE p.source_vendor_id = d.vendor_id AND d.partner_id IS NULL$q$, t);
      GET DIAGNOSTICS v_linked = ROW_COUNT;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE partner_id IS NULL', t) INTO v_left;
    v_report := v_report || jsonb_build_object(t, jsonb_build_object(
      'linked', v_linked, 'still_without_partner', v_left));
  END LOOP;

  RETURN jsonb_build_object('dry_run', p_dry_run, 'tables', v_report);
END $$;

REVOKE ALL ON FUNCTION public.backfill_purchase_partners(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_purchase_partners(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.backfill_purchase_partners(boolean) IS
  'Länkar inköpsdokumenten till partsregistret via vendors → partners.source_vendor_id. '
  'Kör backfill_vendor_partners först; utan parter finns inget att länka till.';

-- ── En synlighetsändring värd att säga högt ─────────────────────────────────
-- Att vika in leverantörerna i partners betyder att policyn ovan ger en
-- purchasing-roll läsrätt till ALLA parter — även kunderna — och en crm-roll
-- läsrätt till leverantörerna. Det är samma sak som hos Odoo, där kontakter är
-- ett gemensamt register och linsen är ett filter, inte en behörighet. Men det
-- är en behörighetsändring som kommer som SIDOEFFEKT av en modelländring, och
-- sådana ska stå utskrivna. Vill vi ha smalare läsrätt är rätt plats en policy
-- per lins, inte en andra tabell.
