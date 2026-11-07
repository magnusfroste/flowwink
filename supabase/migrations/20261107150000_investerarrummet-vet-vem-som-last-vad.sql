-- Investerarrummet vet vem som läst vad.
--
-- Peters backlogg (optic, 2026-11-05): "ge potentiella investerare en
-- professionell datarumsupplevelse med begränsad nedladdning, åtkomstlogg,
-- visningshistorik och dokumentnivåstyrning." Rummet (#919) gav länken,
-- loggen och view|download. Det som fattades:
--
--   * dokumentnivåstyrning — en medlem ser hela rummet ELLER en vald delmängd
--     (document_room_members.document_ids; NULL = allt). Samma filter i båda
--     läsarna: listan (open_document_room) och filen (resolve_…_file), så det
--     som inte visas kan inte heller hämtas med ett gissat dokument-id.
--   * visningshistorik — per person: varje öppning, visning, nedladdning,
--     och en sammanfattning per dokument (member_history). Och tvärtom, per
--     dokument i rummet: vem har sett det och vem har INTE det (coverage i
--     get) — frågan en ägare faktiskt ställer är "har X läst term sheetet?".
--   * mottagaren ser vad som är nytt sedan senast: open_document_room svarar
--     last_visit_at (värdet FÖRE den här öppningen) och varje dokuments
--     added_at, så sidan kan märka det som lagts till efter förra besöket.
--
-- Funktionerna byts hela (CREATE OR REPLACE), signaturen för
-- manage_document_room är oförändrad — skillens parametrar är desamma, två
-- actions tillkommer: set_member_documents och member_history.

ALTER TABLE public.document_room_members ADD COLUMN IF NOT EXISTS document_ids uuid[];
COMMENT ON COLUMN public.document_room_members.document_ids IS
  'Which of the room''s documents this member sees: NULL = every document in the room, otherwise exactly these (validated against document_room_items on write). The list and the file resolver apply the same filter.';

