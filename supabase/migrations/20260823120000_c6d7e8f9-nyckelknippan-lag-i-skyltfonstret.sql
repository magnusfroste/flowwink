-- Nyckelknippan låg i skyltfönstret.
--
-- INCIDENTEN (verifierad skarpt mot en live-instans, inte rapporterad i andra
-- hand). `site_settings` bar sedan baselinen exakt en läspolicy:
--
--   CREATE POLICY "Anyone can view site settings"
--     ON public.site_settings FOR SELECT USING (true);
--
-- Ingen TO-klausul = `TO public` = rollen `anon` inräknad. `SET ROLE anon` läser
-- alltså HELA tabellen, och tabellen är instansens konfigurationsknippa:
-- `integrations` (leverantörsnycklar), `system_ai` (modellpolicyn),
-- `email_allowlist`, `edge_functions_deployed`, `visitor_intelligence_rules`,
-- `custom_themes`, `company_profile`, `soul`, `accounting_locale` … På den
-- instans hålet negativtestades bar `site_settings.integrations` ett fält
-- `apiKey` med ett icke-tomt värde. Vem som helst med den PUBLIKA
-- publishable-nyckeln kunde hämta den över REST, utan konto.
--
-- Samma klass som `fw_edge_credentials`-fyndet tidigare i veckan
-- (20260822040000): en yta som ser ut som "publik sajtkonfiguration" och i
-- praktiken är driftens nyckelknippa. Policyn kommer ur baseline-schemat, så
-- den gäller varje instans i fleeten som inte redan fått den här migrationen.
--
-- ANDRA VÄGEN IN, SAMMA HÅL: `content-api` körs med `verify_jwt = false` och
-- bygger sin klient med `getAnonClient()`. Både GraphQL-grenen (`siteSettings`,
-- index.ts:1170) och REST-grenen (`GET /settings`, index.ts:2017) gör
-- `.from('site_settings').select('key, value')` UTAN nyckelfilter — hela
-- knippan serverad över ett publikt API. Den grenen fixas inte i koden här: den
-- ÄR RLS-styrd, och efter den här migrationen returnerar den exakt
-- tillåtlistan. Det är poängen med att lägga grinden i policyn i stället för i
-- varje anropare.
--
-- ── VARFÖR INTE BARA STÄNGA ─────────────────────────────────────────────────
-- Samma tabell bär den publika sajtens EGEN konfiguration. En `USING (false)`
-- eller en `is_staff()`-only-policy släcker besökarytan på hela fleeten: ingen
-- SEO-head, ingen branding, ingen chattwidget, ingen kakbanner, ingen
-- butiksmeny. Att stänga för brett är också ett haveri. Grinden måste därför
-- vara en NYCKEL-TILLÅTLISTA, och tillåtlistan måste vara HÄRLEDD ur koden.
--
-- ── TILLÅTLISTAN, HÄRLEDD UR KODEN (källa per nyckel) ───────────────────────
-- Varje rad nedan har minst en läsare som körs UTAN inloggning. Admin-läsare
-- räknas inte — de får sitt genom `is_staff`-policyn längre ned.
--
--   aeo               src/components/public/SeoHead.tsx (useAeoSettings)
--   blog              src/components/public/PublicNavigation.tsx,
--                     src/pages/BlogPostPage|BlogArchivePage|BlogCategoryPage|
--                     BlogTagPage.tsx, supabase/functions/blog-rss (getAnonClient)
--   branding          src/providers/BrandingProvider.tsx (monterad i App.tsx för
--                     HELA appen, publikt inkluderat),
--                     src/components/public/ComingSoonPage.tsx,
--                     src/pages/AuthPage.tsx (inloggningssidan = utloggad)
--   chat              src/components/public/ChatWidget.tsx,
--                     src/components/public/blocks/ChatBlock|AiAssistantBlock|
--                     ChatLauncherBlock.tsx, src/hooks/useChat.tsx,
--                     src/pages/ChatPage.tsx
--   cookie_banner     ingen NUVARANDE anon-läsare i src/ — den publika bannern
--                     läser `cookie_consent_v2`. Nyckeln tas ändå med: den är
--                     ren besökarcopy (rubrik, brödtext, knapptexter), den
--                     seedas av mallarna och ResetSiteDialog som besökartext,
--                     och den står redan i pages-modulens SKRIVfamilj
--                     (20260820120000). Noll hemlighetsyta, och en frontend som
--                     är äldre än den här migrationen får sin banner.
--   cookie_consent_v2 src/components/public/CookieBanner.tsx  ← den LEVANDE
--   custom_scripts    src/components/public/SeoHead.tsx,
--                     src/components/public/BodyScripts.tsx. (Innehållet
--                     injiceras i besökarens DOM — det är publikt per
--                     konstruktion, inte trots policyn.)
--   customer_portal   src/components/public/PublicNavigation.tsx,
--                     src/components/checkout/GuestAccountPrompt.tsx,
--                     src/pages/account/CustomerAuthPage.tsx (utloggad)
--   demo_mode         src/pages/AuthPage.tsx — visas för en besökare som ännu
--                     inte loggat in; utan anon-läsning är den alltid av.
--   general           src/pages/PublicPage.tsx (homepageSlug avgör vilken sida
--                     som ÄR startsidan)
--   maintenance       src/pages/PublicPage.tsx (underhållsläget måste kunna
--                     visas för just den som inte är inloggad)
--   modules           src/components/public/PublicNavigation.tsx,
--                     src/components/public/ChatWidget.tsx,
--                     src/components/public/blocks/KbHubBlock|ChatBlock|
--                     ChatLauncherBlock.tsx, src/pages/KnowledgeBasePage.tsx,
--                     src/hooks/useVatDisplay.ts (Cart/Checkout/ProductDetail —
--                     hooken dokumenterar uttryckligen att den är anon-läsning),
--                     src/pages/account/AccountLayout.tsx (portalkund)
--   performance       src/components/public/SeoHead.tsx OCH
--                     supabase/functions/get-page (getAnonClient, index.ts:34) —
--                     edge-cachningen läser den innan sidan ens hämtas
--   platform_locale   src/hooks/usePlatformFormat.ts, src/lib/platform-fallbacks.ts,
--                     src/components/DateFnsLocaleSync.tsx — formatlagret gäller
--                     hela appen, publika priser och datum inräknade
--   quotes            src/pages/PublicQuotePage.tsx (/quote/:token),
--                     src/pages/SignatureCertificatePage.tsx — rena token-sidor
--                     för en utloggad mottagare
--   sandbox_mode      src/components/SandboxBanner.tsx, monterad i
--                     src/components/public/PublicNavigation.tsx
--   seo               src/components/public/SeoHead.tsx, src/pages/PublicPage.tsx,
--                     ShopPage, PricingPage, Blog*-sidorna,
--                     supabase/functions/blog-rss (getAnonClient)
--   store             src/components/public/PublicNavigation.tsx
--   ui_text           src/lib/ui-text.tsx (UiTextProvider, monterad överst i
--                     App.tsx — utan den faller VARJE besökarsträng tillbaka
--                     till engelska)
--
-- Tillåtlistan är konsekvent med hur huset redan tänker om nycklar: de
-- KEY-SCOPADE SKRIVPOLICIERNA gatar `seo, general, cookie_banner, ui_text,
-- branding` på pages-modulen (20260820120000) och `chat` på chat-modulen
-- (20260817213000), medan `integrations`, `modules`, `system_ai`,
-- `email_allowlist` med flera lämnades admin-only med den uttryckliga
-- motiveringen "plattformsdriftens nycklar … är inte website-innehåll"
-- (20260818103000). Läsgrinden följer nu samma skiljelinje som skrivgrinden.
--
-- ── MEDVETET UTANFÖR (fail closed) ─────────────────────────────────────────
-- Ingen anonym läsare finns i koden för: integrations, system_ai,
-- email_allowlist, edge_functions_deployed, custom_themes, company_profile,
-- business_identity, company_name, footer, kb, voice, dunning, cowork,
-- subscriptions, sales_pipeline, accounting_preferences, accounting_locale,
-- autonomy_schedule, handbook_config, heartbeat_overrides, soul,
-- visitor_intelligence_rules, tenant_locale_pack, demo/test-nycklar.
-- De blir osynliga för anon. En nyckel som INTE står i listan är osynlig —
-- det är avsiktligt: nästa utvecklare som lägger en hemlighet i den här
-- tabellen ska inte råka publicera den bara genom att skriva raden.
--
-- ── DEN ENDA PUBLIKA YTAN SOM FAKTISKT TAPPADE NÅGOT ───────────────────────
-- src/components/public/TrackingScripts.tsx läste `integrations` med
-- besökarens ögon för att plocka ut GA4:s measurementId och Meta Pixels
-- pixelId. Det är exakt varför hålet fanns kvar: en publik komponent hade
-- gjort HELA knippan till publik konfiguration för att komma åt två offentliga
-- id:n (båda syns ändå i sidans HTML/nätverkstrafik så snart skripten laddas).
-- Ett fast, smalt fönster i stället för en öppen dörr — samma mönster som
-- get_public_contract: SECURITY DEFINER, FAST kolumnlista, inget `apiKey` kan
-- någonsin komma ut den vägen ens om någon lägger till fler fält i JSON:en.

