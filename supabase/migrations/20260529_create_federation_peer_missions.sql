-- Federation Peer Missions Table
-- Stores mission metadata for federation peer agents
-- Allows agents to query their mission via /rest/resources/mission endpoint

CREATE TABLE IF NOT EXISTS federation_peer_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_id UUID NOT NULL REFERENCES a2a_peers(id) ON DELETE CASCADE UNIQUE,
  mission_id TEXT NOT NULL,
  mission_name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  focus_resources TEXT[] DEFAULT '{}',
  focus_tools TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for peer_id lookups (fast mission retrieval by peer)
CREATE INDEX IF NOT EXISTS idx_federation_peer_missions_peer_id ON federation_peer_missions(peer_id);

-- Enable RLS
ALTER TABLE federation_peer_missions ENABLE ROW LEVEL SECURITY;

-- Policy: Peers can read their own mission
CREATE POLICY "Peers can read own mission"
  ON federation_peer_missions
  FOR SELECT
  USING (peer_id = auth.uid());

-- Policy: Service role (used by edge functions) can read any mission
CREATE POLICY "Service role can read missions"
  ON federation_peer_missions
  FOR SELECT
  USING (TRUE);

-- Policy: Service role can insert/update missions
CREATE POLICY "Service role can manage missions"
  ON federation_peer_missions
  FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Service role can update missions"
  ON federation_peer_missions
  FOR UPDATE
  USING (TRUE);

-- Table comment for documentation
COMMENT ON TABLE federation_peer_missions IS 'Stores mission metadata for federation peer agents. Allows agents to discover their role and responsibilities via /rest/resources/mission endpoint.';
COMMENT ON COLUMN federation_peer_missions.mission_id IS 'Mission template ID (e.g., "growth-operator", "commerce-operator", "custom")';
COMMENT ON COLUMN federation_peer_missions.mission_name IS 'Human-readable mission name (e.g., "Growth Operator")';
COMMENT ON COLUMN federation_peer_missions.instructions IS 'Complete mission instructions and responsibilities';
COMMENT ON COLUMN federation_peer_missions.focus_resources IS 'Array of resource types to prioritize (e.g., ["briefing", "leads"])';
COMMENT ON COLUMN federation_peer_missions.focus_tools IS 'Array of skill names to prioritize (e.g., ["score_lead", "update_deal"])';
