-- Nyckeln ligger aldrig i klartext. Agenten utan ägare får en.
--
-- 1. api_keys.key_raw. Migrationen 2026-07-09 nollade kolumnen EN gång och
--    kallade den "never populated" — men federation-invite-peer skrev den
--    fortfarande (sedan 2026-05-05). Varje agent som bjudits in sedan juli har
--    alltså haft sin nyckel i klartext i api_keys, och #649:s policy "Owners see
--    their own agent keys" gjorde raden läsbar för ägaren. Räkna, nolla, släpp
--    kolumnen: en kolumn som inte finns kan ingen skrivare fylla på nytt.
--    Utgå från att nycklar med key_raw satt har varit exponerade — fleet:status
--    listar dem per instans (namn + prefix) som roteringslista, kör den FÖRE
--    db push.
--
-- 2. a2a_peers.mcp_api_key. Samma klass: inbjudan skrev råa nyckeln även här,
--    och raden är läsbar för ägaren och för alla med Agents-modulen. Nollas.
--    Kolumnen stannar för EN skrivare — openclaw-responses, som behöver en rå
--    callback-nyckel att lämna till Clawen i uppdragsprompten (den utgående
--    kanten) och myntar en ny när den saknas. Inbjudna agenter får sin nyckel
--    en gång, i svaret, och sedan aldrig mer från databasen.
--
-- 3. set_agent_owner(p_peer_id, p_owner_user_id). Backfillen i #649 tog ägaren
--    från api_keys.created_by; nycklar med NULL där fick ingen ägare och
--    därmed full räckvidd ("every enabled module" i briefingen). Hellre än att
--    utfärda nycklarna på nytt: Agents-sidan visar "ingen ägare — full
--    räckvidd" och låter någon med Agents-modulen sätta ägaren. Sätter både
--    a2a_peers.owner_user_id (räckvidd, attribution) och api_keys.created_by
--    (ägarens RLS på nyckelns metadata) så att de två aldrig säger olika.

DO $$
DECLARE
  v_keys int := 0;
  v_peers int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'api_keys' AND column_name = 'key_raw') THEN
    EXECUTE 'SELECT count(*) FROM public.api_keys WHERE key_raw IS NOT NULL' INTO v_keys;
  END IF;
  SELECT count(*) INTO v_peers FROM public.a2a_peers WHERE mcp_api_key IS NOT NULL;
  RAISE NOTICE 'plaintext keys at rest before this migration: api_keys.key_raw=% a2a_peers.mcp_api_key=% — treat those keys as exposed and rotate them (revoke + reconnect the agent)', v_keys, v_peers;
END $$;

ALTER TABLE public.api_keys DROP COLUMN IF EXISTS key_raw;

UPDATE public.a2a_peers SET mcp_api_key = NULL WHERE mcp_api_key IS NOT NULL;
COMMENT ON COLUMN public.a2a_peers.mcp_api_key IS
  'Callback credential for the OUTBOUND leg only: openclaw-responses mints it when dispatching a mission and hands it to the Claw. Never written by the invite path — an invited agent sees its key once, in the response. Nulled 2026-10-08.';

CREATE OR REPLACE FUNCTION public.set_agent_owner(p_peer_id uuid, p_owner_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_peer public.a2a_peers;
  v_owner_name text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'federation')) THEN
    RAISE EXCEPTION 'Only someone granted the Agents (federation) module can set an agent''s owner';
  END IF;
  SELECT * INTO v_peer FROM a2a_peers WHERE id = p_peer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_not_found'; END IF;
  SELECT COALESCE(full_name, email) INTO v_owner_name FROM profiles WHERE id = p_owner_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'owner_not_found'; END IF;
  UPDATE a2a_peers SET owner_user_id = p_owner_user_id, updated_at = now() WHERE id = p_peer_id;
  IF v_peer.api_key_id IS NOT NULL THEN
    UPDATE api_keys SET created_by = p_owner_user_id WHERE id = v_peer.api_key_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'peer_id', p_peer_id, 'name', v_peer.name, 'owner_user_id', p_owner_user_id, 'owner_name', v_owner_name);
END $$;
REVOKE ALL ON FUNCTION public.set_agent_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_agent_owner(uuid, uuid) TO authenticated, service_role;