-- ── 1. Det smala fönstret för spårnings-id:n ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_tracking_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'google_analytics', jsonb_build_object(
      'enabled', COALESCE((s.value -> 'google_analytics' ->> 'enabled')::boolean, false),
      'measurementId', NULLIF(btrim(COALESCE(s.value -> 'google_analytics' -> 'config' ->> 'measurementId', '')), '')
    ),
    'meta_pixel', jsonb_build_object(
      'enabled', COALESCE((s.value -> 'meta_pixel' ->> 'enabled')::boolean, false),
      'pixelId', NULLIF(btrim(COALESCE(s.value -> 'meta_pixel' -> 'config' ->> 'pixelId', '')), '')
    )
  )
  FROM public.site_settings s
  WHERE s.key = 'integrations';
$$;

COMMENT ON FUNCTION public.get_public_tracking_config() IS
  'De två offentliga spårnings-id:n (GA4 measurementId, Meta pixelId) som ändå '
  'hamnar i besökarens DOM. FAST fältlista — inget annat ur site_settings.integrations '
  'kan komma ut här. Ersätter den anon-läsning av hela integrations-nyckeln som '
  'TrackingScripts.tsx gjorde innan tillåtlistan.';

-- Ingen intern rollvakt: funktionen ÄR sin egen vakt (fast fältlista, två
-- offentliga id:n). REVOKE FROM PUBLIC ändå, så att grants är uttryckliga och
-- listbara — regeln från anon-svepet 20260822040000.
REVOKE ALL ON FUNCTION public.get_public_tracking_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tracking_config() TO anon, authenticated, service_role;

