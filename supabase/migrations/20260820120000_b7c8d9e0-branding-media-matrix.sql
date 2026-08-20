-- Matrix-only-dial, två missade ytor (Svante-fynd 2026-08-20):
-- 1. 'branding' saknades i website-settings-familjen — tagline-spar gav röd
--    toast för marketing trots pages-modulen i Role Permissions.
-- 2. media_assets hade en enda admin-only-policy (även SELECT) — medie-
--    biblioteket dött för alla icke-admins; matrisen ska styra via mediaLibrary-modulen.

DROP POLICY IF EXISTS "Website settings creatable by pages-module roles" ON public.site_settings;
CREATE POLICY "Website settings creatable by pages-module roles" ON public.site_settings
  FOR INSERT TO authenticated
  WITH CHECK (key = ANY (ARRAY['seo','general','cookie_banner','ui_text','branding'])
    AND can_access_module(auth.uid(), 'pages'));

DROP POLICY IF EXISTS "Website settings editable by pages-module roles" ON public.site_settings;
CREATE POLICY "Website settings editable by pages-module roles" ON public.site_settings
  FOR UPDATE TO authenticated
  USING (key = ANY (ARRAY['seo','general','cookie_banner','ui_text','branding'])
    AND can_access_module(auth.uid(), 'pages'))
  WITH CHECK (key = ANY (ARRAY['seo','general','cookie_banner','ui_text','branding'])
    AND can_access_module(auth.uid(), 'pages'));

DROP POLICY IF EXISTS "Media assets readable by media-module roles" ON public.media_assets;
CREATE POLICY "Media assets readable by media-module roles" ON public.media_assets
  FOR SELECT TO authenticated
  USING (can_access_module(auth.uid(), 'mediaLibrary'));

DROP POLICY IF EXISTS "Media assets writable by media-module roles" ON public.media_assets;
CREATE POLICY "Media assets writable by media-module roles" ON public.media_assets
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'mediaLibrary'))
  WITH CHECK (can_access_module(auth.uid(), 'mediaLibrary'));
