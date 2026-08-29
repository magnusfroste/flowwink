-- Kundryggraden, steg 2: leads delas i part och pipeline.
--
-- Vår `leads` är i dag två av Odoos modeller hopslagna till en: identiteten
-- (namn, e-post, telefon, bolag) hör till res.partner, medan status, score,
-- stage_id och lost_reason hör till crm.lead. Odoo håller dem åtskilda och
-- låter crm.lead ha en NULLBAR partner_id — ett lead behöver ingen part förrän
-- någon bestämmer att det är en riktig motpart.
--
-- Det här steget lägger till just den länken. Det gör INTE en kolumnrenaming:
-- `name` och `email` spelar redan exakt den roll Odoos `contact_name` och
-- `email_from` spelar, och att döpa om dem skulle röra femton tabeller, hooks,
-- skills och UI för en stavning. Formen kopieras, inte stavningen.
--
-- En sak som INTE överlastas: `converted_at` betyder hos oss "blev kund" (så
-- står det i demoseeden, och gallringen läser den så). Att skapa en part är en
-- annan händelse än att bli kund — hos Odoo skapas parten redan vid
-- konvertering till opportunity. Markören för "har en part" är därför
-- `leads.partner_id IS NOT NULL`, och när den skapades står på parten själv.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_partner_idx ON public.leads (partner_id) WHERE partner_id IS NOT NULL;

COMMENT ON COLUMN public.leads.partner_id IS
  'Parten bakom leadet (Odoo crm.lead.partner_id). NULL är ett giltigt och '
  'vanligt tillstånd: ett lead som ännu bara är pipeline har ingen part.';

-- ── Konverteringen ──────────────────────────────────────────────────────────
-- Ett uttryckligt operatörsbeslut, precis som Odoos "convert to opportunity":
-- någon säger att det här är en riktig motpart, och då föds parten. Funktionen
-- är idempotent — anropas den igen returnerar den samma part och skriver inget.
--
-- Den gissar aldrig ett namn. Saknar leadet både namn och e-post får det ingen
-- part, för en part utan identitet är värre än ingen part alls: den går inte
-- att känna igen och kommer att dubbleras nästa gång.
CREATE OR REPLACE FUNCTION public.ensure_lead_partner(
  p_lead_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead        leads%ROWTYPE;
  v_name        text;
  v_parent_id   uuid;
  v_partner_id  uuid;
  v_created     boolean := false;
  v_parent_made boolean := false;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR can_access_module(auth.uid(), 'crm')
          OR can_access_module(auth.uid(), 'companies')) THEN
    RAISE EXCEPTION 'Forbidden: creating a partner from a lead requires the crm or companies module (Users → Role Permissions)';
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % not found', p_lead_id;
  END IF;

  -- Redan gjort? Returnera samma svar. Två anrop får aldrig ge två parter.
  IF v_lead.partner_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'partner_id', v_lead.partner_id, 'created', false,
      'note', 'the lead already has a partner'
    );
  END IF;

  -- En part kan finnas från backfillen utan att länken hunnit sättas.
  SELECT id INTO v_partner_id FROM partners WHERE source_lead_id = p_lead_id;

  IF v_partner_id IS NULL THEN
    -- leads.email är NOT NULL, så det degenererade fallet är inte NULL utan
    -- TOMT: en rad med name='   ' och email='' hade annars fött en part med
    -- namnet '' — en identitetslös part som dubbleras vid nästa anrop.
    -- (Hittat av databasen, inte av läsningen, 2026-08-31.)
    v_name := coalesce(nullif(trim(v_lead.name), ''), nullif(trim(v_lead.email), ''));
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Lead % has neither a name nor an email — a partner without an identity would be duplicated on the next call', p_lead_id;
    END IF;

    -- Bolaget först: personen ska landa under sin organisation, inte lös.
    IF v_lead.company_id IS NOT NULL THEN
      SELECT id INTO v_parent_id FROM partners WHERE source_company_id = v_lead.company_id;
      IF v_parent_id IS NULL THEN
        INSERT INTO partners (name, is_company, type, phone, street, country_code,
                              vat, company_registry, source_company_id)
        SELECT c.name, true, 'contact', c.phone, c.address, c.country,
               c.vat_number, c.org_number, c.id
        FROM companies c WHERE c.id = v_lead.company_id
        RETURNING id INTO v_parent_id;
        v_parent_made := v_parent_id IS NOT NULL;
      END IF;
    END IF;

    INSERT INTO partners (name, is_company, type, email, phone, parent_id,
                          customer_rank, source_lead_id)
    VALUES (
      v_name, false, 'contact', v_lead.email, v_lead.phone, v_parent_id,
      CASE WHEN v_lead.status = 'customer' OR v_lead.converted_at IS NOT NULL THEN 1 ELSE 0 END,
      p_lead_id
    )
    RETURNING id INTO v_partner_id;
    v_created := true;
  END IF;

  UPDATE leads SET partner_id = v_partner_id, updated_at = now() WHERE id = p_lead_id;

  RETURN jsonb_build_object(
    'partner_id', v_partner_id,
    'created', v_created,
    'parent_partner_id', v_parent_id,
    'parent_created', v_parent_made,
    'name', coalesce(v_name, (SELECT name FROM partners WHERE id = v_partner_id))
  );
