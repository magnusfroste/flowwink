-- Villkorslänken följer avtalets språk (2026-10-26).
--
-- {{terms_url}} var alltid sajtens adress — siteUrl + '/' + termsSlug — och en
-- saknad sajt-URL skrev "Leverantörens webbplats" också i ett engelskt avtal.
-- En engelsk mall (contract_templates.language = 'en') på en svensk sajt
-- länkade alltså till /villkor, där villkoren visas på svenska.
--
-- Regeln (docs/architecture/addresses.md): inställningen pekar på en SIDA;
-- adressen följer sidan i läsarens språk —
--   sajtens språk          → /villkor
--   ett annat, översatt    → /en/<översättningens slug> (eller /en/villkor)
--   ett annat, oöversatt   → /villkor (sidan som finns — inte en 404)
--
-- public.terms_page_url(site_url, terms_slug, language) äger den regeln.
-- Renderaren (_render_contract_tokens) och dess två anropare patchas på plats
-- (pg_get_functiondef + replace), eftersom tidigare självupptäckande
-- omskrivningar (valuta, kalender) har ändrat deras kroppar i databasen —
-- en CREATE OR REPLACE ur en gammal fil skulle ta tillbaka dem.

CREATE OR REPLACE FUNCTION public.terms_page_url(p_site_url text, p_terms_slug text, p_language text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT rtrim(p_site_url, '/') AS base,
           COALESCE(NULLIF(trim(p_terms_slug), ''), 'terms') AS slug,
           lower(split_part(COALESCE(NULLIF(trim(p_language), ''), ''), '-', 1)) AS lang,
           lower(split_part(COALESCE((SELECT value->>'default' FROM public.site_settings WHERE key = 'site_languages'), 'en'), '-', 1)) AS site_lang
  ),
  ov AS (
    SELECT t.slug AS own_slug
      FROM s
      JOIN public.pages p ON p.slug = s.slug AND p.deleted_at IS NULL
      JOIN public.content_translations t
        ON t.entity = 'page' AND t.entity_id = p.id AND t.status = 'published'
       AND lower(split_part(t.locale, '-', 1)) = s.lang
     LIMIT 1
  )
  SELECT CASE
    WHEN s.lang = '' OR s.lang = s.site_lang THEN s.base || '/' || s.slug
    WHEN EXISTS (SELECT 1 FROM ov) THEN s.base || '/' || s.lang || '/' || COALESCE(NULLIF(trim((SELECT own_slug FROM ov)), ''), s.slug)
    ELSE s.base || '/' || s.slug
  END
  FROM s;
