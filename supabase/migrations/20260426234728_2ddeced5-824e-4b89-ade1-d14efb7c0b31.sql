-- Federation v3: peer-to-peer invitations (transitive autonomy)
-- OpenClaw can invite sub-agents via the invite_peer_agent skill.
-- Trust model: full transitive (inheriting peer gets same toolset_groups).
-- Revocation: orphaned (revoking inviter does NOT cascade — sub-peers survive).

ALTER TABLE public.a2a_peers
  ADD COLUMN IF NOT EXISTS invited_by_peer_id uuid REFERENCES public.a2a_peers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invitation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS toolset_groups text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS idx_a2a_peers_invited_by ON public.a2a_peers(invited_by_peer_id) WHERE invited_by_peer_id IS NOT NULL;

-- Audit table — who invited whom, when, with what scope
CREATE TABLE IF NOT EXISTS public.peer_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_peer_id uuid REFERENCES public.a2a_peers(id) ON DELETE SET NULL,
  invitee_peer_id uuid NOT NULL REFERENCES public.a2a_peers(id) ON DELETE CASCADE,
  invitee_name text NOT NULL,
  invitee_url text,
  toolset_groups text[] NOT NULL DEFAULT ARRAY[]::text[],
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_peer_invitations_inviter ON public.peer_invitations(inviter_peer_id);
CREATE INDEX IF NOT EXISTS idx_peer_invitations_invitee ON public.peer_invitations(invitee_peer_id);

ALTER TABLE public.peer_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage peer invitations" ON public.peer_invitations;
CREATE POLICY "Admins manage peer invitations"
  ON public.peer_invitations
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "System reads peer invitations" ON public.peer_invitations;
CREATE POLICY "System reads peer invitations"
  ON public.peer_invitations
  FOR SELECT
  USING (true);

-- View: invitation tree (recursive) for /admin/federation UI
CREATE OR REPLACE VIEW public.peer_invitation_tree AS
WITH RECURSIVE tree AS (
  SELECT
    p.id,
    p.name,
    p.status::text AS status,
    p.invited_by_peer_id,
    p.toolset_groups,
    p.created_at,
    0 AS depth,
    ARRAY[p.id] AS path
  FROM public.a2a_peers p
  WHERE p.invited_by_peer_id IS NULL

  UNION ALL

  SELECT
    p.id,
    p.name,
    p.status::text,
    p.invited_by_peer_id,
    p.toolset_groups,
    p.created_at,
    t.depth + 1,
    t.path || p.id
  FROM public.a2a_peers p
  JOIN tree t ON p.invited_by_peer_id = t.id
  WHERE NOT (p.id = ANY(t.path))   -- guard against cycles
)
SELECT * FROM tree;