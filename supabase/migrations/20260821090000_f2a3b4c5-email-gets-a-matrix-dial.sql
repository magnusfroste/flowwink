-- Email får en matrisratt — och rollsvep 4:s konvertering får tänder.
--
-- Bakgrunden: modulen `email` är core:true (infrastruktur — den ska inte gå
-- att stänga av) och doldes därför av Role Permissions-sidans `!core`-filter.
-- Två axlar delade en flagga: "kan inte stängas av" ≠ "ska inte rollstyras".
-- Konsekvensen: can_access_module(uid,'email') var admin-only för alltid, så
-- rollsvep 4:s konvertering av outbound_communications var tandlös, och fyra
-- email-RPC:er stod kvar på hårdkodade rollistor i admin-only-allowlisten
-- med noteringen "ÖPPET: ge email en matrisratt, konvertera sedan". Nu stängs
-- det öppna: frontend fick flaggan roleGatable (core-modul som ändå visas i
-- matrisen), och här får ratten data + konverteringen sker.
--
-- Defaults speglar de gamla hårdkodade listornas union (marketing, sales,
-- support — det var vad add/upsert-vakterna redan släppte in). Live-tabellen
-- fylls ENDAST när instansen saknar email-rader, så en operatörs egna val
-- överlever en replay (plattformskonfig-seedregeln).
--
-- delete_email_template förblir admin-only MED AVSIKT — destruktiv grind,
-- samma klass som deals DELETE. Den behåller sin allowlist-post.

-- ── 1. Ratten får data ─────────────────────────────────────────────────────
INSERT INTO public.role_module_access_defaults (role, module_id)
SELECT r.role, 'email'
FROM (VALUES ('marketing'::app_role), ('sales'::app_role), ('support'::app_role)) AS r(role)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_module_access (role, module_id)
SELECT r.role, 'email'
FROM (VALUES ('marketing'::app_role), ('sales'::app_role), ('support'::app_role)) AS r(role)
WHERE NOT EXISTS (SELECT 1 FROM public.role_module_access WHERE module_id = 'email')
ON CONFLICT DO NOTHING;

-- ── 2. RPC-vakterna läser ratten i stället för listorna ────────────────────

CREATE OR REPLACE FUNCTION public.add_email_suppression(p_email text, p_reason text DEFAULT 'manual'::text)
 RETURNS email_suppressions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.email_suppressions;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'email')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  INSERT INTO public.email_suppressions (email, reason) VALUES (lower(p_email), p_reason)
    ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason RETURNING * INTO v_row;
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION public.remove_email_suppression(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'email')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  DELETE FROM public.email_suppressions WHERE email = lower(p_email);
  RETURN FOUND;
END $function$;

CREATE OR REPLACE FUNCTION public.upsert_email_template(p_name text, p_subject text, p_html text, p_text text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_variables jsonb DEFAULT '[]'::jsonb, p_active boolean DEFAULT true)
 RETURNS email_templates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.email_templates;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'email')) THEN
    RAISE EXCEPTION 'Not authorised to manage email templates';
  END IF;
  INSERT INTO public.email_templates (name, subject, html, text, category, variables, active, created_by)
    VALUES (p_name, p_subject, p_html, p_text, p_category, coalesce(p_variables,'[]'::jsonb), coalesce(p_active,true), auth.uid())
    ON CONFLICT (name) DO UPDATE SET
      subject = EXCLUDED.subject,
      html = EXCLUDED.html,
      text = EXCLUDED.text,
      category = EXCLUDED.category,
      variables = EXCLUDED.variables,
      active = EXCLUDED.active,
      updated_at = now()
    RETURNING * INTO v_row;
  RETURN v_row;
END $function$;

-- ── LACKMUS ────────────────────────────────────────────────────────────────
--   Med marketing-JWT: upsert_email_template(...) lyckas; UPDATE på
--   outbound_communications ger 1 rad (rollsvep 4-policyn + den nya raden).
--   Ta bort (marketing,'email') ur role_module_access → båda nekas.
--   delete_email_template med marketing-JWT: exception, oavsett ratt.
