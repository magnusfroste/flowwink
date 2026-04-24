-- ============================================================
-- Phase 1.2: Tax Engine (tax codes + grids)
-- Odoo-style generic tax primitive — replaces hardcoded VAT
-- ============================================================

-- 1. Tax codes
CREATE TABLE IF NOT EXISTS public.tax_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  locale TEXT NOT NULL DEFAULT 'SE',
  tax_type TEXT NOT NULL DEFAULT 'sale' CHECK (tax_type IN ('sale','purchase','none')),
  computation TEXT NOT NULL DEFAULT 'percent' CHECK (computation IN ('percent','fixed','group','none')),
  rate_pct NUMERIC(7,4) NOT NULL DEFAULT 0,
  -- Account codes (BAS) used when posting tax
  output_account_code TEXT,    -- e.g. 2611 (utgående moms 25)
  input_account_code TEXT,     -- e.g. 2641 (ingående moms 25)
  -- Behaviour flags
  price_include BOOLEAN NOT NULL DEFAULT false,
  is_reverse_charge BOOLEAN NOT NULL DEFAULT false,
  is_eu BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sequence INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_codes_locale ON public.tax_codes(locale);
CREATE INDEX IF NOT EXISTS idx_tax_codes_active ON public.tax_codes(is_active);

-- 2. Tax grids (cells in the VAT return)
CREATE TABLE IF NOT EXISTS public.tax_grids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,    -- e.g. "SE-05", "SE-10"
  name TEXT NOT NULL,           -- "Momspliktig försäljning 25%"
  description TEXT,
  locale TEXT NOT NULL DEFAULT 'SE',
  category TEXT NOT NULL DEFAULT 'output' CHECK (category IN ('output','input','base','adjustment','info')),
  sequence INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Mapping: tax_code → grids (each code can hit several grids)
CREATE TABLE IF NOT EXISTS public.tax_code_grids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tax_code_id UUID NOT NULL REFERENCES public.tax_codes(id) ON DELETE CASCADE,
  tax_grid_id UUID NOT NULL REFERENCES public.tax_grids(id) ON DELETE CASCADE,
  applies_to TEXT NOT NULL DEFAULT 'tax' CHECK (applies_to IN ('base','tax')),
  sign SMALLINT NOT NULL DEFAULT 1 CHECK (sign IN (-1, 1)),
  UNIQUE (tax_code_id, tax_grid_id, applies_to)
);

-- 4. Tax on journal entry lines
ALTER TABLE public.journal_entry_lines
  ADD COLUMN IF NOT EXISTS tax_code_id UUID REFERENCES public.tax_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_base_cents BIGINT,
  ADD COLUMN IF NOT EXISTS tax_amount_cents BIGINT;

CREATE INDEX IF NOT EXISTS idx_jel_tax_code ON public.journal_entry_lines(tax_code_id);

-- 5. Per-line tax detail (for reporting per grid)
CREATE TABLE IF NOT EXISTS public.journal_entry_line_taxes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_line_id UUID NOT NULL REFERENCES public.journal_entry_lines(id) ON DELETE CASCADE,
  tax_code_id UUID NOT NULL REFERENCES public.tax_codes(id),
  tax_grid_id UUID NOT NULL REFERENCES public.tax_grids(id),
  amount_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jelt_line ON public.journal_entry_line_taxes(journal_entry_line_id);
