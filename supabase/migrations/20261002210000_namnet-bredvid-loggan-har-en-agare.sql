-- The organisation name next to the logo has one owner: branding.
--
-- Two settings answered the same question — branding.showNameWithLogo (Admin →
-- Branding) and the header block's showNameWithLogo (Pages → Header) — and the
-- public header OR-ed them. An operator turned Branding's off and the name stayed
-- (Hermes, 2026-10-02: the header's copy was on). Same class as the site
-- language in #430: two facts, one reader that guesses.
--
-- The roles decide the owner. "Name next to the mark" is identity, admin-level,
-- so branding keeps it; the header block keeps layout (show logo, logo size).
--
-- Order matters, and nothing changes on any site:
--   1. where the header's copy is ON, branding gets ON — exactly what the OR
--      rendered yesterday, now stored in the one field the code still reads;
--      a missing branding row is created rather than left to the default (off);
--   2. the header's copy is removed from every header block, so no second
--      answer can come back.
-- Idempotent: the UPDATE/INSERT are self-limiting, the key removal is a no-op
-- the second time.

INSERT INTO public.site_settings (key, value)
SELECT 'branding', '{"showNameWithLogo": true}'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE key = 'branding')
   AND EXISTS (SELECT 1 FROM public.global_blocks g
                WHERE g.slot = 'header' AND g.is_active
                  AND COALESCE((g.data->>'showNameWithLogo')::boolean, false));

UPDATE public.site_settings s
   SET value = COALESCE(s.value, '{}'::jsonb) || '{"showNameWithLogo": true}'::jsonb,
       updated_at = now()
 WHERE s.key = 'branding'
   AND NOT COALESCE((s.value->>'showNameWithLogo')::boolean, false)
   AND EXISTS (SELECT 1 FROM public.global_blocks g
                WHERE g.slot = 'header' AND g.is_active
                  AND COALESCE((g.data->>'showNameWithLogo')::boolean, false));

UPDATE public.global_blocks
   SET data = data - 'showNameWithLogo',
       updated_at = now()
 WHERE slot = 'header' AND data ? 'showNameWithLogo';
