-- A key has ONE state, and every page reads it the same way.
--
-- Until 2026-11-05 two pages told two stories about the same key. "Revoke" on
-- /admin/agents (revoke_agent) flipped the agent to `revoked` and moved the
-- key's expires_at to now — the row stayed, as history of who was connected
-- and how much it called. "Revoke" on Developer → MCP Keys DELETED the row. So
-- after Peter revoked agents at optic, the Agents page listed them as revoked
-- while Developer still counted them among "Active Keys" with an "Expires 4
-- weeks ago" badge, and nothing said they had been revoked at all: an expiry
-- that was set by a person and one that a date reached looked identical.
--
-- The state is now written on the key row:
--   revoked_at   when a person (or the platform) took the key out of service
-- and derived the same way everywhere (src/lib/key-state.ts):
--   revoked      revoked_at is set
--   expired      expires_at has passed (and nobody revoked it)
--   active       otherwise
--
-- Both "Revoke" buttons do the same thing: mark the key revoked, stop it in the
-- gateway, flip its agent to `revoked`. The row stays. Deleting the row is a
-- separate action, offered only for a key that is already out of service.

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

COMMENT ON COLUMN public.api_keys.revoked_at IS
  'When a person or the platform took the key out of service. A revoked key is refused by the gateway regardless of expires_at; the row stays as history until deleted.';

-- Backfill: a key whose agent was revoked before this column existed was
-- revoked when the agent was. Guarded by IS NULL, so a re-run changes nothing.
UPDATE public.api_keys k
   SET revoked_at = COALESCE(p.updated_at, now())
  FROM public.a2a_peers p
 WHERE p.api_key_id = k.id
   AND p.status = 'revoked'
   AND k.revoked_at IS NULL;

-- Revoking the AGENT marks its key revoked (not merely expired).
CREATE OR REPLACE FUNCTION public.revoke_agent(p_peer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_peer public.a2a_peers;
BEGIN
  SELECT * INTO v_peer FROM a2a_peers WHERE id = p_peer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_not_found'; END IF;
  IF NOT (auth.role() = 'service_role' OR v_peer.owner_user_id = auth.uid() OR can_access_module(auth.uid(), 'federation')) THEN
    RAISE EXCEPTION 'Only the agent''s owner or someone granted the Agents (federation) module can revoke it';
  END IF;
  UPDATE a2a_peers SET status = 'revoked', updated_at = now() WHERE id = p_peer_id;
  IF v_peer.api_key_id IS NOT NULL THEN
    UPDATE api_keys
       SET revoked_at = COALESCE(revoked_at, now()),
           expires_at = LEAST(COALESCE(expires_at, now()), now())
     WHERE id = v_peer.api_key_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'peer_id', p_peer_id, 'status', 'revoked', 'name', v_peer.name);
END $$;
REVOKE ALL ON FUNCTION public.revoke_agent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_agent(uuid) TO authenticated, service_role;

-- Revoking the KEY revokes the agent(s) that hold it — the mirror of the above,
-- so Developer → MCP Keys and /admin/agents can never disagree. Who may: the
-- same people as revoke_agent — the key's creator, anyone the matrix grants
-- the Agents (federation) module, or the service role. Idempotent: revoking a revoked
-- key keeps its original revoked_at.
CREATE OR REPLACE FUNCTION public.revoke_api_key(p_key_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_key public.api_keys;
  v_peers int := 0;
BEGIN
  SELECT * INTO v_key FROM api_keys WHERE id = p_key_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'key_not_found'; END IF;
  IF NOT (auth.role() = 'service_role' OR v_key.created_by = auth.uid() OR can_access_module(auth.uid(), 'federation')) THEN
    RAISE EXCEPTION 'Only the key''s creator or someone granted the Agents (federation) module can revoke it';
  END IF;
  UPDATE api_keys
     SET revoked_at = COALESCE(revoked_at, now()),
         expires_at = LEAST(COALESCE(expires_at, now()), now())
   WHERE id = p_key_id;
  UPDATE a2a_peers SET status = 'revoked', updated_at = now()
   WHERE api_key_id = p_key_id AND status <> 'revoked';
  GET DIAGNOSTICS v_peers = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'key_id', p_key_id, 'name', v_key.name, 'agents_revoked', v_peers);
END $$;
REVOKE ALL ON FUNCTION public.revoke_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(uuid) TO authenticated, service_role;
