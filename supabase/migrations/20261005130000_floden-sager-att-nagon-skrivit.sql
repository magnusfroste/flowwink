-- Flödet säger att någon skrivit.
--
-- En inloggad användare såg inte att någon postat i River: sidopanelens
-- badges täcker godkännanden, ärenden, leads, affärer, rekrytering, utlägg och
-- FlowPilot, och klockan visar det som kräver handling. River har inget av det.
-- Så minsta möjliga: en läsmarkering per användare och en räknare på nya inlägg
-- sedan den — ingen notistabell, inga omnämnanden, inget nytt att förstå.
--
--   1. river_read_marks: när användaren senast såg flödet (en rad per person,
--      bara ens egen läs- och skrivbar).
--   2. river_unread_count(): antal inlägg och svar av ANDRA sedan markeringen.
--      Utan markering räknas den senaste veckan — en ny kollega ska se att det
--      lever, inte hela historiken som "oläst".
--   3. river_mark_seen(): sätts när River-sidan visas. Räknaren noll.

CREATE TABLE IF NOT EXISTS public.river_read_marks (
  user_id uuid PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.river_read_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users keep their own river read mark" ON public.river_read_marks;
CREATE POLICY "Users keep their own river read mark" ON public.river_read_marks
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.river_unread_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN 0 ELSE (
    SELECT count(*)::integer
      FROM river_posts p
     WHERE p.author_id <> auth.uid()
       AND p.created_at > COALESCE((SELECT m.last_seen_at FROM river_read_marks m WHERE m.user_id = auth.uid()),
                                   now() - interval '7 days')
  ) END;
$$;
REVOKE ALL ON FUNCTION public.river_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.river_unread_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.river_mark_seen()
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_now timestamptz := clock_timestamp(); -- the moment the feed was on screen, not the transaction start
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'river_mark_seen needs a signed-in user'; END IF;
  INSERT INTO river_read_marks (user_id, last_seen_at, updated_at) VALUES (auth.uid(), v_now, v_now)
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, updated_at = EXCLUDED.updated_at;
  RETURN v_now;
END $$;
REVOKE ALL ON FUNCTION public.river_mark_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.river_mark_seen() TO authenticated;
