-- Mallen får ett språk.
--
-- Sajten kan publiceras på flera språk sedan i går. Det som SKICKAS UT kan det
-- inte: `email_templates` har en unik nyckel på `name`, så det finns exakt en
-- bokningsbekräftelse i hela systemet och den är på ett språk. En tysk kund som
-- bokar får svensk bekräftelse.
--
-- Halvan som saknades är bara nyckeln. Allt annat finns redan:
--   * mottagarens språk bor på parten sedan steg 13 (partner_language)
--   * stegen för att välja version är delad sedan i går (pick_locale)
--   * sajtens språk är deklarerat (site_languages)
--
-- Så det här steget följer konventionen i docs/architecture/language.md i
-- stället för att uppfinna en femte regel: en RAD per språk, `locale` på raden,
-- och `name` som fortfarande betyder SORT — bokningsbekräftelse, fakturamejl.
-- (`translation_group_id` behövs inte här: `name` ÄR gruppen, och till skillnad
-- från en sida behöver en mall ingen egen adress.)

ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS locale text;

COMMENT ON COLUMN public.email_templates.locale IS
  'Språket mallen är skriven på. (name, locale) är nyckeln: name är SORTEN, '
  'locale är versionen. Väljs via resolve_email_template().';

-- Befintliga mallar är skrivna på sajtens språk — det är det enda de kan vara.
UPDATE public.email_templates e
   SET locale = coalesce(
         (SELECT lower(value ->> 'default') FROM site_settings WHERE key = 'site_languages'), 'en')
 WHERE e.locale IS NULL;

-- Ingen kolumndefault: den skulle påstå ett språk om varje mall på varje
-- instans, precis den lögn pages.locale bar. Triggern fyller i sanningen.
CREATE OR REPLACE FUNCTION public.email_templates_default_locale()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.locale IS NULL OR trim(NEW.locale) = '' THEN
    SELECT lower(coalesce(value ->> 'default', 'en')) INTO NEW.locale
      FROM site_settings WHERE key = 'site_languages';
    NEW.locale := coalesce(NEW.locale, 'en');
  ELSE
    NEW.locale := lower(trim(NEW.locale));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS email_templates_set_locale ON public.email_templates;
CREATE TRIGGER email_templates_set_locale
  BEFORE INSERT ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.email_templates_default_locale();

-- Nyckeln blir (name, locale). Att flytta den är hela poängen: det är den som
-- gjorde en andra språkversion omöjlig att spara.
ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_name_key;
DROP INDEX IF EXISTS public.email_templates_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_name_locale_key
  ON public.email_templates (name, locale);

-- ── Vilken mall en mottagare ska få ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_email_template(
  p_name   text,
  p_locale text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_available text[];
  v_default text;
  v_chosen text;
  v_row email_templates%ROWTYPE;
BEGIN
  SELECT array_agg(locale) INTO v_available
    FROM email_templates WHERE name = p_name AND active;

  IF v_available IS NULL THEN
    RETURN jsonb_build_object('ok', false,
      'reason', format('no active template named "%s"', p_name),
      'what_to_do', 'The sender must fall back to its built-in text — an email must never fail to go out because a template is missing.');
  END IF;

  SELECT lower(coalesce(value ->> 'default', 'en')) INTO v_default
    FROM site_settings WHERE key = 'site_languages';

  v_chosen := public.pick_locale(v_available, p_locale, coalesce(v_default, 'en'));

  -- Steg 4 i stegen är "ingenting", och anroparen avgör. Här är svaret: hellre
  -- NÅGON version än ingen. Ett mejl som inte skickas är värre än ett mejl på
  -- fel språk, och mottagaren ser i alla fall vilket språk det blev.
  IF v_chosen IS NULL THEN
    v_chosen := v_available[1];
  END IF;

  SELECT * INTO v_row FROM email_templates
   WHERE name = p_name AND locale = v_chosen AND active LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'template_id', v_row.id,
    'name', v_row.name,
    'locale', v_row.locale,
    'subject', v_row.subject,
    'html', v_row.html,
    'text', v_row.text,
    'variables', v_row.variables,
    'requested_locale', p_locale,
    'is_exact', lower(coalesce(p_locale, '')) = v_row.locale,
    'available', to_jsonb(v_available));
END $$;