$$;
REVOKE ALL ON FUNCTION public.terms_page_url(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terms_page_url(text, text, text) TO authenticated, service_role;

DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  -- 1. The renderer: the link and the no-URL prose follow p_ctx.language.
  v_def := pg_get_functiondef('public._render_contract_tokens(text,jsonb)'::regprocedure);
  v_new := replace(v_def,
    $o$v_body := replace(v_body, '{{terms_url}}', rtrim(v_site_url, '/') || '/' || v_terms_slug);$o$,
    $n$v_body := replace(v_body, '{{terms_url}}', public.terms_page_url(v_site_url, v_terms_slug, p_ctx->>'language'));$n$);
  v_new := replace(v_new,
    $o$v_body := replace(v_body, '{{terms_url}}', 'Leverantörens webbplats');
  v_body := replace(v_body, '{{site_url}}', 'Leverantörens webbplats');$o$,
    $n$v_body := replace(v_body, '{{terms_url}}', CASE WHEN lower(split_part(COALESCE(p_ctx->>'language', 'sv'), '-', 1)) = 'sv' THEN 'Leverantörens webbplats' ELSE 'the supplier''s website' END);
  v_body := replace(v_body, '{{site_url}}', CASE WHEN lower(split_part(COALESCE(p_ctx->>'language', 'sv'), '-', 1)) = 'sv' THEN 'Leverantörens webbplats' ELSE 'the supplier''s website' END);$n$);
  IF v_new <> v_def THEN EXECUTE v_new; END IF;

  -- 2. A new agreement carries its template's language.
  v_def := pg_get_functiondef('public.create_contract_from_template(uuid,text,text,jsonb)'::regprocedure);
  v_new := replace(v_def,
    $o$v_body := public._render_contract_tokens(v_tpl.body_markdown, jsonb_build_object(
    'counterparty_name',$o$,
    $n$v_body := public._render_contract_tokens(v_tpl.body_markdown, jsonb_build_object(
    'language', v_tpl.language,
    'counterparty_name',$n$);
  IF v_new <> v_def THEN EXECUTE v_new; END IF;

  -- 3. An appendix speaks its agreement's language (the template it came from).
  v_def := pg_get_functiondef('public._render_appendix_body(text,uuid)'::regprocedure);
  v_new := replace(v_def,
    $o$'counterparty_address', NULLIF(trim(co.address), '')),$o$,
    $n$'counterparty_address', NULLIF(trim(co.address), ''),
           'language', (SELECT ct.language FROM public.contract_templates ct WHERE ct.id = c.template_id)),$n$);
  IF v_new <> v_def THEN EXECUTE v_new; END IF;
END $$;

-- ── Bevis vid varje applicering ────────────────────────────────────────────
DO $$
DECLARE
  v_page uuid;
  v_site text;
BEGIN
  IF pg_get_functiondef('public._render_contract_tokens(text,jsonb)'::regprocedure) NOT LIKE '%terms_page_url%' THEN
    RAISE EXCEPTION 'terms link: the renderer was not patched';
  END IF;
  IF pg_get_functiondef('public.create_contract_from_template(uuid,text,text,jsonb)'::regprocedure) NOT LIKE '%''language'', v_tpl.language%' THEN
    RAISE EXCEPTION 'terms link: create_contract_from_template does not pass the language';
  END IF;
  IF pg_get_functiondef('public._render_appendix_body(text,uuid)'::regprocedure) NOT LIKE '%''language'', (SELECT ct.language%' THEN
    RAISE EXCEPTION 'terms link: _render_appendix_body does not pass the language';
  END IF;

  SELECT lower(split_part(COALESCE(value->>'default', 'en'), '-', 1)) INTO v_site
    FROM public.site_settings WHERE key = 'site_languages';
  v_site := COALESCE(v_site, 'en');
  INSERT INTO public.pages (slug, title, status, locale, content_json)
    VALUES ('__villkor_proof__', 'Villkor', 'published', v_site, '[]'::jsonb)
    RETURNING id INTO v_page;
  INSERT INTO public.content_translations (entity, entity_id, locale, status, slug, strings)
    VALUES ('page', v_page, CASE WHEN v_site = 'zz' THEN 'yy' ELSE 'zz' END, 'published', '__terms_proof__', '{}'::jsonb);

  IF public.terms_page_url('https://x.se', '__villkor_proof__', v_site) <> 'https://x.se/__villkor_proof__' THEN
    RAISE EXCEPTION 'terms_page_url: site language → %', public.terms_page_url('https://x.se', '__villkor_proof__', v_site);
  END IF;
  IF public.terms_page_url('https://x.se/', '__villkor_proof__', 'zz') <> 'https://x.se/zz/__terms_proof__' THEN
    RAISE EXCEPTION 'terms_page_url: translated → %', public.terms_page_url('https://x.se/', '__villkor_proof__', 'zz');
  END IF;
  IF public.terms_page_url('https://x.se', '__villkor_proof__', 'qq') <> 'https://x.se/__villkor_proof__' THEN
    RAISE EXCEPTION 'terms_page_url: untranslated → %', public.terms_page_url('https://x.se', '__villkor_proof__', 'qq');
  END IF;

  DELETE FROM public.content_translations WHERE entity = 'page' AND entity_id = v_page;
  DELETE FROM public.pages WHERE id = v_page;
END $$;
