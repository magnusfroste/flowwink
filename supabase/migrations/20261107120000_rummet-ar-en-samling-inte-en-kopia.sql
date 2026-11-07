-- Rummet är en samling, inte en kopia.
--
-- Peters backlogg (optic, 2026-11-05): "skapa avgränsade vyer och behörigheter
-- — Board room, juristvy, partnervy — utan att duplicera källdata." Det som
-- fanns: synlighet per roll på dokumentet (för personal med konto) och en
-- delningslänk per dokument (för alla andra). Det som saknades är rummet:
-- en namngiven samling dokument och vilka som ser den. Dokumenten ligger
-- kvar där de ligger — document_room_items pekar, kopierar aldrig.
--
-- Tre begrepp, fyra tabeller:
--   document_rooms          rummet (namn, syfte, aktivt)
--   document_room_items     vilka dokument som visas i det — pekare
--   document_room_members   vem som får se det: en PERSONLIG länk per
--                           mottagare (view | download, utgång, återkallad)
--   document_room_access    vem som öppnade vad, när — grunden för
--                           "investor room med spårbar åtkomst"
--
-- Tre funktioner:
--   manage_document_room    personal och agenter (matrisen: documents)
--   open_document_room      mottagaren, på sin länk: rummets lista, aldrig
--                           file_url, aldrig någon annans token
--   resolve_document_room_file  edge-funktionen document-share (service),
--                           som präglar den korta signerade länken och loggar
--
-- Regler (anon-ytan 2026-08-22): fixerad kolumnlista, named input guard
-- token_is_plausible, REVOKE från PUBLIC, anon OCH authenticated uttryckligen
-- på det som inte är avsett publikt.

CREATE TABLE IF NOT EXISTS public.document_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  ALTER TABLE public.document_rooms DROP CONSTRAINT IF EXISTS document_rooms_name_check;
  ALTER TABLE public.document_rooms ADD CONSTRAINT document_rooms_name_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 120);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON TABLE public.document_rooms IS
  'A named collection of documents and who may see it (Board room, legal counsel, a partner). The documents stay where they are — the room points, it never copies.';

CREATE TABLE IF NOT EXISTS public.document_room_items (
  room_id uuid NOT NULL REFERENCES public.document_rooms(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, document_id)
);
COMMENT ON TABLE public.document_room_items IS 'Which documents a room shows. A pointer per document — delete the row and the document is unchanged.';

CREATE TABLE IF NOT EXISTS public.document_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.document_rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  permission text NOT NULL DEFAULT 'view',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz,
  revoked_at timestamptz,
  access_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  ALTER TABLE public.document_room_members DROP CONSTRAINT IF EXISTS document_room_members_permission_check;
  ALTER TABLE public.document_room_members ADD CONSTRAINT document_room_members_permission_check CHECK (permission IN ('view', 'download'));
  ALTER TABLE public.document_room_members DROP CONSTRAINT IF EXISTS document_room_members_name_check;
  ALTER TABLE public.document_room_members ADD CONSTRAINT document_room_members_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS document_room_members_room_idx ON public.document_room_members (room_id, created_at);
COMMENT ON TABLE public.document_room_members IS
  'Who may open a room: one PERSONAL link (token) per recipient, so the access log names a person. view = read in the browser, download = also save the file. Revoked or expired, the link answers nothing.';