END $$;

REVOKE ALL ON FUNCTION public.ensure_lead_partner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_lead_partner(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_lead_partner(uuid) IS
  'Skapar (eller återanvänder) parten bakom ett lead och sätter leads.partner_id. '
  'Idempotent. Bolaget skapas först så personen landar under sin organisation. '
  'Vägrar om leadet saknar både namn och e-post.';

-- ── Backfillen sluter slingan ───────────────────────────────────────────────
-- Steg 1 skapade parter ur konverterade leads men lämnade leads.partner_id
-- tom, för kolumnen fanns inte då. Här länkas de, och räkningen får samma
-- ärlighetskrav som resten: "pending" ska bli noll när arbetet är gjort.
CREATE OR REPLACE FUNCTION public.backfill_partners(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_companies_pending  int;
  v_leads_pending      int;
  v_leads_pipeline     int;
  v_parents_pending    int;
  v_links_pending      int;
  v_companies_made     int := 0;
  v_leads_made         int := 0;
  v_parents_linked     int := 0;
  v_links_made         int := 0;
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

  -- Leads vars part finns men vars länk inte är satt (steg 1 kunde inte).
  SELECT count(*) INTO v_links_pending
  FROM leads l JOIN partners p ON p.source_lead_id = l.id
  WHERE l.partner_id IS DISTINCT FROM p.id;

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
        coalesce(nullif(trim(l.name), ''), nullif(trim(l.email), '')), false, 'contact',
        l.email, l.phone,
        (SELECT p.id FROM partners p WHERE p.source_company_id = l.company_id),
        1, l.id
      FROM leads l
      WHERE (l.status = 'customer' OR l.converted_at IS NOT NULL)
        AND coalesce(nullif(trim(l.name), ''), nullif(trim(l.email), '')) IS NOT NULL
      ON CONFLICT (source_lead_id) WHERE source_lead_id IS NOT NULL DO NOTHING
      RETURNING 1
    ) SELECT count(*) INTO v_leads_made FROM ins;

    -- 4. Slut slingan: leadet pekar tillbaka på sin part.
    WITH upd AS (
      UPDATE leads l SET partner_id = p.id
      FROM partners p
      WHERE p.source_lead_id = l.id AND l.partner_id IS DISTINCT FROM p.id
      RETURNING 1
    ) SELECT count(*) INTO v_links_made FROM upd;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'pending', jsonb_build_object(
      'companies', v_companies_pending,
      'converted_leads', v_leads_pending,
      'parent_links', v_parents_pending,
      'lead_links', v_links_pending
    ),
    'written', jsonb_build_object(
      'companies', v_companies_made,
      'leads', v_leads_made,
      'parent_links', v_parents_linked,
      'lead_links', v_links_made
    ),
    'skipped', jsonb_build_object(
      'leads_still_pipeline', v_leads_pipeline,
      'leads_pointing_at_missing_company', v_orphan_company
    ),
    'partners_total', (SELECT count(*) FROM partners)
  );
END $$;
