-- E-postmallar kan sparas igen, per språk — och mottagarens språk läses rätt.
--
-- 1. upsert_email_template gjorde ON CONFLICT (name), men 20260903110000 bytte
--    nyckeln till (name, locale). Postgres hittar ingen matchande nyckel och
--    kastar — att spara en mall i Email → Templates har inte fungerat sedan
--    dess. Nu tar den p_locale (tomt → sajtens språk, via triggern) och
--    konflikten är (name, locale). delete_email_template tog bort ALLA språk-
--    versioner av ett namn; nu en version när p_locale anges.
-- 2. partner_language läste platform_locale ->> 'locale' (finns inte; nyckeln
--    heter default_locale) med reserven value #>> '{}' — HELA objektet som text.
--    Varje part utan eget språk fick lang = '{"default_currency": …}'. Språket
--    är sajtens språk (site_languages.default), inte ett formatval; zonen är
--    business_timezone(). docs/architecture/locale-and-formatting.md §3c.

DROP FUNCTION IF EXISTS public.upsert_email_template(text, text, text, text, text, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.upsert_email_template(
  p_name text,
  p_subject text,
  p_html text,
  p_text text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_variables jsonb DEFAULT '[]'::jsonb,
  p_active boolean DEFAULT true,
  p_locale text DEFAULT NULL
)
RETURNS public.email_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_row public.email_templates;
  v_locale text := lower(NULLIF(trim(p_locale), ''));
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'email')) THEN
    RAISE EXCEPTION 'Not authorised to manage email templates';
  END IF;
  -- No language given: the site's, exactly what the insert trigger would set —
  -- resolved here so the conflict target sees the same value.
  IF v_locale IS NULL THEN
    SELECT lower(coalesce(value ->> 'default', 'en')) INTO v_locale
      FROM public.site_settings WHERE key = 'site_languages';
    v_locale := coalesce(v_locale, 'en');
  END IF;
  INSERT INTO public.email_templates (name, locale, subject, html, text, category, variables, active, created_by)
    VALUES (p_name, v_locale, p_subject, p_html, p_text, p_category, coalesce(p_variables, '[]'::jsonb), coalesce(p_active, true), auth.uid())
    ON CONFLICT (name, locale) DO UPDATE SET
      subject = EXCLUDED.subject,
      html = EXCLUDED.html,
      text = EXCLUDED.text,
      category = EXCLUDED.category,
      variables = EXCLUDED.variables,
      active = EXCLUDED.active,
      updated_at = now()
    RETURNING * INTO v_row;
  RETURN v_row;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.upsert_email_template(text, text, text, text, text, jsonb, boolean, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.delete_email_template(text);

CREATE OR REPLACE FUNCTION public.delete_email_template(p_name text, p_locale text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admin can delete templates';
  END IF;
  -- With a language: that version only. Without: every version of the name,
  -- as before (an agent removing a template kind entirely).
  DELETE FROM public.email_templates
   WHERE name = p_name
     AND (p_locale IS NULL OR locale = lower(trim(p_locale)));
  RETURN FOUND;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.delete_email_template(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.partner_language(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_lang text;
  v_tz text;
  v_name text;
  v_default text;
BEGIN
  SELECT lang, tz, name INTO v_lang, v_tz, v_name FROM partners WHERE id = p_partner_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no such partner');
  END IF;

  -- The site's declared language — the one fact that says what it publishes in.
  SELECT NULLIF(lower(trim(value ->> 'default')), '') INTO v_default
    FROM site_settings WHERE key = 'site_languages';

  RETURN jsonb_build_object(
    'ok', true,
    'partner', v_name,
    'lang', coalesce(v_lang, v_default, 'en'),
    'lang_source', CASE
      WHEN v_lang IS NOT NULL THEN 'the partner''s own'
      WHEN v_default IS NOT NULL THEN 'the site language — nobody has asked this customer'
      ELSE 'the platform fallback — neither the partner nor the site declares a language' END,
    'tz', coalesce(v_tz, public.business_timezone()),
    'note', 'Never inferred from the country: an English-speaking company in Sweden '
         || 'exists, and a guess that is right nine times out of ten is wrong in a way '
         || 'nobody notices until the customer replies in another language.');
END
$fn$;

GRANT EXECUTE ON FUNCTION public.partner_language(uuid) TO authenticated, service_role;