REVOKE ALL ON FUNCTION public.resolve_email_template(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_email_template(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_email_template(text, text) IS
  'Väljer mallversion för en mottagare: exakt tagg → samma språk → sajtens '
  'standard → NÅGON aktiv version. Det sista steget är avsiktligt — ett mejl '
  'som inte skickas är värre än ett mejl på fel språk.';

-- ── Mallen går att skapa på ett språk ──────────────────────────────────────
-- Utan p_locale vore kolumnen en död ratt: nyckeln tillåter en andra version,
-- men ingenting kunde skapa den.
DROP FUNCTION IF EXISTS public.manage_email_template(text, uuid, text, text, text, text, text, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.manage_email_template(
  p_action text,
  p_template_id uuid DEFAULT NULL::uuid,
  p_name text DEFAULT NULL::text,
  p_subject text DEFAULT NULL::text,
  p_html text DEFAULT NULL::text,
  p_text text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_variables jsonb DEFAULT NULL::jsonb,
  p_active boolean DEFAULT NULL::boolean,
  p_locale text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage email templates';
  END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('templates', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',t.id,'name',t.name,'locale',t.locale,'subject',t.subject,'category',t.category,'active',t.active)
      ORDER BY t.name, t.locale) FROM email_templates t), '[]'::jsonb));
  ELSIF p_action = 'get' THEN
    RETURN (SELECT to_jsonb(t) FROM email_templates t WHERE id = p_template_id);
  ELSIF p_action = 'create' THEN
    IF p_name IS NULL OR p_subject IS NULL THEN RAISE EXCEPTION 'create requires p_name and p_subject'; END IF;
    INSERT INTO email_templates (name, locale, subject, html, text, category, variables, active)
    VALUES (p_name, p_locale, p_subject, p_html, p_text, coalesce(p_category,'general'),
            coalesce(p_variables,'[]'::jsonb), coalesce(p_active,true))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('created', true, 'template_id', v_id,
      'locale', (SELECT locale FROM email_templates WHERE id = v_id));
  ELSIF p_action = 'update' THEN
    UPDATE email_templates SET name=coalesce(p_name,name), subject=coalesce(p_subject,subject),
      html=coalesce(p_html,html), text=coalesce(p_text,text), category=coalesce(p_category,category),
      variables=coalesce(p_variables,variables), active=coalesce(p_active,active),
      locale=coalesce(lower(nullif(trim(p_locale),'')),locale), updated_at=now()
    WHERE id = p_template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Template % not found', p_template_id; END IF;
    RETURN jsonb_build_object('updated', true, 'template_id', p_template_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM email_templates WHERE id = p_template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Template % not found', p_template_id; END IF;
    RETURN jsonb_build_object('deleted', true);
  END IF;
  RAISE EXCEPTION 'Unknown action %. Use list|get|create|update|delete', p_action;
END; $function$;

REVOKE ALL ON FUNCTION public.manage_email_template(text, uuid, text, text, text, text, text, jsonb, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_email_template(text, uuid, text, text, text, text, text, jsonb, boolean, text) TO authenticated, service_role;

-- ── Stegen bevisas här också ───────────────────────────────────────────────
DO $$
DECLARE v_name text := '__locale_ladder_probe__'; v_res jsonb; v_default text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT lower(coalesce(value ->> 'default', 'en')) INTO v_default
    FROM site_settings WHERE key = 'site_languages';

  INSERT INTO email_templates (name, locale, subject, html, active)
  VALUES (v_name, 'en', 'EN', '<p>en</p>', true), (v_name, 'de', 'DE', '<p>de</p>', true);

  v_res := public.resolve_email_template(v_name, 'de-AT');
  IF v_res ->> 'locale' <> 'de' THEN
    RAISE EXCEPTION 'resolve_email_template: de-AT should reach the de template, got %', v_res ->> 'locale';
  END IF;

  v_res := public.resolve_email_template(v_name, 'fr');
  IF (v_res ->> 'locale') IS NULL THEN
    RAISE EXCEPTION 'resolve_email_template: an unknown language must still get SOME template — an email must go out';
  END IF;

  v_res := public.resolve_email_template('__no_such_template__', 'en');
  IF (v_res ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'resolve_email_template: a missing template must report itself, not invent one';
  END IF;

  DELETE FROM email_templates WHERE name = v_name;
  RAISE NOTICE 'resolve_email_template: ladder holds (site default "%")', coalesce(v_default, 'en');
END $$;
