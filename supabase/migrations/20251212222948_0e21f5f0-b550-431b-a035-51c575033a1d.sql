-- Insert SEO settings
INSERT INTO public.site_settings (key, value) VALUES (
  'seo',
  '{
    "siteTitle": "Sophiahemmet",
    "titleTemplate": "%s | Sophiahemmet",
    "defaultDescription": "Kvalitetsvård med patienten i fokus sedan 1884.",
    "ogImage": "",
    "twitterHandle": "",
    "googleSiteVerification": "",
    "robotsIndex": true,
    "robotsFollow": true
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Insert performance settings
INSERT INTO public.site_settings (key, value) VALUES (
  'performance',
  '{
    "lazyLoadImages": true,
    "prefetchLinks": true,
    "minifyHtml": false,
    "enableServiceWorker": false,
    "imageCacheMaxAge": 31536000,
    "cacheStaticAssets": true
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;