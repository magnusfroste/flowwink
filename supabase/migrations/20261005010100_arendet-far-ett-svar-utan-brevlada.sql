-- Ärendet får ett svar utan brevlåda.
--
-- Den enda skill som skrev en kommentar på ett supportärende var
-- reply_to_ticket_via_email, och den kräver en kopplad brevlåda (Composio).
-- En agent på en instans utan mejlkoppling kunde alltså registrera, triagera
-- och stänga ärenden men aldrig svara på dem — och en intern anteckning gick
-- inte heller att skriva. Processbatteriet (support-to-resolution) spelade
-- svaret som admin-UI (fynd 2026-10-05).
--
-- add_ticket_comment skriver raden i ticket_comments precis som FlowBox gör.
-- SLA-triggern på tabellen (svarstiden mäts från svaret) gör resten: ett
-- publikt svar stoppar första-svar-klockan, en intern anteckning gör det inte.
-- Kunden läser publika svar i kundportalen (useMyTickets).
--
-- p_created_at finns för import av historik och är bara tillåten bakåt i tiden.

CREATE OR REPLACE FUNCTION public.add_ticket_comment(
  p_ticket_id uuid,
  p_content text,
  p_is_internal boolean DEFAULT false,
  p_author_name text DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid; v_when timestamptz := COALESCE(p_created_at, now()); v_status text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'tickets')) THEN
    RAISE EXCEPTION 'Requires the tickets module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_ticket_id IS NULL OR btrim(COALESCE(p_content, '')) = '' THEN
    RAISE EXCEPTION 'ticket_id and a non-empty content are required';
  END IF;
  IF v_when > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'created_at is in the future — it only back-dates an imported comment';
  END IF;
  SELECT status INTO v_status FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found'; END IF;

  INSERT INTO ticket_comments (ticket_id, content, is_internal, author_type, author_id, author_name, created_at)
  VALUES (p_ticket_id, btrim(p_content), COALESCE(p_is_internal, false), 'agent', auth.uid(),
          COALESCE(NULLIF(btrim(p_author_name), ''), 'Support'), v_when)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'comment_id', v_id, 'ticket_id', p_ticket_id,
    'is_internal', COALESCE(p_is_internal, false), 'ticket_status', v_status,
    'visible_to_customer', NOT COALESCE(p_is_internal, false));
END $$;

REVOKE ALL ON FUNCTION public.add_ticket_comment(uuid, text, boolean, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_ticket_comment(uuid, text, boolean, text, timestamptz) TO authenticated, service_role;
