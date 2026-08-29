-- Kundryggraden, steg 1: partsregistret föds.
--
-- Fem dialekter svarar i dag på frågan "vem är kunden?": lead_id (15 tabeller),
-- customer_email som ren fritext (13), company_id (11), user_id (4) och
-- client_name (2). Optics enda projekt har client_name = 'potentiella' medan tre
-- riktiga företag ligger olänkade bredvid — ett fritextfält ber om ett ord, så
-- det blir ett ord.
--
-- Formen är Odoos res.partner, medvetet kopierad snarare än uppfunnen:
--   * EN tabell för människor och organisationer (is_company skiljer dem)
--   * parent_id bär både kontakt→bolag och koncernhierarki
--   * adresser är BARNPARTER (type = invoice|delivery), inte en egen tabell
--   * kund och leverantör är samma part (customer_rank / supplier_rank)
-- Pipelinen blir kvar där den hör hemma: crm.lead är en egen modell hos Odoo
-- med en NULLBAR partner_id. Vår `leads` är i dag de två modellerna hopslagna
-- till en — steg 2 delar dem, den här migrationen rör dem inte.
--
-- Den här filen skapar bara tabellen. Backfillen är en FUNKTION, inte en
-- INSERT: schemat hör till hela flottan, men vilka rader som ska finnas är en
-- fråga per instans. (Squash-läxan: en engångs-INSERT i en migration överlever
-- inte en konsolidering och kan inte köras om.)

-- ── Tabellen ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  is_company        boolean NOT NULL DEFAULT false,
  parent_id         uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  -- Odoos fem adresstyper. 'contact' är parten själv; invoice/delivery är
  -- barnrader som ärver sin identitet via parent_id.
  type              text NOT NULL DEFAULT 'contact',

  email             text,
  phone             text,
  street            text,
  street2           text,
  city              text,
  postal_code       text,
  country_code      text,

  vat               text,   -- momsregistreringsnummer (companies.vat_number)
  company_registry  text,   -- organisationsnummer (companies.org_number)

  -- Heltal, inte booleaner: Odoo räknar upp dem vid försäljning respektive
  -- inköp. En part kan vara båda, och det händer oftare än man tror.
  customer_rank     integer NOT NULL DEFAULT 0,
  supplier_rank     integer NOT NULL DEFAULT 0,

  -- Migrationsproveniens och backfillens idempotensnyckel. Det är de här som
  -- gör att funktionen nedan kan köras om utan att skapa dubletter. De får
  -- försvinna först när de gamla tabellerna gör det.
  source_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  source_lead_id    uuid REFERENCES public.leads(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT partners_type_check
    CHECK (type IN ('contact', 'invoice', 'delivery', 'other', 'private')),
  CONSTRAINT partners_not_own_parent
    CHECK (parent_id IS NULL OR parent_id <> id)
);

COMMENT ON TABLE public.partners IS
  'Parter (Odoo res.partner): människor och organisationer i samma tabell. '
  'is_company skiljer dem, parent_id bär kontakt→bolag och koncern, type gör '
  'adresser till barnrader. Kund/leverantör är rank-heltal, inte två tabeller.';

CREATE UNIQUE INDEX IF NOT EXISTS partners_source_company_uniq
  ON public.partners (source_company_id) WHERE source_company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS partners_source_lead_uniq
  ON public.partners (source_lead_id) WHERE source_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS partners_parent_idx ON public.partners (parent_id);
