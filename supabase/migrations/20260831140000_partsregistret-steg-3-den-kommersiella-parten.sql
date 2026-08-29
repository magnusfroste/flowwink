-- Kundryggraden, steg 3: den kommersiella parten — och två rättelser till steg 1.
--
-- Research mot Odoo 18:s källkod (odoo/addons/base/models/res_partner.py) hittade
-- ett hål i min egen design och ett fel i min avskrift.
--
-- HÅLET: commercial_partner_id. Jag hade den inte alls. Odoo räknar den så här:
--
--     if partner.is_company or not partner.parent_id:
--         partner.commercial_partner_id = partner
--     else:
--         partner.commercial_partner_id = partner.parent_id.commercial_partner_id
--
-- Alltså NÄRMASTE förfader som är bolag — inte den översta. I kedjan
-- Holding → Dotterbolag → Jane är Janes kommersiella part Dotterbolaget, för
-- det är den juridiska personen som fakturan ställs till. Det är hela poängen:
-- legal fakturamottagare, inte koncerntillhörighet.
--
-- Varför det MÅSTE finnas: hos Odoo skrivs varje verifikationsrad om till
-- move.commercial_partner_id vid bokföring, och kundreskontran, kreditgränsen,
-- DSO-beräkningen och dubblettkontrollen grupperar alla på den. Utan den
-- ackumulerar varje kontaktperson en EGEN fordringssaldo, och frågan "vad är
-- vi skyldiga av det här bolaget?" har inget svar. Dokumentet kan adresseras
-- till en person; huvudboken bokförs alltid på den kommersiella parten.
--
-- FELET: jag skrev av `type` från Odoo 14 och fick med 'private'. Det värdet
-- togs bort i 17.0. Modern Odoo (17, 18, 19) har fyra: contact, invoice,
-- delivery, other. Ingen rad använder 'private' hos oss, så rättelsen är gratis
-- — men bara i dag. Källa: odoo/addons/base/models/res_partner.py, 18.0.

-- ── Rättelse 1: fyra adresstyper, inte fem ──────────────────────────────────
DO $$
DECLARE v_private int;
BEGIN
  SELECT count(*) INTO v_private FROM public.partners WHERE type = 'private';
  IF v_private > 0 THEN
    -- Fail closed: hellre en migration som vägrar än rader som tyst blir fel.
    RAISE EXCEPTION 'Cannot narrow the address types: % partner(s) still use the removed type ''private''', v_private;
  END IF;
END $$;

-- I DO-block enligt husregeln: en avbruten provisionering som återupptas kör
-- filen igen, och ett naket ADD CONSTRAINT smäller då på "already exists" och
-- kilar instansen permanent (nordbrygg, 2026-08-22).
DO $$
BEGIN
  ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_type_check;
  ALTER TABLE public.partners ADD CONSTRAINT partners_type_check
    CHECK (type IN ('contact', 'invoice', 'delivery', 'other'));
END $$;

-- ── Ingen part får vara sin egen förfader ───────────────────────────────────
-- Odoos _check_recursion. Utan den kan commercial_partner_id-beräkningen loopa
-- i evighet, och en cykel i parent_id är ändå aldrig meningsfull.
CREATE OR REPLACE FUNCTION public.partners_reject_cycle()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_cursor uuid; v_depth int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  v_cursor := NEW.parent_id;
  WHILE v_cursor IS NOT NULL LOOP
    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'Partner % cannot be its own ancestor', NEW.id;
    END IF;
    v_depth := v_depth + 1;
    IF v_depth > 64 THEN
      RAISE EXCEPTION 'Partner hierarchy deeper than 64 levels — refusing to walk further';
    END IF;
    SELECT parent_id INTO v_cursor FROM public.partners WHERE id = v_cursor;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partners_no_cycle ON public.partners;
CREATE TRIGGER partners_no_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.partners_reject_cycle();

-- ── Den kommersiella parten ─────────────────────────────────────────────────
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS commercial_partner_id uuid REFERENCES public.partners(id);

COMMENT ON COLUMN public.partners.commercial_partner_id IS
  'Den juridiska personen fakturan ställs till (Odoo commercial_partner_id): '
  'närmaste förfader som är bolag, annars parten själv. Fordringar, kreditgräns '
  'och dubblettkontroll grupperar på DEN — inte på kontaktpersonen.';

CREATE OR REPLACE FUNCTION public.partners_set_commercial()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_company OR NEW.parent_id IS NULL THEN
    NEW.commercial_partner_id := NEW.id;
  ELSE
    SELECT commercial_partner_id INTO NEW.commercial_partner_id
    FROM public.partners WHERE id = NEW.parent_id;
    -- Föräldern kan sakna sin egen beräkning under en backfill; fall då tillbaka
    -- på föräldern själv i stället för att lämna NULL.
    IF NEW.commercial_partner_id IS NULL THEN
      NEW.commercial_partner_id := NEW.parent_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partners_commercial_before ON public.partners;
CREATE TRIGGER partners_commercial_before
  BEFORE INSERT OR UPDATE OF parent_id, is_company ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.partners_set_commercial();

-- Flyttas en part i hierarkin måste HELA subträdet räknas om — inte bara raden
-- själv. Odoos compute är recursive=True av precis det skälet.
CREATE OR REPLACE FUNCTION public.partners_cascade_commercial()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  WITH RECURSIVE subtree AS (
    SELECT id, commercial_partner_id FROM public.partners WHERE id = NEW.id
    UNION ALL
    SELECT c.id,
           CASE WHEN c.is_company THEN c.id ELSE s.commercial_partner_id END
    FROM public.partners c JOIN subtree s ON c.parent_id = s.id
  )
  UPDATE public.partners p
     SET commercial_partner_id = s.commercial_partner_id
    FROM subtree s
   WHERE p.id = s.id
     AND p.id <> NEW.id
     AND p.commercial_partner_id IS DISTINCT FROM s.commercial_partner_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS partners_commercial_cascade ON public.partners;
CREATE TRIGGER partners_commercial_cascade
  AFTER UPDATE OF parent_id, is_company ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.partners_cascade_commercial();

-- ── Backfill av befintliga rader ────────────────────────────────────────────
-- Uppifrån och ned: en förälders värde måste vara satt innan barnet läser det.
WITH RECURSIVE tree AS (
  SELECT id, id AS commercial FROM public.partners WHERE parent_id IS NULL OR is_company
  UNION ALL
  SELECT c.id, CASE WHEN c.is_company THEN c.id ELSE t.commercial END
  FROM public.partners c JOIN tree t ON c.parent_id = t.id
  WHERE NOT c.is_company
)
UPDATE public.partners p SET commercial_partner_id = t.commercial
FROM tree t WHERE p.id = t.id AND p.commercial_partner_id IS DISTINCT FROM t.commercial;

-- Föräldralösa rester (skulle inte finnas, men NULL här vore tyst fel).
UPDATE public.partners SET commercial_partner_id = id WHERE commercial_partner_id IS NULL;

ALTER TABLE public.partners ALTER COLUMN commercial_partner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS partners_commercial_idx ON public.partners (commercial_partner_id);
