-- Agenten har en ägare.
--
-- Peters Hermes uppträder som en anonym "extern agent" fast vi gav den ett namn
-- i inbjudan. Namnet finns (a2a_peers.name, kopplat till API-nyckeln som varje
-- anrop bär), men agenten får aldrig veta det, och ingen rad säger VEM som kör
-- den: api_keys.created_by är den admin som klickade fram prompten. Nu när
-- Svante kopplar sin Claude och Anna sin ChatGPT behövs modellen: en agent är en
-- principal med en ägare, och når aldrig längre än människan bakom.
--
--   1. a2a_peers.owner_user_id — vem agenten tillhör (backfill: nyckelns
--      skapare). a2a_peers.client_kind — vilken klient (claude, chatgpt, cursor,
--      opencode, gemini, hermes, copilot, openclaw, other), bara för visning.
--   2. Ägaren läser sina egna agenter och sina egna nycklars metadata (prefix,
--      senast använd). Federation-modulens roller läser alla, som förut.
--   3. revoke_agent(p_peer_id): ägaren eller federation-modulen drar in — nyckeln
--      går ut nu, peer-raden blir revoked. Gatewayen avvisar utgångna nycklar.
--
-- Räckvidden upprätthålls i gatewayen (mcp-server): varje skill-anrop från en
-- agent med ägare prövas mot can_access_module(ägaren, skillens modul).

ALTER TABLE public.a2a_peers
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS client_kind text;
CREATE INDEX IF NOT EXISTS a2a_peers_owner_idx ON public.a2a_peers (owner_user_id) WHERE owner_user_id IS NOT NULL;
COMMENT ON COLUMN public.a2a_peers.owner_user_id IS
  'The person this agent acts for. The gateway passes it as the caller and refuses skills outside their module access; the UI shows "Hermes (Peter)".';

-- Backfill: the agents minted so far belong to whoever minted the key.
UPDATE public.a2a_peers p
   SET owner_user_id = k.created_by
  FROM public.api_keys k
 WHERE p.api_key_id = k.id AND p.owner_user_id IS NULL AND k.created_by IS NOT NULL;

DROP POLICY IF EXISTS "Owners see their own agents" ON public.a2a_peers;
CREATE POLICY "Owners see their own agents" ON public.a2a_peers
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "Owners see their own agent keys" ON public.api_keys;
CREATE POLICY "Owners see their own agent keys" ON public.api_keys
  FOR SELECT TO authenticated USING (created_by = auth.uid());
DROP POLICY IF EXISTS "Owners see their own agent missions" ON public.federation_peer_missions;
CREATE POLICY "Owners see their own agent missions" ON public.federation_peer_missions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.a2a_peers p WHERE p.id = federation_peer_missions.peer_id AND p.owner_user_id = auth.uid()));

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
    UPDATE api_keys SET expires_at = LEAST(COALESCE(expires_at, now()), now()) WHERE id = v_peer.api_key_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'peer_id', p_peer_id, 'status', 'revoked', 'name', v_peer.name);
END $$;
REVOKE ALL ON FUNCTION public.revoke_agent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_agent(uuid) TO authenticated, service_role;
