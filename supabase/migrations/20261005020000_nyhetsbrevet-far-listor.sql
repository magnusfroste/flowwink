-- Nyhetsbrevet får listor.
--
-- Ett utskick gick alltid till ALLA bekräftade prenumeranter — det fanns en
-- enda lista och ingen segmentering någonstans (Odoo-paritet
-- newsletter#lists_segments: partial, "no segment skill, table, or UI").
-- Odoos e-postmarknadsföring bygger på mailinglistor: en kontakt står på
-- flera, och ett utskick riktas till en eller flera.
--
-- Samma form här, utan ny tabell att hålla i takt:
--   newsletter_subscribers.lists text[]  — listorna en prenumerant står på
--   newsletters.audience_lists   text[]  — tom = alla bekräftade (som förut);
--                                          annars de bekräftade som står på
--                                          MINST en av listorna (&&)
-- Ett tomt audience_lists är alltså exakt dagens beteende: inget befintligt
-- utskick eller schemalagt brev byter publik av den här migrationen.

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS lists text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS audience_lists text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_lists
  ON public.newsletter_subscribers USING gin (lists);

-- Listnamn normaliseras vid skrivning: trimmade, gemener, utan dubletter och
-- tomma strängar. "Kunder", " kunder" och "KUNDER" är samma lista — annars
-- delas publiken i tre utan att någon märker det.
CREATE OR REPLACE FUNCTION public.normalize_newsletter_lists(p_lists text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT l ORDER BY l), '{}')
  FROM (SELECT lower(btrim(x)) AS l FROM unnest(COALESCE(p_lists, '{}')) AS x) s
  WHERE l <> '';
$$;

CREATE OR REPLACE FUNCTION public.trg_normalize_newsletter_lists()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'newsletter_subscribers' THEN
    NEW.lists := public.normalize_newsletter_lists(NEW.lists);
  ELSE
    NEW.audience_lists := public.normalize_newsletter_lists(NEW.audience_lists);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_newsletter_subscribers_lists ON public.newsletter_subscribers;
CREATE TRIGGER trg_newsletter_subscribers_lists
  BEFORE INSERT OR UPDATE OF lists ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_newsletter_lists();

DROP TRIGGER IF EXISTS trg_newsletters_audience_lists ON public.newsletters;
CREATE TRIGGER trg_newsletters_audience_lists
  BEFORE INSERT OR UPDATE OF audience_lists ON public.newsletters
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_newsletter_lists();

-- Listorna med antal, för admin-UI:t och skillen. Bekräftade räknas separat:
-- det är dem ett utskick når.
CREATE OR REPLACE FUNCTION public.newsletter_list_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('list', l, 'subscribers', n, 'confirmed', c) ORDER BY l), '[]'::jsonb)
  FROM (
    SELECT l, count(*) AS n, count(*) FILTER (WHERE s.status = 'confirmed') AS c
    FROM public.newsletter_subscribers s, unnest(s.lists) AS l
    GROUP BY l
  ) x;
$$;
REVOKE ALL ON FUNCTION public.newsletter_list_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.newsletter_list_summary() TO authenticated, service_role;