CREATE INDEX IF NOT EXISTS partners_email_idx ON public.partners (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS partners_company_idx ON public.partners (is_company);

DROP TRIGGER IF EXISTS partners_set_updated_at ON public.partners;
CREATE TRIGGER partners_set_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Matrisen är enda ratten ─────────────────────────────────────────────────
-- Parten spänner över companies och crm: en säljare med crm-modulen måste
-- kunna se parten bakom sitt lead även utan companies. purchasing tillkommer
-- först när vendors viker in (steg 5) — tills dess vore det en övergrant.
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners readable by companies- or crm-module roles" ON public.partners;
CREATE POLICY "Partners readable by companies- or crm-module roles" ON public.partners
  FOR SELECT TO authenticated
  USING (can_access_module(auth.uid(), 'companies') OR can_access_module(auth.uid(), 'crm'));

DROP POLICY IF EXISTS "Partners insertable by companies- or crm-module roles" ON public.partners;
CREATE POLICY "Partners insertable by companies- or crm-module roles" ON public.partners
  FOR INSERT TO authenticated
  WITH CHECK (can_access_module(auth.uid(), 'companies') OR can_access_module(auth.uid(), 'crm'));

DROP POLICY IF EXISTS "Partners writable by companies- or crm-module roles" ON public.partners;
CREATE POLICY "Partners writable by companies- or crm-module roles" ON public.partners
  FOR UPDATE TO authenticated
  USING (can_access_module(auth.uid(), 'companies') OR can_access_module(auth.uid(), 'crm'))
  WITH CHECK (can_access_module(auth.uid(), 'companies') OR can_access_module(auth.uid(), 'crm'));

-- DELETE förblir admin, precis som för companies.
DROP POLICY IF EXISTS "Partners deletable by admins" ON public.partners;
CREATE POLICY "Partners deletable by admins" ON public.partners
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ── Backfillen ──────────────────────────────────────────────────────────────
-- Re-asserterbar och tyst vid omkörning: ON CONFLICT DO NOTHING mot
-- provenienskolumnerna. Den GISSAR ALDRIG — enda kopplingen mellan en person
-- och ett bolag är leads.company_id, som någon faktiskt satt. Namnlikhet är
-- inte identitet: "Redeye" och "Redeye AB" kan vara samma bolag eller två, och
-- det avgör en människa. Ett tomt fält går att rätta; ett påhittat samband
-- upptäcks aldrig.
--
-- Endast konverterade leads blir parter, precis som hos Odoo: ett lead som
-- ännu bara är pipeline har ingen part och ska inte ha någon. Antalet
-- överhoppade rapporteras som ett TAL — inte som en varning ingen läser.
CREATE OR REPLACE FUNCTION public.backfill_partners(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_companies_pending  int;
  v_leads_pending      int;
  v_leads_pipeline     int;
  v_parents_pending    int;
  v_companies_made     int := 0;
  v_leads_made         int := 0;
  v_parents_linked     int := 0;
  v_orphan_company     int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: backfilling partners requires the admin role';
  END IF;

  SELECT count(*) INTO v_companies_pending
  FROM companies c
  WHERE NOT EXISTS (SELECT 1 FROM partners p WHERE p.source_company_id = c.id);

  SELECT count(*) INTO v_leads_pending
  FROM leads l
  WHERE (l.status = 'customer' OR l.converted_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM partners p WHERE p.source_lead_id = l.id);

  SELECT count(*) INTO v_leads_pipeline
  FROM leads l
  WHERE NOT (l.status = 'customer' OR l.converted_at IS NOT NULL);

  -- Koncernlänkar som SAKNAS — inte de som går att sätta. Siffran ska bli noll
  -- när arbetet är gjort; ett tal som står kvar på 1 efter en lyckad körning är
  -- en tyst lögn om att något återstår.
  SELECT count(*) INTO v_parents_pending
  FROM companies c
  JOIN partners p ON p.source_company_id = c.id
  JOIN partners parent_p ON parent_p.source_company_id = c.parent_company_id
  WHERE c.parent_company_id IS NOT NULL
    AND p.parent_id IS DISTINCT FROM parent_p.id;

  -- Leads som pekar på ett bolag som inte finns. Rapporteras, lagas aldrig här.
  SELECT count(*) INTO v_orphan_company
  FROM leads l
  WHERE l.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = l.company_id);

  IF NOT p_dry_run THEN
    -- 1. Organisationer.
    WITH ins AS (
      INSERT INTO partners (
        name, is_company, type, phone, street, country_code,
        vat, company_registry, customer_rank, source_company_id
      )
      SELECT
        c.name, true, 'contact', c.phone,
        -- companies.address är en textklump; strukturering är ett eget steg och
        -- får inte gissas fram här.
        c.address, c.country,
        c.vat_number, c.org_number,
        CASE WHEN c.customer_since IS NOT NULL THEN 1 ELSE 0 END,
        c.id
      FROM companies c
      ON CONFLICT (source_company_id) WHERE source_company_id IS NOT NULL DO NOTHING
      RETURNING 1
    ) SELECT count(*) INTO v_companies_made FROM ins;

    -- 2. Koncern- och bolagslänkar, när båda parterna finns.
    WITH upd AS (
      UPDATE partners p SET parent_id = parent_p.id
      FROM companies c
      JOIN partners parent_p ON parent_p.source_company_id = c.parent_company_id
      WHERE p.source_company_id = c.id
        AND c.parent_company_id IS NOT NULL
        AND p.parent_id IS DISTINCT FROM parent_p.id
      RETURNING 1
    ) SELECT count(*) INTO v_parents_linked FROM upd;

    -- 3. Konverterade personer, hängda under sitt bolag när det finns.
    WITH ins AS (
      INSERT INTO partners (
        name, is_company, type, email, phone, parent_id, customer_rank, source_lead_id
      )
      SELECT
        coalesce(nullif(trim(l.name), ''), l.email), false, 'contact',
        l.email, l.phone,
        (SELECT p.id FROM partners p WHERE p.source_company_id = l.company_id),
        1, l.id
      FROM leads l
      WHERE (l.status = 'customer' OR l.converted_at IS NOT NULL)
        AND coalesce(nullif(trim(l.name), ''), l.email) IS NOT NULL
      ON CONFLICT (source_lead_id) WHERE source_lead_id IS NOT NULL DO NOTHING
      RETURNING 1
    ) SELECT count(*) INTO v_leads_made FROM ins;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'pending', jsonb_build_object(
      'companies', v_companies_pending,
      'converted_leads', v_leads_pending,
      'parent_links', v_parents_pending
    ),
    'written', jsonb_build_object(
      'companies', v_companies_made,
      'leads', v_leads_made,
      'parent_links', v_parents_linked
    ),
    'skipped', jsonb_build_object(
      'leads_still_pipeline', v_leads_pipeline,
      'leads_pointing_at_missing_company', v_orphan_company
    ),
    'partners_total', (SELECT count(*) FROM partners)
  );
END $$;

REVOKE ALL ON FUNCTION public.backfill_partners(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_partners(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.backfill_partners(boolean) IS
  'Fyller partners ur companies och konverterade leads. Idempotent, gissar '
  'aldrig: enda person→bolag-kopplingen är leads.company_id. Kör med '
  'p_dry_run => true först och läs "pending" innan du skriver.';