CREATE INDEX IF NOT EXISTS idx_jelt_grid ON public.journal_entry_line_taxes(tax_grid_id);
CREATE INDEX IF NOT EXISTS idx_jelt_code ON public.journal_entry_line_taxes(tax_code_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.tax_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_grids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_code_grids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_line_taxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_codes_read_all_auth" ON public.tax_codes;
CREATE POLICY "tax_codes_read_all_auth" ON public.tax_codes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tax_codes_admin_write" ON public.tax_codes;
CREATE POLICY "tax_codes_admin_write" ON public.tax_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "tax_grids_read_all_auth" ON public.tax_grids;
CREATE POLICY "tax_grids_read_all_auth" ON public.tax_grids
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tax_grids_admin_write" ON public.tax_grids;
CREATE POLICY "tax_grids_admin_write" ON public.tax_grids
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "tax_code_grids_read_all_auth" ON public.tax_code_grids;
CREATE POLICY "tax_code_grids_read_all_auth" ON public.tax_code_grids
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tax_code_grids_admin_write" ON public.tax_code_grids;
CREATE POLICY "tax_code_grids_admin_write" ON public.tax_code_grids
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "jelt_read_auth" ON public.journal_entry_line_taxes;
CREATE POLICY "jelt_read_auth" ON public.journal_entry_line_taxes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "jelt_admin_write" ON public.journal_entry_line_taxes;
CREATE POLICY "jelt_admin_write" ON public.journal_entry_line_taxes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- updated_at trigger for tax_codes
DROP TRIGGER IF EXISTS trg_tax_codes_updated_at ON public.tax_codes;
CREATE TRIGGER trg_tax_codes_updated_at
  BEFORE UPDATE ON public.tax_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- Seed: Swedish VAT grids (Skatteverket momsdeklaration)
-- ============================================================
INSERT INTO public.tax_grids (code, name, category, sequence, locale) VALUES
  ('SE-05','Momspliktig försäljning som inte ingår i ruta 06,07,08','base',5,'SE'),
  ('SE-06','Momspliktig egen användning som inte ingår i ruta 08','base',6,'SE'),
  ('SE-07','Beskattningsunderlag vid vinstmarginalbeskattning','base',7,'SE'),
  ('SE-08','Hyresinkomster vid frivillig skattskyldighet','base',8,'SE'),
  ('SE-10','Utgående moms 25 %','output',10,'SE'),
  ('SE-11','Utgående moms 12 %','output',11,'SE'),
  ('SE-12','Utgående moms 6 %','output',12,'SE'),
  ('SE-20','Inköp av varor från annat EU-land','base',20,'SE'),
  ('SE-21','Inköp av tjänster från annat EU-land enligt huvudregeln','base',21,'SE'),
  ('SE-22','Inköp av tjänster från land utanför EU','base',22,'SE'),
  ('SE-23','Inköp av varor i Sverige som köparen är skattskyldig för','base',23,'SE'),
  ('SE-24','Övriga inköp av tjänster i Sverige som köparen är skattskyldig för','base',24,'SE'),
  ('SE-30','Utgående moms 25 % på förvärv (omvänd)','output',30,'SE'),
  ('SE-31','Utgående moms 12 % på förvärv (omvänd)','output',31,'SE'),
  ('SE-32','Utgående moms 6 % på förvärv (omvänd)','output',32,'SE'),
  ('SE-35','Försäljning av varor till annat EU-land','base',35,'SE'),
  ('SE-36','Försäljning av varor utanför EU','base',36,'SE'),
  ('SE-37','Mellanmans inköp vid trepartshandel','base',37,'SE'),
  ('SE-38','Mellanmans försäljning vid trepartshandel','base',38,'SE'),
  ('SE-39','Försäljning av tjänster i annat EU-land enligt huvudregeln','base',39,'SE'),
  ('SE-40','Övrig försäljning av tjänster omsatta utomlands','base',40,'SE'),
  ('SE-41','Försäljning där köparen är skattskyldig i Sverige','base',41,'SE'),
  ('SE-42','Övrig försäljning m.m.','base',42,'SE'),
  ('SE-48','Ingående moms att dra av','input',48,'SE'),
  ('SE-49','Moms att betala eller få tillbaka','adjustment',49,'SE')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- Seed: Swedish standard tax codes
-- ============================================================
INSERT INTO public.tax_codes (code, name, locale, tax_type, rate_pct, output_account_code, input_account_code, sequence)
VALUES
  ('SE25','Moms 25%','SE','sale',25,'2611',NULL,10),
  ('SE12','Moms 12%','SE','sale',12,'2621',NULL,11),
  ('SE6','Moms 6%','SE','sale',6,'2631',NULL,12),
  ('SE0','Moms 0% / Momsfri','SE','sale',0,NULL,NULL,13),
  ('PSE25','Ingående moms 25%','SE','purchase',25,NULL,'2641',20),
  ('PSE12','Ingående moms 12%','SE','purchase',12,NULL,'2642',21),
  ('PSE6','Ingående moms 6%','SE','purchase',6,NULL,'2643',22),
  ('EU25-G','EU varuförsäljning 0% (VOEC)','SE','sale',0,NULL,NULL,30),
  ('EU0-S','EU tjänsteförsäljning 0% (huvudregeln)','SE','sale',0,NULL,NULL,31),
  ('RC25-VARA','Omvänd skattskyldighet inköp vara EU 25%','SE','purchase',25,'2615','2645',40),
  ('RC25-TJ','Omvänd skattskyldighet inköp tjänst EU 25%','SE','purchase',25,'2614','2645',41)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  rate_pct = EXCLUDED.rate_pct,
  output_account_code = EXCLUDED.output_account_code,
  input_account_code = EXCLUDED.input_account_code,
  updated_at = now();

UPDATE public.tax_codes SET is_reverse_charge = true WHERE code LIKE 'RC%';
UPDATE public.tax_codes SET is_eu = true WHERE code LIKE 'EU%' OR code LIKE 'RC%';

-- ============================================================
-- Seed: tax_code → grid mappings
-- ============================================================
DO $$
DECLARE
  v_code RECORD;
  v_grid RECORD;
BEGIN
  -- SE25 sale: base→05, tax→10
  FOR v_code IN SELECT id, code FROM public.tax_codes WHERE code IN ('SE25','SE12','SE6','SE0','PSE25','PSE12','PSE6','EU25-G','EU0-S','RC25-VARA','RC25-TJ') LOOP
    IF v_code.code = 'SE25' THEN
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'base', 1 FROM public.tax_grids WHERE code = 'SE-05'
      ON CONFLICT DO NOTHING;
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'tax', 1 FROM public.tax_grids WHERE code = 'SE-10'
      ON CONFLICT DO NOTHING;
    ELSIF v_code.code = 'SE12' THEN
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'base', 1 FROM public.tax_grids WHERE code = 'SE-05'
      ON CONFLICT DO NOTHING;
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'tax', 1 FROM public.tax_grids WHERE code = 'SE-11'
      ON CONFLICT DO NOTHING;
    ELSIF v_code.code = 'SE6' THEN
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'base', 1 FROM public.tax_grids WHERE code = 'SE-05'
      ON CONFLICT DO NOTHING;
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'tax', 1 FROM public.tax_grids WHERE code = 'SE-12'
      ON CONFLICT DO NOTHING;
    ELSIF v_code.code IN ('PSE25','PSE12','PSE6') THEN
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'tax', 1 FROM public.tax_grids WHERE code = 'SE-48'
      ON CONFLICT DO NOTHING;
    ELSIF v_code.code = 'EU25-G' THEN
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'base', 1 FROM public.tax_grids WHERE code = 'SE-35'
      ON CONFLICT DO NOTHING;
    ELSIF v_code.code = 'EU0-S' THEN
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'base', 1 FROM public.tax_grids WHERE code = 'SE-39'
      ON CONFLICT DO NOTHING;
    ELSIF v_code.code = 'RC25-VARA' THEN
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'base', 1 FROM public.tax_grids WHERE code = 'SE-20'
      ON CONFLICT DO NOTHING;
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'tax', 1 FROM public.tax_grids WHERE code = 'SE-30'
      ON CONFLICT DO NOTHING;
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'tax', 1 FROM public.tax_grids WHERE code = 'SE-48'
      ON CONFLICT DO NOTHING;
    ELSIF v_code.code = 'RC25-TJ' THEN
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'base', 1 FROM public.tax_grids WHERE code = 'SE-21'
      ON CONFLICT DO NOTHING;
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'tax', 1 FROM public.tax_grids WHERE code = 'SE-30'
      ON CONFLICT DO NOTHING;
      INSERT INTO public.tax_code_grids (tax_code_id, tax_grid_id, applies_to, sign)
      SELECT v_code.id, id, 'tax', 1 FROM public.tax_grids WHERE code = 'SE-48'
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- VAT report function
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_vat_report(
  p_year INTEGER,
  p_start_month INTEGER,
  p_end_month INTEGER DEFAULT NULL
)
RETURNS TABLE (
  grid_code TEXT,
  grid_name TEXT,
  category TEXT,
  amount_cents BIGINT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH period AS (
    SELECT make_date(p_year, p_start_month, 1) AS start_date,
           (make_date(p_year, COALESCE(p_end_month, p_start_month), 1)
              + INTERVAL '1 month' - INTERVAL '1 day')::date AS end_date
  )
  SELECT
    g.code,
    g.name,
    g.category,
    COALESCE(SUM(jelt.amount_cents), 0)::BIGINT
  FROM public.tax_grids g
  LEFT JOIN public.journal_entry_line_taxes jelt ON jelt.tax_grid_id = g.id
  LEFT JOIN public.journal_entry_lines jel ON jel.id = jelt.journal_entry_line_id
  LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  CROSS JOIN period
  WHERE g.locale = 'SE'
    AND g.is_active = true
    AND (je.id IS NULL OR (
      je.status = 'posted'
      AND je.entry_date BETWEEN period.start_date AND period.end_date
    ))
  GROUP BY g.code, g.name, g.category, g.sequence
  ORDER BY g.sequence;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_vat_report(INTEGER, INTEGER, INTEGER) TO authenticated;