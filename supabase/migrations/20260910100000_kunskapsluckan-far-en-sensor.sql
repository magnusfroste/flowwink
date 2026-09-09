-- Kunskapsluckan får en sensor.
--
-- Chatten och mejlutkasten bär sedan i dag ett grundningskvitto
-- (chat_messages.metadata.grounding, outbound_communications.metadata.grounding
-- — se _shared/retrieval/receipt.ts). Den här funktionen läser kvittona och
-- svarar på frågan Anna (Resta Gård) annars får leta efter för hand: vilka
-- frågor fick svar utan grund, vilka mejl fick "behöver en människa", och hur
-- täckt är kunskapsbasen. Räknar bara — ingen AI, inga datum utöver fönstret.
-- Svar utan kvitto (skrivna före 2026-09-10) räknas som 'unknown', aldrig som
-- grundade: frånvaro av kvitto är inte bevis.

CREATE OR REPLACE FUNCTION public.knowledge_gap_report(p_days integer DEFAULT 14, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(COALESCE(p_days, 14), 1));
  v_lim integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_chat jsonb; v_chat_totals jsonb; v_mail jsonb; v_mail_totals jsonb; v_kb jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR can_access_module(auth.uid(),'knowledgeBase')) THEN
    RAISE EXCEPTION 'Only staff can read the knowledge gap report';
  END IF;

  -- Varje besökarfråga paras med nästa assistentsvar i samma konversation.
  CREATE TEMP TABLE IF NOT EXISTS _gap_pairs ON COMMIT DROP AS
  SELECT u.id AS question_id, u.conversation_id, u.created_at, left(u.content, 300) AS question,
         a.metadata->'grounding' AS receipt,
         CASE WHEN a.id IS NULL THEN 'unanswered'
              WHEN a.metadata->'grounding' IS NULL THEN 'unknown'
              WHEN (a.metadata->'grounding'->>'grounded') = 'true' THEN 'grounded'
              ELSE 'ungrounded' END AS state
    FROM public.chat_messages u
    LEFT JOIN LATERAL (
      SELECT x.id, x.metadata FROM public.chat_messages x
       WHERE x.conversation_id = u.conversation_id AND x.role = 'assistant' AND x.created_at > u.created_at
       ORDER BY x.created_at LIMIT 1
    ) a ON true
   WHERE u.role = 'user' AND u.created_at >= v_since AND length(u.content) > 8;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('at', created_at, 'question', question, 'state', state, 'conversation_id', conversation_id,
                                               'mode', receipt->>'mode') ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_chat
    FROM (SELECT * FROM _gap_pairs WHERE state <> 'grounded' ORDER BY created_at DESC LIMIT v_lim) g;

  SELECT jsonb_build_object(
    'questions', count(*),
    'grounded', count(*) FILTER (WHERE state = 'grounded'),
    'ungrounded', count(*) FILTER (WHERE state = 'ungrounded'),
    'unknown', count(*) FILTER (WHERE state = 'unknown'),
    'unanswered', count(*) FILTER (WHERE state = 'unanswered'),
    'top_sources', (SELECT COALESCE(jsonb_agg(jsonb_build_object('title', t.title, 'table', t.tbl, 'hits', t.n) ORDER BY t.n DESC), '[]'::jsonb)
                      FROM (SELECT s->>'title' AS title, s->>'table' AS tbl, count(*) AS n
                              FROM _gap_pairs p, jsonb_array_elements(COALESCE(p.receipt->'sources','[]'::jsonb)) s
                             GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10) t)
  ) INTO v_chat_totals FROM _gap_pairs;

  -- Mejl: utkast där svararen sa "behöver en människa" eller saknade grund.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('at', created_at, 'subject', subject, 'recipient', recipient,
                                               'needs_person', (metadata->>'needs_person')::boolean, 'thread_id', thread_id,
                                               'state', CASE WHEN metadata->'grounding' IS NULL THEN 'unknown'
                                                             WHEN (metadata->'grounding'->>'grounded') = 'true' THEN 'grounded' ELSE 'ungrounded' END)
                            ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_mail
    FROM (SELECT * FROM public.outbound_communications
           WHERE source = 'flowpilot-draft' AND created_at >= v_since
             AND ((metadata->>'needs_person')::boolean IS TRUE OR (metadata->'grounding'->>'grounded') = 'false')
           ORDER BY created_at DESC LIMIT v_lim) m;

  SELECT jsonb_build_object(
    'drafts', count(*),
    'needs_person', count(*) FILTER (WHERE (metadata->>'needs_person')::boolean IS TRUE),
    'ungrounded', count(*) FILTER (WHERE (metadata->'grounding'->>'grounded') = 'false'),
    'unknown', count(*) FILTER (WHERE metadata->'grounding' IS NULL)
  ) INTO v_mail_totals
  FROM public.outbound_communications WHERE source = 'flowpilot-draft' AND created_at >= v_since;

  SELECT jsonb_build_object(
    'articles', count(*),
    'published', count(*) FILTER (WHERE is_published),
    'in_chat', count(*) FILTER (WHERE is_published AND include_in_chat),
    'never_cited', (SELECT count(*) FROM public.kb_articles k
                     WHERE k.is_published AND k.include_in_chat
                       AND NOT EXISTS (SELECT 1 FROM _gap_pairs p, jsonb_array_elements(COALESCE(p.receipt->'sources','[]'::jsonb)) s
                                        WHERE s->>'table' = 'kb_articles' AND s->>'id' = k.id::text))
  ) INTO v_kb FROM public.kb_articles;

  DROP TABLE IF EXISTS _gap_pairs;

  RETURN jsonb_build_object(
    'success', true, 'since', v_since, 'days', GREATEST(COALESCE(p_days, 14), 1),
    'chat', v_chat_totals || jsonb_build_object('gaps', v_chat),
    'email', v_mail_totals || jsonb_build_object('gaps', v_mail),
    'kb', v_kb,
    'reading_guide', 'ungrounded = answered with no retrieved source; unknown = answered before receipts existed (not evidence either way); needs_person = the responder declined to answer from the sources. never_cited counts chat-enabled articles no receipt has named in the window — candidates for rewriting the question, not for deletion.'
  );
END; $function$;

GRANT EXECUTE ON FUNCTION public.knowledge_gap_report(integer, integer) TO authenticated, service_role;
