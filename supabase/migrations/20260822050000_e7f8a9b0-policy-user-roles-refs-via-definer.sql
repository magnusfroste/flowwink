-- Publika ytor kraschade: policy-subqueries mot user_roles efter anon-revoken.
--
-- Regression från 20260822010000 (anon-ytan krympt). Den drog in anons döda
-- SELECT-grant på user_roles — korrekt, anon ska inte kunna lista vem som är
-- admin. MEN tre anon-LÄSBARA tabeller bär en policy vars villkor gör en RÅ
-- `EXISTS (SELECT 1 FROM user_roles …)` i stället för att gå via de
-- SECURITY DEFINER-funktioner som finns just för detta (has_role, is_staff).
-- En rå subquery utvärderas i anroparens kontext och kräver därför att anon
-- HAR grant på user_roles. När granten försvann kraschade hela SELECT:en med
-- "permission denied for table user_roles" — och eftersom en permissiv policy
-- som felar fäller hela frågan, slog det ut den PUBLIKA läsningen:
--   * webinars                — WebinarBlock kunde inte lista webinarier
--   * webinar_registrations   — anon-anmälan/räknaren
--   * knowledge_chunks        — chat-grundningens interna chunkar
--
-- Fixen är inte att ge tillbaka granten (det vore att återöppna user_roles för
-- anon) utan att dirigera villkoret genom has_role()/is_staff(), som är
-- SECURITY DEFINER och läser user_roles i DEFINERNS kontext — grant-oberoende,
-- precis som resten av schemat redan gör. Semantiken är oförändrad.
--
-- Klass för framtiden: en RLS-policy får aldrig göra en rå SELECT mot
-- user_roles/role_module_access. Gå alltid via has_role/is_staff/
-- can_access_module. En policy som gör det bryts så fort den underliggande
-- tabellens grant stramas — en tyst koppling mellan två lager.

-- webinars: admin|approver via has_role (var: rå EXISTS user_roles)
DROP POLICY IF EXISTS "Admins can manage webinars" ON public.webinars;
CREATE POLICY "Admins can manage webinars"
  ON public.webinars
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'approver'::app_role));

-- webinar_registrations: samma
DROP POLICY IF EXISTS "Admins can manage registrations" ON public.webinar_registrations;
CREATE POLICY "Admins can manage registrations"
  ON public.webinar_registrations
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'approver'::app_role));

-- knowledge_chunks: "internal staff" = vilken staff-roll som helst = is_staff()
-- (var: rå EXISTS user_roles över alla nio app_roles). Publika/publicerade
-- chunkar täcks av sina egna policies; detta gäller bara visibility='internal'.
DROP POLICY IF EXISTS "Internal staff can read internal chunks" ON public.knowledge_chunks;
CREATE POLICY "Internal staff can read internal chunks"
  ON public.knowledge_chunks
  FOR SELECT
  USING (visibility = 'internal'::text AND is_staff(auth.uid()));

-- chat_feedback: latent (anon har bara INSERT, och frontend gör .insert() utan
-- .select() — så SELECT-policyn triggas inte för anon i dag). Härdas ändå:
-- samma klass, och dagen någon lägger .select() på insert:en skulle den brista
-- exakt som webinars gjorde. admin via has_role.
DROP POLICY IF EXISTS "Admins can view feedback" ON public.chat_feedback;
CREATE POLICY "Admins can view feedback"
  ON public.chat_feedback
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ── LACKMUS ────────────────────────────────────────────────────────────────
--   SET ROLE anon; SELECT count(*) FROM webinars;                → tal, inget fel
--   SET ROLE anon; SELECT count(*) FROM webinar_registrations;   → 0 (RLS), inget grant-fel
--   SET ROLE anon; SELECT count(*) FROM knowledge_chunks;        → publika chunkar, inget fel