CREATE TABLE IF NOT EXISTS public.document_room_access (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.document_rooms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.document_room_members(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  document_title text,
  action text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  ALTER TABLE public.document_room_access DROP CONSTRAINT IF EXISTS document_room_access_action_check;
  ALTER TABLE public.document_room_access ADD CONSTRAINT document_room_access_action_check CHECK (action IN ('open', 'view', 'download'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS document_room_access_room_idx ON public.document_room_access (room_id, created_at DESC);
COMMENT ON TABLE public.document_room_access IS
  'Who opened the room, viewed or downloaded which document, when. Written by the functions only; the title is kept so a deleted document still reads in the log.';

-- ── RLS: the matrix is the one dial (documents module) ──────────────────────
ALTER TABLE public.document_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_room_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_room_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_rooms follow the documents module" ON public.document_rooms;
CREATE POLICY "document_rooms follow the documents module" ON public.document_rooms
  FOR ALL USING (public.can_access_module(auth.uid(), 'documents'))
  WITH CHECK (public.can_access_module(auth.uid(), 'documents'));
DROP POLICY IF EXISTS "document_room_items follow the documents module" ON public.document_room_items;
CREATE POLICY "document_room_items follow the documents module" ON public.document_room_items
  FOR ALL USING (public.can_access_module(auth.uid(), 'documents'))
  WITH CHECK (public.can_access_module(auth.uid(), 'documents'));
DROP POLICY IF EXISTS "document_room_members follow the documents module" ON public.document_room_members;
CREATE POLICY "document_room_members follow the documents module" ON public.document_room_members
  FOR ALL USING (public.can_access_module(auth.uid(), 'documents'))
  WITH CHECK (public.can_access_module(auth.uid(), 'documents'));
DROP POLICY IF EXISTS "document_room_access is read by the documents module" ON public.document_room_access;
CREATE POLICY "document_room_access is read by the documents module" ON public.document_room_access
  FOR SELECT USING (public.can_access_module(auth.uid(), 'documents'));

REVOKE ALL ON public.document_rooms, public.document_room_items, public.document_room_members, public.document_room_access FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_rooms, public.document_room_items, public.document_room_members TO authenticated;
GRANT SELECT ON public.document_room_access TO authenticated;
GRANT ALL ON public.document_rooms, public.document_room_items, public.document_room_members, public.document_room_access TO service_role;

-- ── manage_document_room: staff and agents, one function ────────────────────
CREATE OR REPLACE FUNCTION public.manage_document_room(
  p_action text,
  p_room_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_document_id uuid DEFAULT NULL,
  p_document_ids uuid[] DEFAULT NULL,
  p_member_id uuid DEFAULT NULL,
  p_member_name text DEFAULT NULL,
  p_member_email text DEFAULT NULL,
  p_permission text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_room document_rooms;
  v_member document_room_members;
  v_ids uuid[];
  v_added integer := 0;
  v_skipped integer := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'documents')) THEN
    RAISE EXCEPTION 'FORBIDDEN: the documents module is not open to this user' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'list' THEN
    RETURN jsonb_build_object('rooms', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'description', r.description, 'is_active', r.is_active,
        'created_at', r.created_at, 'updated_at', r.updated_at,
        'document_count', (SELECT count(*) FROM document_room_items i WHERE i.room_id = r.id),
        'member_count', (SELECT count(*) FROM document_room_members m WHERE m.room_id = r.id AND m.revoked_at IS NULL),
        'last_accessed_at', (SELECT max(m.last_accessed_at) FROM document_room_members m WHERE m.room_id = r.id)
      ) ORDER BY r.is_active DESC, r.name)
      FROM document_rooms r), '[]'::jsonb));
  END IF;

  IF p_action = 'create' THEN
    IF p_name IS NULL OR char_length(btrim(p_name)) < 2 THEN
      RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER: name (2–120 characters)';
    END IF;
    INSERT INTO document_rooms (name, description, created_by)
    VALUES (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), auth.uid())
    RETURNING * INTO v_room;
    IF p_document_ids IS NOT NULL AND array_length(p_document_ids, 1) > 0 THEN
      INSERT INTO document_room_items (room_id, document_id, added_by)
      SELECT v_room.id, d.id, auth.uid() FROM documents d WHERE d.id = ANY(p_document_ids)
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN public.manage_document_room('get', v_room.id);
  END IF;

  -- Every other action names a room.
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER: room_id (copy it from list)';
  END IF;
  SELECT * INTO v_room FROM document_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: no room %', p_room_id;
  END IF;

  IF p_action = 'get' THEN
    RETURN jsonb_build_object(
      'room', jsonb_build_object(
        'id', v_room.id, 'name', v_room.name, 'description', v_room.description,
        'is_active', v_room.is_active, 'created_at', v_room.created_at, 'updated_at', v_room.updated_at),
      'documents', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', d.id, 'title', d.title, 'file_name', d.file_name, 'file_type', d.file_type,
          'file_size_bytes', d.file_size_bytes, 'category', d.category, 'folder', d.folder,
          'added_at', i.added_at) ORDER BY d.folder NULLS LAST, d.title)
        FROM document_room_items i JOIN documents d ON d.id = i.document_id WHERE i.room_id = v_room.id), '[]'::jsonb),
      'members', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', m.id, 'name', m.name, 'email', m.email, 'permission', m.permission,
          'token', m.token, 'expires_at', m.expires_at, 'revoked_at', m.revoked_at,
          'access_count', m.access_count, 'last_accessed_at', m.last_accessed_at, 'created_at', m.created_at)
          ORDER BY m.revoked_at NULLS FIRST, m.created_at)
        FROM document_room_members m WHERE m.room_id = v_room.id), '[]'::jsonb),
      'recent_access', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'at', a.created_at, 'member', m.name, 'action', a.action,
          'document', coalesce(d.title, a.document_title)) ORDER BY a.created_at DESC)
        FROM (SELECT * FROM document_room_access x WHERE x.room_id = v_room.id ORDER BY x.created_at DESC LIMIT 50) a
        JOIN document_room_members m ON m.id = a.member_id
        LEFT JOIN documents d ON d.id = a.document_id), '[]'::jsonb)
    );
  END IF;

  IF p_action = 'update' THEN
    UPDATE document_rooms SET
      name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
      description = CASE WHEN p_description IS NULL THEN description ELSE nullif(btrim(p_description), '') END,
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
    WHERE id = v_room.id;
    RETURN public.manage_document_room('get', v_room.id);
  END IF;

  IF p_action = 'delete' THEN
    DELETE FROM document_rooms WHERE id = v_room.id;
    RETURN jsonb_build_object('deleted', true, 'room_id', v_room.id, 'name', v_room.name,
      'note', 'The documents are untouched — the room pointed at them.');
  END IF;

  IF p_action = 'add_documents' THEN
    v_ids := coalesce(p_document_ids, ARRAY[]::uuid[]);
    IF p_document_id IS NOT NULL THEN v_ids := v_ids || p_document_id; END IF;
    IF array_length(v_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER: document_id or document_ids';
    END IF;
    WITH ins AS (
      INSERT INTO document_room_items (room_id, document_id, added_by)
      SELECT v_room.id, d.id, auth.uid() FROM documents d WHERE d.id = ANY(v_ids)
      ON CONFLICT DO NOTHING
      RETURNING document_id)
    SELECT count(*) INTO v_added FROM ins;
    v_skipped := array_length(v_ids, 1) - v_added;
    UPDATE document_rooms SET updated_at = now() WHERE id = v_room.id;
    RETURN public.manage_document_room('get', v_room.id) || jsonb_build_object('added', v_added, 'skipped', v_skipped);
  END IF;

  IF p_action = 'remove_document' THEN
    IF p_document_id IS NULL THEN RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER: document_id'; END IF;
    DELETE FROM document_room_items WHERE room_id = v_room.id AND document_id = p_document_id;
    UPDATE document_rooms SET updated_at = now() WHERE id = v_room.id;
    RETURN public.manage_document_room('get', v_room.id);
  END IF;

  IF p_action = 'add_member' THEN
    IF p_member_name IS NULL OR char_length(btrim(p_member_name)) < 1 THEN
      RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER: member_name (who receives the link)';
    END IF;
    IF p_permission IS NOT NULL AND p_permission NOT IN ('view', 'download') THEN
      RAISE EXCEPTION 'INVALID_INPUT: permission is view or download';
    END IF;
    INSERT INTO document_room_members (room_id, name, email, permission, expires_at, invited_by)
    VALUES (v_room.id, btrim(p_member_name), nullif(btrim(coalesce(p_member_email, '')), ''),
            coalesce(p_permission, 'view'), p_expires_at, auth.uid())
    RETURNING * INTO v_member;
    RETURN jsonb_build_object(
      'member', jsonb_build_object('id', v_member.id, 'name', v_member.name, 'email', v_member.email,
        'permission', v_member.permission, 'token', v_member.token, 'expires_at', v_member.expires_at),
      'path', '/room/' || v_member.token,
      'note', 'Hand this personal link to ' || v_member.name || ' only — the access log is written in their name.');
  END IF;

  IF p_action = 'revoke_member' THEN
    IF p_member_id IS NULL THEN RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER: member_id'; END IF;
    UPDATE document_room_members SET revoked_at = coalesce(revoked_at, now())
    WHERE id = p_member_id AND room_id = v_room.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: no member % in this room', p_member_id; END IF;
    RETURN public.manage_document_room('get', v_room.id);
  END IF;

  RAISE EXCEPTION 'INVALID_INPUT: unknown action % (list, get, create, update, delete, add_documents, remove_document, add_member, revoke_member)', p_action;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.manage_document_room(text, uuid, text, text, boolean, uuid, uuid[], uuid, text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_document_room(text, uuid, text, text, boolean, uuid, uuid[], uuid, text, text, text, timestamptz) TO authenticated, service_role;

-- ── open_document_room: the recipient, on their personal link ───────────────
-- Fixed shape, never file_url, never a token. Writes the access log (open).
CREATE OR REPLACE FUNCTION public.open_document_room(p_token text, p_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_member document_room_members;
  v_room document_rooms;
BEGIN
  IF p_token IS NULL OR NOT public.token_is_plausible(p_token) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_LINK');
  END IF;
  SELECT * INTO v_member FROM document_room_members WHERE token = btrim(p_token);
  IF NOT FOUND OR v_member.revoked_at IS NOT NULL
     OR (v_member.expires_at IS NOT NULL AND v_member.expires_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_LINK');
  END IF;
  SELECT * INTO v_room FROM document_rooms WHERE id = v_member.room_id;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_CLOSED');
  END IF;

  UPDATE document_room_members
     SET access_count = access_count + 1, last_accessed_at = now()
   WHERE id = v_member.id;
  INSERT INTO document_room_access (room_id, member_id, action, user_agent)
  VALUES (v_room.id, v_member.id, 'open', left(p_user_agent, 300));

  RETURN jsonb_build_object(
    'ok', true,
    'room', jsonb_build_object('name', v_room.name, 'description', v_room.description),
    'member', jsonb_build_object('name', v_member.name, 'permission', v_member.permission, 'expires_at', v_member.expires_at),
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'file_name', d.file_name, 'file_type', d.file_type,
        'file_size_bytes', d.file_size_bytes, 'folder', d.folder, 'description', d.description,
        'updated_at', d.updated_at) ORDER BY d.folder NULLS LAST, d.title)
      FROM document_room_items i JOIN documents d ON d.id = i.document_id WHERE i.room_id = v_room.id), '[]'::jsonb)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.open_document_room(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_document_room(text, text) TO anon, authenticated, service_role;

-- ── resolve_document_room_file: document-share (service role) only ──────────
-- The edge function mints the short signed URL; this says whether it may, and
-- logs the act in the member's name. A view-only link never downloads.
CREATE OR REPLACE FUNCTION public.resolve_document_room_file(p_token text, p_document_id uuid, p_action text, p_user_agent text DEFAULT NULL)
RETURNS TABLE (file_url text, file_name text, file_type text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_member document_room_members;
  v_room document_rooms;
  v_doc documents;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: resolve_document_room_file is for document-share' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR NOT public.token_is_plausible(p_token) OR p_action NOT IN ('view', 'download') THEN
    RETURN;
  END IF;
  SELECT * INTO v_member FROM document_room_members WHERE token = btrim(p_token);
  IF NOT FOUND OR v_member.revoked_at IS NOT NULL
     OR (v_member.expires_at IS NOT NULL AND v_member.expires_at < now()) THEN
    RETURN;
  END IF;
  SELECT * INTO v_room FROM document_rooms WHERE id = v_member.room_id AND is_active;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_action = 'download' AND v_member.permission <> 'download' THEN RETURN; END IF;
  SELECT d.* INTO v_doc FROM documents d
    JOIN document_room_items i ON i.document_id = d.id AND i.room_id = v_room.id
   WHERE d.id = p_document_id;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO document_room_access (room_id, member_id, document_id, document_title, action, user_agent)
  VALUES (v_room.id, v_member.id, v_doc.id, v_doc.title, p_action, left(p_user_agent, 300));
  UPDATE document_room_members SET last_accessed_at = now() WHERE id = v_member.id;

  RETURN QUERY SELECT v_doc.file_url, v_doc.file_name, v_doc.file_type;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_document_room_file(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_document_room_file(text, uuid, text, text) TO service_role;