-- ── 2. Hålet självt ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;
-- Namnvarianter sedda i fältet (baseline-omskrivningar och Lovable-genererade
-- policies). Droppas om, så att en instans som bär en av dem inte behåller en
-- `true`-policy vid sidan av tillåtlistan — permissiva policies OR:as, en enda
-- kvarglömd `true` upphäver hela grinden.
DROP POLICY IF EXISTS "Public can view site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Anyone can read site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Site settings are viewable by everyone" ON public.site_settings;
DROP POLICY IF EXISTS "Everyone can view site settings" ON public.site_settings;

-- ── 3. Tillåtlistan ────────────────────────────────────────────────────────
-- TO public, inte TO anon: rollen `public` omfattar även `authenticated`, så
-- PORTALKUNDEN (inloggad, roll `customer`, aldrig `is_staff`) får samma
-- publika sajtkonfiguration som besökaren. Hade policyn stått TO anon hade
-- /account tappat branding, ui_text, modules och customer_portal i samma
-- ögonblick som kunden loggade in — en regression som bara syns EFTER login.
DROP POLICY IF EXISTS "Public site config is readable" ON public.site_settings;
CREATE POLICY "Public site config is readable"
  ON public.site_settings
  FOR SELECT
  TO public
  USING (
    key = ANY (ARRAY[
      'aeo',
      'blog',
      'branding',
      'chat',
      'cookie_banner',
      'cookie_consent_v2',
      'custom_scripts',
      'customer_portal',
      'demo_mode',
      'general',
      'maintenance',
      'modules',
      'performance',
      'platform_locale',
      'quotes',
      'sandbox_mode',
      'seo',
      'store',
      'ui_text'
    ])
  );

