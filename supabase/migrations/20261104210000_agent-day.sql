-- The agent's day (2026-11-04). "What did Hermes do today?" had no answer: the
-- activity log knew a call came over MCP, not from which agent — the key id
-- travelled inside the arguments (input->>'_caller_api_key_id'). Now it is a
-- column, set by agent-execute on insert, and agent_day() answers per connected
-- agent: calls, outcomes, skills, reports published, the steps. Readable by an
-- admin and by the agent's owner — the person it acts for — nobody else.
ALTER TABLE public.agent_activity ADD COLUMN IF NOT EXISTS api_key_id uuid;
CREATE INDEX IF NOT EXISTS agent_activity_api_key_idx ON public.agent_activity (api_key_id, created_at DESC) WHERE api_key_id IS NOT NULL;

-- Backfill from where the id has been all along; idempotent (null rows only).
UPDATE public.agent_activity
   SET api_key_id = (input ->> '_caller_api_key_id')::uuid
 WHERE api_key_id IS NULL
   AND input ? '_caller_api_key_id'
   AND input ->> '_caller_api_key_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE OR REPLACE FUNCTION public.agent_day(p_peer_id uuid, p_since timestamptz DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peer public.a2a_peers;
  v_since timestamptz := coalesce(p_since, now() - interval '24 hours');
  v_lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
BEGIN
  SELECT * INTO v_peer FROM public.a2a_peers WHERE id = p_peer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No connected agent with that id', 'code', 'NOT_FOUND', 'retryable', false);
  END IF;
  -- Browser-called: the body is the guard. An admin, or the person the agent acts for.
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR (v_peer.owner_user_id IS NOT NULL AND v_peer.owner_user_id = auth.uid())) THEN
    RAISE EXCEPTION 'Only an admin or the agent''s owner can read what it did' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_peer.api_key_id IS NULL THEN
    RETURN jsonb_build_object('peer', jsonb_build_object('id', v_peer.id, 'name', v_peer.name), 'since', v_since,
      'calls', 0, 'note', 'This agent has no API key — nothing can have been logged for it.');
  END IF;
  RETURN (
    WITH rows AS (
      SELECT a.id, a.skill_name, a.status::text AS status, a.created_at, a.duration_ms, a.error_message,
             a.input ->> 'action' AS action,
             (a.output ->> 'hint') AS hint,
             (a.output ->> 'code') AS code
        FROM public.agent_activity a
       WHERE a.api_key_id = v_peer.api_key_id AND a.created_at >= v_since
    ),
    by_skill AS (
      SELECT skill_name, count(*) AS n, count(*) FILTER (WHERE status = 'failed') AS failed,
             count(*) FILTER (WHERE status = 'refused') AS refused
        FROM rows GROUP BY skill_name ORDER BY n DESC, skill_name LIMIT 30
    )
    SELECT jsonb_build_object(
      'peer', jsonb_build_object('id', v_peer.id, 'name', v_peer.name, 'owner_user_id', v_peer.owner_user_id, 'client_kind', v_peer.client_kind),
      'since', v_since,
      'calls', (SELECT count(*) FROM rows),
      'by_status', jsonb_build_object(
        'success', (SELECT count(*) FROM rows WHERE status = 'success'),
        'failed', (SELECT count(*) FROM rows WHERE status = 'failed'),
        'refused', (SELECT count(*) FROM rows WHERE status = 'refused'),
        'pending_approval', (SELECT count(*) FROM rows WHERE status = 'pending_approval')),
      'skills', coalesce((SELECT jsonb_agg(jsonb_build_object('name', skill_name, 'calls', n, 'failed', failed, 'refused', refused)) FROM by_skill), '[]'::jsonb),
      'reports_published', (SELECT count(*) FROM public.report_versions v WHERE v.published_by_kind = 'mcp' AND v.published_by = v_peer.name AND v.created_at >= v_since),
      'first_at', (SELECT min(created_at) FROM rows),
      'last_at', (SELECT max(created_at) FROM rows),
      'steps', coalesce((
        SELECT jsonb_agg(jsonb_build_object('at', created_at, 'skill', skill_name, 'action', action, 'status', status,
                                            'duration_ms', duration_ms, 'error', left(coalesce(error_message, hint), 300), 'code', code)
                         ORDER BY created_at DESC)
          FROM (SELECT * FROM rows ORDER BY created_at DESC LIMIT v_lim) s), '[]'::jsonb)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.agent_day(uuid, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_day(uuid, timestamptz, integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.agent_day(uuid, timestamptz, integer) IS
  'What a connected agent did since a time: calls, outcomes, skills, reports published, the steps. An admin or the agent''s owner.';

-- Proof, rolled back: the column is read, the owner may read, a stranger may not.
DO $$
DECLARE v_peer uuid; v_key uuid := gen_random_uuid(); v_out jsonb; v_owner uuid := '00000000-0000-4000-8000-00000000ab01';
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.api_keys (id, name, key_hash, key_prefix) VALUES (v_key, 'proof-agent', 'proof-hash', 'proof');
    INSERT INTO public.a2a_peers (name, url, status, api_key_id, owner_user_id) VALUES ('proof-agent', 'mcp://proof', 'active', v_key, v_owner) RETURNING id INTO v_peer;
    INSERT INTO public.agent_activity (agent, skill_name, input, output, status, api_key_id)
      VALUES ('mcp', 'list_reports', '{}'::jsonb, '{}'::jsonb, 'success', v_key),
             ('mcp', 'publish_report', '{}'::jsonb, '{"hint":"x"}'::jsonb, 'failed', v_key);
    v_out := public.agent_day(v_peer);
    IF (v_out ->> 'calls')::int <> 2 OR (v_out -> 'by_status' ->> 'failed')::int <> 1 THEN
      RAISE EXCEPTION 'proof: expected 2 calls / 1 failed, got %', v_out;
    END IF;
    PERFORM set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', v_owner), true);
    PERFORM set_config('role', 'authenticated', true);
    v_out := public.agent_day(v_peer);
    IF (v_out ->> 'calls')::int <> 2 THEN RAISE EXCEPTION 'proof: the owner should read, got %', v_out; END IF;
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000ab02"}', true);
    BEGIN
      PERFORM public.agent_day(v_peer);
      RAISE EXCEPTION 'proof: a stranger should be refused';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
END $$;
