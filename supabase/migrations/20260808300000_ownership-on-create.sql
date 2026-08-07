-- An owner nobody set is a lens nobody can use.
--
-- The "Mina/Alla" plan (see the ownership-scoping section in
-- docs/operators/session-memory.md — both sessions measured and converged
-- independently) starts from a hard fact: the ownership columns exist and are
-- EMPTY. leads.assigned_to 0/7, deals.owner_id 0/5, companies.account_owner
-- 0/2 at measurement. A "my deals" filter built on that shows every
-- salesperson an empty list — a filter that reads as a security feature
-- working correctly, which is the worst failure shape this codebase knows.
--
-- Step 0, deliberately WITHOUT any filter: make ownership exist.
--
--   1. Whoever creates a record owns it, unless they said otherwise. A BEFORE
--      INSERT trigger fills the owner column from auth.uid() ONLY when the
--      caller left it NULL — an explicit owner is never overwritten (the
--      trigger-fills-only-NULL precedent from contracts_assign_number).
--   2. The agent path stays honest: under the service role auth.uid() is
--      NULL, and the trigger then leaves the owner NULL rather than guessing.
--      An unowned record is visible truth; a wrongly-owned one is a lie with
--      an audit trail.
--   3. Backfill from created_by where an owner is missing — the best guess
--      that exists, and a traceable one. Never over an existing owner. (On the
--      instance this was written against, created_by is itself NULL
--      everywhere — the delete-user detach tests nulled it — so the backfill
--      is a no-op there and meaningful on the rest of the fleet.)
--
-- WHAT THIS MIGRATION MUST NEVER GROW: an RLS policy. Ownership here is a
-- lens and a label — Odoo's mistake is wiring "my records" into record rules,
-- which is where salespeople stop seeing each other's pipelines and start
-- calling the same customer twice. Visibility stays a security decision;
-- "mine" stays a query filter. The guardrail suite enforces this.

CREATE OR REPLACE FUNCTION public.assign_owner_on_insert()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  -- Service role / direct DB: no user, no guess.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'leads' THEN
    IF NEW.assigned_to IS NULL THEN NEW.assigned_to := v_uid; END IF;
  ELSIF TG_TABLE_NAME = 'deals' THEN
    IF NEW.owner_id IS NULL THEN NEW.owner_id := v_uid; END IF;
  ELSIF TG_TABLE_NAME = 'companies' THEN
    IF NEW.account_owner IS NULL THEN NEW.account_owner := v_uid; END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_assign_owner ON public.leads;
CREATE TRIGGER leads_assign_owner
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.assign_owner_on_insert();

DROP TRIGGER IF EXISTS deals_assign_owner ON public.deals;
CREATE TRIGGER deals_assign_owner
  BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.assign_owner_on_insert();

DROP TRIGGER IF EXISTS companies_assign_owner ON public.companies;
CREATE TRIGGER companies_assign_owner
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.assign_owner_on_insert();

-- Backfill: creator as owner, only where no owner exists. Idempotent — a
-- second run finds nothing to do.
UPDATE public.leads     SET assigned_to  = created_by WHERE assigned_to  IS NULL AND created_by IS NOT NULL;
UPDATE public.deals     SET owner_id     = created_by WHERE owner_id     IS NULL AND created_by IS NOT NULL;
UPDATE public.companies SET account_owner = created_by WHERE account_owner IS NULL AND created_by IS NOT NULL;

COMMENT ON COLUMN public.leads.assigned_to IS
  'Owner (profiles/auth uid). Auto-set to the creator on insert when not supplied; NULL when created by an agent/service path. A lens and a label — never referenced by RLS.';
COMMENT ON COLUMN public.deals.owner_id IS
  'Owner (profiles/auth uid). Auto-set to the creator on insert when not supplied; NULL when created by an agent/service path. A lens and a label — never referenced by RLS.';
COMMENT ON COLUMN public.companies.account_owner IS
  'Account owner (profiles/auth uid). Auto-set to the creator on insert when not supplied; NULL when created by an agent/service path. A lens and a label — never referenced by RLS.';
