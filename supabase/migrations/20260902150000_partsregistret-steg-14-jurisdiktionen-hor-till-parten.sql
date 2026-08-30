-- Kundryggraden, steg 14: jurisdiktionen hör till parten, reglerna till paketet.
--
-- Ordet "locale" dolde fyra olika saker hos oss. Tre fanns:
--   accounting_locale  vilken kontoplan och vilka momsrutor VI kör
--   platform_locale    hur VI visar tal och datum
--   partners.lang      vilket språk KUNDEN läser
-- Den fjärde fattades: hur den här kunden ska momsbeläggas.
--
-- Att sälja samma produkt till Uppsala, Hamburg och Oslo är tre olika
-- momsbehandlingar — svensk moms, omvänd skattskyldighet, export utan moms —
-- och skillnaden är ett faktum om KUNDEN, inte om produkten. I dag får varje
-- faktura samma moms oavsett vem som får den.
--
-- ÄGARFRÅGAN, som var den egentliga frågan: reglerna hör till paketet, valet
-- till parten. Vilka positioner som FINNS i en jurisdiktion är svensk lag och
-- bor därför i se-bas2024 bredvid kontoplanen och momssatserna —
-- paketkontraktet lovar redan "VAT rules" och säger att kärnan förblir
-- bokföringsneutral. Vilken av dem som GÄLLER för en viss motpart bor på
-- parten.
--
-- Motorn grenar aldrig på land. Den matchar parten mot rader som paketet
-- levererat — den känner inga landsregler av sina egna. Samma disciplin som
-- partner_ledger_role i steg 8: kontot bär sin roll, motorn känner inga
-- kontonummer.

CREATE TABLE IF NOT EXISTS public.fiscal_positions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale        text NOT NULL,
  position_id   text NOT NULL,
  label         text NOT NULL,
  note          text,
  country_codes text[] NOT NULL DEFAULT '{}',
  vat_required  boolean NOT NULL DEFAULT false,
  override_rate numeric,
  sequence      integer NOT NULL DEFAULT 100,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_positions_locale_position_key
  ON public.fiscal_positions (locale, position_id);
CREATE INDEX IF NOT EXISTS fiscal_positions_match_idx
  ON public.fiscal_positions (locale, sequence) WHERE active;

COMMENT ON TABLE public.fiscal_positions IS
  'Momsbehandlingar per jurisdiktion (Odoo account.fiscal.position). Levereras '
  'av locale-paketet — svensk lag hör till se-bas2024, inte till motorn. '
  'Parten bär vilken som gäller för den.';
COMMENT ON COLUMN public.fiscal_positions.country_codes IS
  '''*'' betyder "allt som inte matchats av en mer specifik position". '
  'sequence avgör ordningen — lägst först.';

DROP TRIGGER IF EXISTS fiscal_positions_set_updated_at ON public.fiscal_positions;
CREATE TRIGGER fiscal_positions_set_updated_at
  BEFORE UPDATE ON public.fiscal_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fiscal_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Fiscal positions readable by authenticated" ON public.fiscal_positions;
CREATE POLICY "Fiscal positions readable by authenticated" ON public.fiscal_positions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Fiscal positions writable by accounting" ON public.fiscal_positions;
CREATE POLICY "Fiscal positions writable by accounting" ON public.fiscal_positions
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'accounting'))
  WITH CHECK (can_access_module(auth.uid(), 'accounting'));
REVOKE ALL ON public.fiscal_positions FROM anon;

-- ── Valet bor på parten ────────────────────────────────────────────────────
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS fiscal_position_id uuid REFERENCES public.fiscal_positions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.partners.fiscal_position_id IS
  'Momsbehandlingen för den här motparten. NULL = inte vald; då föreslår '
  'partner_fiscal_position() en utifrån land och momsnummer, men SÄTTER den '
  'aldrig — ett skattebeslut fattas av en människa.';

-- ── Förslaget, aldrig gissningen ───────────────────────────────────────────
-- Odoo automatchar via land och vat_required. Vi gör samma matchning men
-- SKRIVER INTE resultatet: en momsbehandling som satts av ett system utan att
-- någon sagt ja är fel på ett sätt som upptäcks först vid en revision.
-- Funktionen föreslår, motiverar, och lämnar beslutet.
CREATE OR REPLACE FUNCTION public.partner_fiscal_position(
  p_partner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p      partners%ROWTYPE;
  v_locale text;
  v_chosen fiscal_positions%ROWTYPE;
  v_match  fiscal_positions%ROWTYPE;
  v_have   int;
BEGIN
  SELECT * INTO v_p FROM partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no such partner');
  END IF;

  -- Valet slår alltid förslaget.
  IF v_p.fiscal_position_id IS NOT NULL THEN
    SELECT * INTO v_chosen FROM fiscal_positions WHERE id = v_p.fiscal_position_id;
    RETURN jsonb_build_object(
      'ok', true, 'chosen', true,
      'position', v_chosen.position_id, 'label', v_chosen.label,
      'override_rate', v_chosen.override_rate, 'note', v_chosen.note,
      'source', 'set on the partner');
  END IF;

  SELECT coalesce(value ->> 'pack', value #>> '{}') INTO v_locale
    FROM site_settings WHERE key = 'accounting_locale';
  SELECT count(*) INTO v_have FROM fiscal_positions
   WHERE active AND (v_locale IS NULL OR locale = v_locale);

  IF v_have = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'chosen', false,
      'reason', 'this instance has no fiscal positions — the accounting pack has not been topped up, '
             || 'so no tax treatment can be proposed. An empty answer here means unconfigured, not "no VAT".');
  END IF;

  -- Mest specifikt först. En position som kräver momsnummer föreslås bara när
  -- parten faktiskt har ett — annars vore omvänd skattskyldighet en gissning.
  SELECT * INTO v_match FROM fiscal_positions fp
   WHERE fp.active
     AND (v_locale IS NULL OR fp.locale = v_locale)
     AND (fp.country_codes @> ARRAY[upper(coalesce(v_p.country_code, ''))]
          OR fp.country_codes @> ARRAY['*'])
     AND (NOT fp.vat_required OR coalesce(trim(v_p.vat), '') <> '')
   ORDER BY (fp.country_codes @> ARRAY['*']) ASC, fp.sequence ASC
   LIMIT 1;

  IF v_match.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'chosen', false,
      'reason', 'no position matches this partner''s country and VAT status');
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'chosen', false,
    'position', v_match.position_id, 'label', v_match.label,
    'override_rate', v_match.override_rate, 'note', v_match.note,
    'source', 'proposed from the partner''s country and VAT number — nothing has been written',
    'matched_on', jsonb_build_object(
      'country', coalesce(v_p.country_code, '(none on file)'),
      'has_vat_number', coalesce(trim(v_p.vat), '') <> ''),
    'how_to_accept', 'set partners.fiscal_position_id — a tax treatment is a decision, not an inference');
END $$;

REVOKE ALL ON FUNCTION public.partner_fiscal_position(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_fiscal_position(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.partner_fiscal_position(uuid) IS
  'Momsbehandlingen för en part: den valda, annars ett FÖRSLAG utifrån land och '
  'momsnummer. Skriver aldrig — ett skattebeslut fattas av en människa.';
