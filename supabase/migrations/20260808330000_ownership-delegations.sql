-- Coverage is a statement about people, not an edit of a thousand rows.
--
-- The problem every CRM half-solves: Björn goes on vacation and Anna covers.
-- HubSpot and Odoo both answer with mass reassignment — move his records to
-- her, remember to move them back, discover in September what was forgotten.
-- The records were never the point. The ARRANGEMENT was: "Anna täcker för
-- Björn, 1–15 aug." One row says exactly that.
--
--   * The Mina lens includes records owned by people I currently cover —
--     Anna's "Mine" grows Björn's pipeline for two weeks and shrinks back on
--     its own. Nothing is reassigned, so nothing can be forgotten.
--   * "Active" is a date-range predicate, not a state. No cron flips anything
--     on or off; the row simply stops matching. Nothing to clean up, nothing
--     to go stale.
--   * Ownership columns never move. The chip keeps showing Björn — with a
--     "covered by Anna" hint — because transparency is the product: the left
--     hand must see WHO is acting for whom, not a silently swapped name.
--
-- CASCADE on both user FKs, deliberately: a delegation is a pointer between
-- two people, not business history. If either party is deleted the arrangement
-- is meaningless — unlike a contract, which outlives its author. (This is the
-- distinction 20260808290000 drew: CASCADE for personal artifacts, SET
-- NULL/detach for business records. delete-user handles CASCADE by itself.)
--
-- RLS: readable by any authenticated user — who covers whom is exactly the
-- kind of fact the whole office should see. Writable by the person being
-- covered (it is THEIR ownership being lent out) or an admin. The covering
-- colleague cannot grant themselves coverage: reach is taken from no one and
-- given by the owner.

CREATE TABLE IF NOT EXISTS public.ownership_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Whose ownership is being covered.
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Who covers.
  to_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ownership_delegations_not_self CHECK (from_user <> to_user),
  CONSTRAINT ownership_delegations_window CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS ownership_delegations_active_idx
  ON public.ownership_delegations (to_user, starts_on, ends_on);

ALTER TABLE public.ownership_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coverage is visible to colleagues" ON public.ownership_delegations;
CREATE POLICY "Coverage is visible to colleagues"
  ON public.ownership_delegations FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "The covered person or an admin manages coverage" ON public.ownership_delegations;
CREATE POLICY "The covered person or an admin manages coverage"
  ON public.ownership_delegations FOR ALL
  TO authenticated
  USING (from_user = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (from_user = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

COMMENT ON TABLE public.ownership_delegations IS
  'Time-boxed coverage: to_user acts for from_user between starts_on and ends_on (inclusive). Active = date-range predicate; nothing is reassigned and no job expires anything. The Mina lens includes covered owners'' records; ownership columns never move.';
