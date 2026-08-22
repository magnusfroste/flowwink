-- Newsletter follows the matrix — skrivningar gaterades av en spökroll-rest.
--
-- Incident 2026-08-21: marketing/sales såg ett agentskapat utkast (matris-läsrätten
-- fanns) men delete studsade tyst på "Admins can manage newsletters" — PostgREST
-- svarar "success, 0 rader" och UI:t sa ingenting. Admin kunde radera.
-- Klassen: nekad behörighet renderad som frånvarande effekt.
--
-- Regeln (rollsvepet): matrisen är enda ratten. Har rollen newsletter-modulen
-- får den arbeta med nyhetsbrev fullt ut — inklusive förkasta agentskapade
-- utkast, för det är modulens medlemmar som ÄR granskarna. Ägarskap är ingen
-- gate-axel. Skickade brev förblir historik i activity-loggen; ingen extra grind.

-- newsletters: ersätt admin-ALL med matris-ALL (läspolicyn finns redan)
DROP POLICY IF EXISTS "Admins can manage newsletters" ON public.newsletters;
DROP POLICY IF EXISTS "Staff can manage newsletters" ON public.newsletters;
CREATE POLICY "Staff can manage newsletters"
  ON public.newsletters
  FOR ALL
  USING (can_access_module(auth.uid(), 'newsletter'))
  WITH CHECK (can_access_module(auth.uid(), 'newsletter'));

-- newsletter_subscribers: delete var admin-only, men det är marketing som får
-- GDPR-/avprenumerationsönskemål. Samma dial. ("Anyone can subscribe" behålls.)
DROP POLICY IF EXISTS "Admins can delete subscribers" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "Staff can delete subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Staff can delete subscribers"
  ON public.newsletter_subscribers
  FOR DELETE
  USING (can_access_module(auth.uid(), 'newsletter'));
