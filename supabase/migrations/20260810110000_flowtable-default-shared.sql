-- Flowtable follows the platform's rule: shared is the default, private is the choice.
--
-- Documents already work this way — `documents.visibility` defaults to 'shared'
-- and a colleague marks the exception. Flowtable was the odd one out:
-- `workspace_shared` defaulted to FALSE, so every base was born invisible to
-- everyone but its author, and staying private required no decision at all
-- while sharing required one per base.
--
-- That inverts the point of the workspace. Someone who needs a private sheet
-- already has one somewhere else; what a shared operating platform is FOR is
-- the transparency and the context — including the context an agent needs to
-- act on the business's behalf. A base nobody can see is a base FlowPilot
-- cannot reason about either.
--
-- The whole tree already hangs off one helper: can_access_flowtable_base()
-- resolves "owner OR shared", and flowtable_tables / _fields / _records all
-- defer to it. So the default is the only thing that has to move; no policy
-- changes, no new column.
--
-- EXISTING PRIVATE BASES ARE LEFT ALONE — deliberately, and this is the part
-- worth arguing about. A base sitting at FALSE today might be private by
-- deliberate choice or merely by inheriting the old default, and nothing in the
-- schema records which. The failure modes are asymmetric: publishing a sheet
-- someone meant to keep private cannot be taken back, while a base that stays
-- private one day longer is one switch away from shared. So the default moves
-- forward and history stays untouched — the same reasoning as the email
-- allowlist's fail-closed and the resumption guard's idempotent-only list.
--
-- The UI carries the other half: with shared as the norm, the informative badge
-- is a LOCK on the exception, not a group icon on the rule.
--
-- Idempotent.
ALTER TABLE public.flowtable_bases
  ALTER COLUMN workspace_shared SET DEFAULT true;

COMMENT ON COLUMN public.flowtable_bases.workspace_shared IS
  'Visible to every colleague. Defaults to true — sharing is the norm on this platform, as with documents.visibility. Set false to make a base private; existing private bases were not converted when this default flipped.';
