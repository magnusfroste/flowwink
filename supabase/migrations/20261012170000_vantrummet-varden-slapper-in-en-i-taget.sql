-- Väntrummet: värden släpper in en i taget.
--
-- Läkarfallet: patienten får en länk, öppnar den i tid och ska vänta tills
-- läkaren är klar med den förra — inte kliva rakt in i någon annans samtal.
-- Zoom och Teams löser det med ett väntrum; här är det en knackning.
--
--   1. webmeet_rooms.waiting_room — värden slår på det när rummet skapas eller
--      inne i mötet. Gäster får läsa kolumnen så sidan kan säga vad som väntar.
--   2. webmeet_knocks — en rad per gäst som knackar. Dörren (webmeet-ice) skriver
--      raden med service-klienten, värden svarar via answer_webmeet_knock, och
--      dörren läser svaret innan den lämnar ut ICE-servrarna. Gästen kan inte
--      släppa in sig själv: det enda gästen har är sitt knock-id, och det öppnar
--      inget förrän värden sagt ja. Tabellen har ingen anon- eller
--      authenticated-åtkomst alls — bara dörren och funktionen rör den.
--   3. Ett rum utan namngiven värd (bokningens rum skapas med host_user_id NULL)
--      är personalens: den som får använda WebMeet i admin är värd där och kan
--      låsa, släppa in och avsluta. Förut kunde ingen alls.
--   4. create_webmeet_room får p_waiting_room. Den gamla signaturen tas bort så
--      PostgREST inte ser två överlagringar (PGRST203 vid anrop utan argument).

-- 1 ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.webmeet_rooms
  ADD COLUMN IF NOT EXISTS waiting_room boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.webmeet_rooms.waiting_room IS
  'When true a guest who passes the door waits in webmeet_knocks until the host answers; the door hands out ICE servers only for an admitted knock.';
GRANT SELECT (waiting_room) ON public.webmeet_rooms TO anon;

-- 2 ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webmeet_knocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.webmeet_rooms(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Guest',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  admitted boolean,
  answered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz
);
COMMENT ON TABLE public.webmeet_knocks IS
  'A guest at the door of a room with a waiting room. Written by webmeet-ice (service role), answered by the host through answer_webmeet_knock. No anon or authenticated access by design.';
CREATE INDEX IF NOT EXISTS idx_webmeet_knocks_room ON public.webmeet_knocks(room_id, created_at DESC);

ALTER TABLE public.webmeet_knocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webmeet_knocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.webmeet_knocks TO service_role;

-- 3 ────────────────────────────────────────────────────────────────────────
-- Who is the host of a room? The named host, an admin, or — for a room nobody
-- is named on — anyone who may use WebMeet. One answer for the door, the lock
-- policy and the knock function. The service role (the agent rail, cron) is
-- host everywhere; the door therefore asks with the guest's own JWT, never
-- with the service key, so a guest is never mistaken for staff.
CREATE OR REPLACE FUNCTION public.is_webmeet_host(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role' OR (p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.webmeet_rooms r
     WHERE r.id = p_room_id
       AND (r.host_user_id = p_user_id
            OR public.has_role(p_user_id, 'admin')
            OR (r.host_user_id IS NULL AND public.can_access_module(p_user_id, 'webmeet')))
  ));
$$;
REVOKE ALL ON FUNCTION public.is_webmeet_host(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_webmeet_host(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "webmeet_rooms_host_update" ON public.webmeet_rooms;
CREATE POLICY "webmeet_rooms_host_update" ON public.webmeet_rooms
  FOR UPDATE TO authenticated
  USING (public.is_webmeet_host(id, auth.uid()));

CREATE OR REPLACE FUNCTION public.answer_webmeet_knock(p_knock_id uuid, p_admit boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_knock public.webmeet_knocks%ROWTYPE;
BEGIN
  SELECT * INTO v_knock FROM public.webmeet_knocks WHERE id = p_knock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'knock_not_found' USING HINT = 'The guest may have left the queue.';
  END IF;
  IF NOT (auth.role() = 'service_role' OR public.is_webmeet_host(v_knock.room_id, auth.uid())) THEN
    RAISE EXCEPTION 'Only the host can let people in';
  END IF;
  UPDATE public.webmeet_knocks
     SET answered_at = now(), admitted = p_admit, answered_by = auth.uid()
   WHERE id = p_knock_id;
  RETURN jsonb_build_object('knock_id', p_knock_id, 'admitted', p_admit);
END;
$$;
REVOKE ALL ON FUNCTION public.answer_webmeet_knock(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_webmeet_knock(uuid, boolean) TO authenticated, service_role;

-- 4 ────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_webmeet_room(text, text, int, int, uuid);
CREATE OR REPLACE FUNCTION public.create_webmeet_room(
  p_name text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_max_participants int DEFAULT 8,
  p_expires_in_minutes int DEFAULT NULL,
  p_host_user_id uuid DEFAULT NULL,
  p_waiting_room boolean DEFAULT false
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

  INSERT INTO public.webmeet_rooms (slug, name, host_user_id, password, max_participants, expires_at, waiting_room)
  VALUES (
    v_slug,
    p_name,
    v_host,
    CASE WHEN NULLIF(trim(COALESCE(p_password, '')), '') IS NULL THEN NULL
         ELSE encode(digest(trim(p_password), 'sha256'), 'hex') END,
    GREATEST(2, LEAST(COALESCE(p_max_participants, 8), 16)),
    CASE WHEN p_expires_in_minutes IS NOT NULL
         THEN now() + (p_expires_in_minutes || ' minutes')::interval
         ELSE NULL END,
    COALESCE(p_waiting_room, false)
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'name', v_row.name,
    'url', '/meet/' || v_row.slug,
    'max_participants', v_row.max_participants,
    'has_password', v_row.password IS NOT NULL,
    'waiting_room', v_row.waiting_room,
    'expires_at', v_row.expires_at,
    'created_at', v_row.created_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_webmeet_room(text, text, int, int, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_webmeet_room(text, text, int, int, uuid, boolean) TO authenticated, service_role;

-- The room list says which rooms have a waiting room.
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
      SELECT id, slug, name, host_user_id, max_participants, waiting_room, is_locked,
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
REVOKE ALL ON FUNCTION public.list_webmeet_rooms(boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_webmeet_rooms(boolean, int) TO authenticated, service_role;
