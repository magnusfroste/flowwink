-- Mötet når genom brandväggen — och lösenordet ligger inte i klartext.
--
-- WebMeet-rummet är en länk: /meet/<slug>, inget konto. Tre saker bakom länken
-- ändras här, resten (TURN via Cloudflare Calls, förhandsvisning av kamera,
-- deltagartak, värdens lås) ligger i edge-funktionen webmeet-ice och i sidan.
--
--   1. webmeet_rooms.password lagrades i klartext och var dessutom läsbar för
--      anon via den publika SELECT-policyn (rummet måste vara läsbart för att
--      gästen ska se namnet). Nu: sha256-hash, satt av create_webmeet_room, och
--      kontrollen görs i webmeet-ice med service-klienten. Befintliga klartext-
--      lösenord hashas en gång.
--   2. anon får läsa de kolumner en gäst behöver — inte password, inte host.
--      Kolumnvisa SELECT-rättigheter; policyn (ej avslutat, ej utgånget) står.
--   3. Värden låser och låser upp sitt rum från mötet (is_locked, RLS
--      webmeet_rooms_host_update finns redan); webmeet-ice släpper bara in värden
--      när rummet är låst.

-- 1. Hash the password at rest; create_webmeet_room hashes from now on.
--    pgcrypto lives in the extensions schema on Supabase; resolve digest() there.
DO $$
BEGIN
  SET LOCAL search_path = public, extensions;
  UPDATE public.webmeet_rooms
     SET password = encode(digest(password, 'sha256'), 'hex')
   WHERE password IS NOT NULL AND password !~ '^[0-9a-f]{64}$';
END $$;
COMMENT ON COLUMN public.webmeet_rooms.password IS
  'sha256 hex of the room password, or NULL. Checked by webmeet-ice before it hands out ICE servers; never compared in the browser.';

CREATE OR REPLACE FUNCTION public.create_webmeet_room(
  p_name text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_max_participants int DEFAULT 8,
  p_expires_in_minutes int DEFAULT NULL,
  p_host_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_slug text;
  v_row public.webmeet_rooms%ROWTYPE;
  v_host uuid := COALESCE(p_host_user_id, auth.uid());
BEGIN
  v_slug := public.gen_webmeet_slug();

  INSERT INTO public.webmeet_rooms (slug, name, host_user_id, password, max_participants, expires_at)
  VALUES (
    v_slug,
    p_name,
    v_host,
    CASE WHEN NULLIF(trim(COALESCE(p_password, '')), '') IS NULL THEN NULL
         ELSE encode(digest(trim(p_password), 'sha256'), 'hex') END,
    GREATEST(2, LEAST(COALESCE(p_max_participants, 8), 16)),
    CASE WHEN p_expires_in_minutes IS NOT NULL
         THEN now() + (p_expires_in_minutes || ' minutes')::interval
         ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'name', v_row.name,
    'url', '/meet/' || v_row.slug,
    'max_participants', v_row.max_participants,
    'has_password', v_row.password IS NOT NULL,
    'expires_at', v_row.expires_at,
    'created_at', v_row.created_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_webmeet_room(text, text, int, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_webmeet_room(text, text, int, int, uuid) TO authenticated, service_role;

-- 2. A guest reads what a guest needs. Column privileges; the row policy stands.
REVOKE SELECT ON public.webmeet_rooms FROM anon;
GRANT SELECT (id, slug, name, max_participants, is_locked, expires_at, ended_at, created_at)
  ON public.webmeet_rooms TO anon;
