-- Add transport tagging + auto-discovery link to api_keys for MCP inbound peers
DO $$ BEGIN
  CREATE TYPE peer_transport AS ENUM ('a2a', 'openresponses', 'mcp_inbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.a2a_peers
  ADD COLUMN IF NOT EXISTS transport peer_transport NOT NULL DEFAULT 'a2a',
  ADD COLUMN IF NOT EXISTS api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS a2a_peers_api_key_id_unique
  ON public.a2a_peers(api_key_id) WHERE api_key_id IS NOT NULL;

-- Allow URL to be empty for inbound MCP peers (they don't have a callback URL — they call us)
ALTER TABLE public.a2a_peers ALTER COLUMN url DROP NOT NULL;
ALTER TABLE public.a2a_peers ALTER COLUMN outbound_token DROP NOT NULL;