-- ── manage_document_room ────────────────────────────────────────────────────
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
  v_scope uuid[];
  v_outside integer;
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
          'added_at', i.added_at,
          -- Who has seen it (viewed or downloaded) and which live member in
          -- scope has not — the investor-room question, per document.
          'seen_by', coalesce((
            SELECT jsonb_agg(DISTINCT m.name) FROM document_room_access a
            JOIN document_room_members m ON m.id = a.member_id
            WHERE a.room_id = v_room.id AND a.document_id = d.id AND a.action IN ('view', 'download')), '[]'::jsonb),
          'unseen_by', coalesce((
            SELECT jsonb_agg(m.name ORDER BY m.name) FROM document_room_members m
            WHERE m.room_id = v_room.id AND m.revoked_at IS NULL
              AND (m.expires_at IS NULL OR m.expires_at >= now())
              AND (m.document_ids IS NULL OR d.id = ANY(m.document_ids))
              AND NOT EXISTS (SELECT 1 FROM document_room_access a
                              WHERE a.member_id = m.id AND a.document_id = d.id AND a.action IN ('view', 'download'))), '[]'::jsonb)
          ) ORDER BY d.folder NULLS LAST, d.title)
        FROM document_room_items i JOIN documents d ON d.id = i.document_id WHERE i.room_id = v_room.id), '[]'::jsonb),
      'members', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', m.id, 'name', m.name, 'email', m.email, 'permission', m.permission,
          'token', m.token, 'expires_at', m.expires_at, 'revoked_at', m.revoked_at,
          'access_count', m.access_count, 'last_accessed_at', m.last_accessed_at, 'created_at', m.created_at,
          'document_ids', CASE WHEN m.document_ids IS NULL THEN NULL ELSE to_jsonb(m.document_ids) END,
          'documents_seen', (SELECT count(DISTINCT a.document_id) FROM document_room_access a
                             WHERE a.member_id = m.id AND a.action IN ('view', 'download')))
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
    -- A member whose scope named it loses the pointer too; an empty scope
    -- stays empty (the member sees nothing) rather than silently widening.
    UPDATE document_room_members SET document_ids = array_remove(document_ids, p_document_id)
     WHERE room_id = v_room.id AND document_ids IS NOT NULL AND p_document_id = ANY(document_ids);
    UPDATE document_rooms SET updated_at = now() WHERE id = v_room.id;
    RETURN public.manage_document_room('get', v_room.id);
  END IF;

  IF p_action IN ('add_member', 'set_member_documents') AND p_document_ids IS NOT NULL AND array_length(p_document_ids, 1) > 0 THEN
    -- A scope names documents of THIS room only.
    SELECT count(*) INTO v_outside FROM unnest(p_document_ids) AS x(id)
     WHERE NOT EXISTS (SELECT 1 FROM document_room_items i WHERE i.room_id = v_room.id AND i.document_id = x.id);
    IF v_outside > 0 THEN
      RAISE EXCEPTION 'INVALID_INPUT: % of the document_ids are not in this room — add_documents first', v_outside;
    END IF;
    SELECT array_agg(DISTINCT x.id) INTO v_scope FROM unnest(p_document_ids) AS x(id);
  END IF;

  IF p_action = 'add_member' THEN
    IF p_member_name IS NULL OR char_length(btrim(p_member_name)) < 1 THEN
      RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER: member_name (who receives the link)';
    END IF;
    IF p_permission IS NOT NULL AND p_permission NOT IN ('view', 'download') THEN
      RAISE EXCEPTION 'INVALID_INPUT: permission is view or download';
    END IF;
    INSERT INTO document_room_members (room_id, name, email, permission, expires_at, invited_by, document_ids)
    VALUES (v_room.id, btrim(p_member_name), nullif(btrim(coalesce(p_member_email, '')), ''),
            coalesce(p_permission, 'view'), p_expires_at, auth.uid(), v_scope)
    RETURNING * INTO v_member;
    RETURN jsonb_build_object(
      'member', jsonb_build_object('id', v_member.id, 'name', v_member.name, 'email', v_member.email,
        'permission', v_member.permission, 'token', v_member.token, 'expires_at', v_member.expires_at,
        'document_ids', CASE WHEN v_member.document_ids IS NULL THEN NULL ELSE to_jsonb(v_member.document_ids) END),
      'path', '/room/' || v_member.token,
      'note', 'Hand this personal link to ' || v_member.name || ' only — the access log is written in their name.');
  END IF;

  IF p_action = 'set_member_documents' THEN
    IF p_member_id IS NULL THEN RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER: member_id'; END IF;
    -- No ids = the whole room (NULL). To show someone nothing, revoke them.
    UPDATE document_room_members SET document_ids = v_scope
     WHERE id = p_member_id AND room_id = v_room.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: no member % in this room', p_member_id; END IF;
    RETURN public.manage_document_room('get', v_room.id);
  END IF;

  IF p_action = 'revoke_member' THEN
    IF p_member_id IS NULL THEN RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER: member_id'; END IF;
    UPDATE document_room_members SET revoked_at = coalesce(revoked_at, now())
    WHERE id = p_member_id AND room_id = v_room.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: no member % in this room', p_member_id; END IF;
    RETURN public.manage_document_room('get', v_room.id);
  END IF;

  IF p_action = 'member_history' THEN
    IF p_member_id IS NULL THEN RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER: member_id'; END IF;
    SELECT * INTO v_member FROM document_room_members WHERE id = p_member_id AND room_id = v_room.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: no member % in this room', p_member_id; END IF;
    RETURN jsonb_build_object(
      'member', jsonb_build_object('id', v_member.id, 'name', v_member.name, 'email', v_member.email,
        'permission', v_member.permission, 'access_count', v_member.access_count,
        'last_accessed_at', v_member.last_accessed_at, 'created_at', v_member.created_at,
        'revoked_at', v_member.revoked_at, 'expires_at', v_member.expires_at),
      'per_document', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'document_id', s.document_id, 'document', s.title, 'views', s.views, 'downloads', s.downloads,
          'first_at', s.first_at, 'last_at', s.last_at) ORDER BY s.last_at DESC)
        FROM (
          SELECT a.document_id, coalesce(d.title, a.document_title) AS title,
                 count(*) FILTER (WHERE a.action = 'view') AS views,
                 count(*) FILTER (WHERE a.action = 'download') AS downloads,
                 min(a.created_at) AS first_at, max(a.created_at) AS last_at
          FROM document_room_access a LEFT JOIN documents d ON d.id = a.document_id
          WHERE a.member_id = v_member.id AND a.action IN ('view', 'download')
          GROUP BY a.document_id, coalesce(d.title, a.document_title)) s), '[]'::jsonb),
      'not_yet_seen', coalesce((
        SELECT jsonb_agg(d.title ORDER BY d.folder NULLS LAST, d.title)
        FROM document_room_items i JOIN documents d ON d.id = i.document_id
        WHERE i.room_id = v_room.id
          AND (v_member.document_ids IS NULL OR d.id = ANY(v_member.document_ids))
          AND NOT EXISTS (SELECT 1 FROM document_room_access a
                          WHERE a.member_id = v_member.id AND a.document_id = d.id AND a.action IN ('view', 'download'))), '[]'::jsonb),
      'history', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'at', a.created_at, 'action', a.action, 'document', coalesce(d.title, a.document_title),
          'user_agent', a.user_agent) ORDER BY a.created_at DESC)
        FROM (SELECT * FROM document_room_access x WHERE x.member_id = v_member.id ORDER BY x.created_at DESC LIMIT 500) a
        LEFT JOIN documents d ON d.id = a.document_id), '[]'::jsonb)
    );
  END IF;

  RAISE EXCEPTION 'INVALID_INPUT: unknown action % (list, get, create, update, delete, add_documents, remove_document, add_member, set_member_documents, revoke_member, member_history)', p_action;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.manage_document_room(text, uuid, text, text, boolean, uuid, uuid[], uuid, text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_document_room(text, uuid, text, text, boolean, uuid, uuid[], uuid, text, text, text, timestamptz) TO authenticated, service_role;

-- ── open_document_room: the member's scope, and what is new since last time ─
CREATE OR REPLACE FUNCTION public.open_document_room(p_token text, p_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_member document_room_members;
  v_room document_rooms;
  v_last_visit timestamptz;
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

  -- The visit before this one — what "new" is measured against.
  v_last_visit := v_member.last_accessed_at;
  UPDATE document_room_members
     SET access_count = access_count + 1, last_accessed_at = now()
   WHERE id = v_member.id;
  INSERT INTO document_room_access (room_id, member_id, action, user_agent)
  VALUES (v_room.id, v_member.id, 'open', left(p_user_agent, 300));

  RETURN jsonb_build_object(
    'ok', true,
    'room', jsonb_build_object('name', v_room.name, 'description', v_room.description),
    'member', jsonb_build_object('name', v_member.name, 'permission', v_member.permission, 'expires_at', v_member.expires_at),
    'last_visit_at', v_last_visit,
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'file_name', d.file_name, 'file_type', d.file_type,
        'file_size_bytes', d.file_size_bytes, 'folder', d.folder, 'description', d.description,
        'updated_at', d.updated_at, 'added_at', i.added_at,
        'seen', EXISTS (SELECT 1 FROM document_room_access a
                        WHERE a.member_id = v_member.id AND a.document_id = d.id AND a.action IN ('view', 'download'))
        ) ORDER BY d.folder NULLS LAST, d.title)
      FROM document_room_items i JOIN documents d ON d.id = i.document_id
      WHERE i.room_id = v_room.id
        AND (v_member.document_ids IS NULL OR d.id = ANY(v_member.document_ids))), '[]'::jsonb)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.open_document_room(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_document_room(text, text) TO anon, authenticated, service_role;

-- ── resolve_document_room_file: the same scope as the list ──────────────────
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
   WHERE d.id = p_document_id
     AND (v_member.document_ids IS NULL OR d.id = ANY(v_member.document_ids));
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO document_room_access (room_id, member_id, document_id, document_title, action, user_agent)
  VALUES (v_room.id, v_member.id, v_doc.id, v_doc.title, p_action, left(p_user_agent, 300));
  UPDATE document_room_members SET last_accessed_at = now() WHERE id = v_member.id;

  RETURN QUERY SELECT v_doc.file_url, v_doc.file_name, v_doc.file_type;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_document_room_file(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_document_room_file(text, uuid, text, text) TO service_role;
