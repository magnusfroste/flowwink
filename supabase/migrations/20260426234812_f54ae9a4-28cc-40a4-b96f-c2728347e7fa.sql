-- Recreate view with explicit security_invoker so it respects the caller's RLS
DROP VIEW IF EXISTS public.peer_invitation_tree;
CREATE VIEW public.peer_invitation_tree
WITH (security_invoker = true)
AS
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
  WHERE NOT (p.id = ANY(t.path))
)
SELECT * FROM tree;