-- ── 4. Personalens läsning ─────────────────────────────────────────────────
-- `site_settings` spänner över varje modul; en per-nyckel-modulgrind hade
-- krävt en karta över ~40 nycklar och gjort varje ny nyckel till en migration.
-- `is_staff` är husets grind för "intern yta som inte hör till EN modul" (samma
-- funktion som gatar den interna KB-nivån, 20260805090000). Den är definierad
-- som "har en rad i user_roles med annan roll än customer", och admin ingår.
-- Det här är alltså ingen INSKRÄNKNING mot dagens läge för någon som är
-- inloggad personal — de såg allt förut och ser allt nu. Det som dör är att
-- ANON och KUND såg allt.
DROP POLICY IF EXISTS "Staff read site settings" ON public.site_settings;
CREATE POLICY "Staff read site settings"
  ON public.site_settings
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- `is_staff` skapas om här av samma skäl som 20260805090000 angav: den
-- introducerades av en migration (20260726180000) som ligger under vissa
-- managed-instansers ledger-HEAD och därför hoppades över där. En läspolicy
-- vars predikat saknas felar i stället för att neka snyggt — och skulle här
-- låsa ute admin ur sin egen instans. CREATE OR REPLACE är en no-op där den
-- redan finns.
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role <> 'customer'
  );
$$;

COMMENT ON TABLE public.site_settings IS
  'Instanskonfiguration som key/value. LÄSNING: policyn "Public site config is '
  'readable" är en NYCKEL-TILLÅTLISTA för anon och portalkund — allt utanför '
  'listan är osynligt för dem, avsiktligt fail closed. Lägger du en nyckel som '
  'bär en hemlighet (nycklar, tokens, webhookar) ska den ALDRIG in i listan; '
  'behöver en publik yta ett fält ur en sådan nyckel, exponera just det fältet '
  'genom en SECURITY DEFINER-funktion med fast fältlista (mönster: '
  'get_public_tracking_config).';

-- ── 5. Kvitto i loggen ─────────────────────────────────────────────────────
-- Räknar SELECT-policies på site_settings som fortfarande säger `true` rakt av.
-- service_role undantas: den rollen är RLS-befriad ändå, så en `true`-policy
-- där är dekoration och inte en yta.
-- Förväntat: 0. Blir det >0 har någon lagt tillbaka hålet.
DO $receipt$
DECLARE
  n_true int;
  leftovers text;
  n_allow int;
BEGIN
  SELECT count(*), string_agg(tablename || '.' || policyname, ', ')
    INTO n_true, leftovers
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'site_settings'
     AND NOT (coalesce(roles::text[], ARRAY[]::text[]) @> ARRAY['service_role'])
     AND (btrim(coalesce(qual, '')) = 'true' OR btrim(coalesce(with_check, '')) = 'true');

  SELECT count(*) INTO n_allow
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'site_settings'
     AND policyname = 'Public site config is readable';

  IF n_true > 0 THEN
    RAISE WARNING 'site_settings: % policies bär fortfarande USING/WITH CHECK true (%) — anon läser mer än tillåtlistan', n_true, leftovers;
  ELSIF n_allow = 0 THEN
    RAISE WARNING 'site_settings: tillåtlistepolicyn saknas — den publika sajten har ingen konfiguration att läsa';
  ELSE
    RAISE NOTICE 'site_settings: inga USING/WITH CHECK true kvar — anon ser 19 publika nycklar, personal ser allt via is_staff, integrations/system_ai/email_allowlist är osynliga utan konto';
  END IF;
END
$receipt$;
