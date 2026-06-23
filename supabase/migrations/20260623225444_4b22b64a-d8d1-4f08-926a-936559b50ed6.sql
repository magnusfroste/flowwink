
-- WebMeet: simple 1-to-few WebRTC video rooms with shareable URLs.
-- Signaling + presence runs over Supabase Realtime broadcast channels, so no
-- signal/presence tables are needed — only room metadata lives in the DB.

CREATE TABLE IF NOT EXISTS public.webmeet_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text,
  host_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  password text,
  max_participants integer NOT NULL DEFAULT 8,
  is_locked boolean NOT NULL DEFAULT false,
  recording_enabled boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.webmeet_rooms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webmeet_rooms TO authenticated;
GRANT ALL ON public.webmeet_rooms TO service_role;

ALTER TABLE public.webmeet_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webmeet_rooms_public_read" ON public.webmeet_rooms;
CREATE POLICY "webmeet_rooms_public_read" ON public.webmeet_rooms
  FOR SELECT TO anon, authenticated
  USING (ended_at IS NULL AND (expires_at IS NULL OR expires_at > now()));

DROP POLICY IF EXISTS "webmeet_rooms_authenticated_insert" ON public.webmeet_rooms;
CREATE POLICY "webmeet_rooms_authenticated_insert" ON public.webmeet_rooms
  FOR INSERT TO authenticated
  WITH CHECK (host_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "webmeet_rooms_host_update" ON public.webmeet_rooms;
CREATE POLICY "webmeet_rooms_host_update" ON public.webmeet_rooms
  FOR UPDATE TO authenticated
  USING (host_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "webmeet_rooms_host_delete" ON public.webmeet_rooms;
CREATE POLICY "webmeet_rooms_host_delete" ON public.webmeet_rooms
  FOR DELETE TO authenticated
  USING (host_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_webmeet_rooms_updated_at ON public.webmeet_rooms;
CREATE TRIGGER update_webmeet_rooms_updated_at
  BEFORE UPDATE ON public.webmeet_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_webmeet_rooms_host ON public.webmeet_rooms(host_user_id);
CREATE INDEX IF NOT EXISTS idx_webmeet_rooms_slug ON public.webmeet_rooms(slug);

-- ── Slug helper ──
CREATE OR REPLACE FUNCTION public.gen_webmeet_slug()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_words text[] := ARRAY['swift','calm','bright','silver','river','quiet','bold','wild','clever','warm','cosmic','solar'];
  v_slug text;
  v_attempts int := 0;
BEGIN
  LOOP
    v_slug := v_words[1 + floor(random() * array_length(v_words, 1))::int]
           || '-' || v_words[1 + floor(random() * array_length(v_words, 1))::int]
           || '-' || lpad(floor(random() * 1000)::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.webmeet_rooms WHERE slug = v_slug);
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      v_slug := encode(gen_random_bytes(6), 'hex');
      EXIT;
    END IF;
  END LOOP;
  RETURN v_slug;
END;
$$;

-- ── Skill RPC: create_webmeet_room ──
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
SET search_path = public
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
    p_password,
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
    'expires_at', v_row.expires_at,
    'created_at', v_row.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_webmeet_room(text, text, int, int, uuid) TO authenticated, service_role;

-- ── Skill RPC: end_webmeet_room ──
CREATE OR REPLACE FUNCTION public.end_webmeet_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.webmeet_rooms%ROWTYPE;
BEGIN
  UPDATE public.webmeet_rooms
     SET ended_at = now()
   WHERE id = p_room_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Room % not found', p_room_id;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'slug', v_row.slug, 'ended_at', v_row.ended_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_webmeet_room(uuid) TO authenticated, service_role;

-- ── Skill RPC: list_webmeet_rooms ──
CREATE OR REPLACE FUNCTION public.list_webmeet_rooms(
  p_active_only boolean DEFAULT true,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT id, slug, name, host_user_id, max_participants,
             expires_at, ended_at, created_at,
             '/meet/' || slug AS url
        FROM public.webmeet_rooms
       WHERE (NOT p_active_only OR (ended_at IS NULL AND (expires_at IS NULL OR expires_at > now())))
       ORDER BY created_at DESC
       LIMIT GREATEST(1, LEAST(p_limit, 200))
    ) t;

  RETURN jsonb_build_object('rooms', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_webmeet_rooms(boolean, int) TO authenticated, service_role;
