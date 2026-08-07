-- Ownership flows down the chain, so nobody sets it twice.
--
-- Step 1 of the Mina/Alla plan (step 0: 20260808300000). The chain
-- lead→deal→quote is real now — deals carry lead_id, quotes carry deal_id and
-- lead_id, contracts carry quote_id — so the owner can be DERIVED instead of
-- asked for. A salesperson owns the lead; the deal on that lead is theirs; the
-- quote on that deal is theirs. One decision, made once, at the top.
--
-- THE INHERITANCE RULE OUTRANKS THE CREATOR RULE, deliberately. When an admin
-- (or FlowPilot) creates a deal on Anna's lead, the deal is Anna's — the
-- relationship owner's, not the typist's. HubSpot defaults to the typist and
-- hides inheritance behind a setting; Odoo carries the salesperson from lead
-- to opportunity but not beyond. We carry it the whole way.
--
-- AND INHERITANCE APPLIES ON THE AGENT PATH TOO. Step 0's rule was "the agent
-- never GUESSES" — auth.uid() is NULL under the service role, so the
-- creator-fallback stays off. But inheriting is not guessing: the lead's owner
-- is a human decision already made. An agent creating a deal on Anna's lead
-- now correctly hands it to Anna; an agent creating an orphan deal still
-- leaves it unowned.
--
-- quotes gets an owner column of its own rather than a join-time derivation:
-- a quote can outlive its deal link (ON DELETE SET NULL), the Mina lens needs
-- one indexed column to filter on, and ownership must be REASSIGNABLE per
-- quote without touching the deal. ON DELETE SET NULL puts it in the family
-- delete-user already handles automatically.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.quotes.owner_id IS
  'Owner (profiles/auth uid). Inherited on insert: explicit > deal owner > lead owner > creator; NULL on an agent-created quote with no owned origin. A lens and a label — never referenced by RLS.';

-- One function, one priority order per table. CREATE OR REPLACE swaps the
-- step-0 body in place; the triggers from 20260808300000 keep pointing here.
CREATE OR REPLACE FUNCTION public.assign_owner_on_insert()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF TG_TABLE_NAME = 'leads' THEN
    IF NEW.assigned_to IS NULL AND v_uid IS NOT NULL THEN
      NEW.assigned_to := v_uid;
    END IF;

  ELSIF TG_TABLE_NAME = 'companies' THEN
    IF NEW.account_owner IS NULL AND v_uid IS NOT NULL THEN
      NEW.account_owner := v_uid;
    END IF;

  ELSIF TG_TABLE_NAME = 'deals' THEN
    -- explicit > lead's owner > creator > NULL
    IF NEW.owner_id IS NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT assigned_to INTO NEW.owner_id FROM public.leads WHERE id = NEW.lead_id;
    END IF;
    IF NEW.owner_id IS NULL AND v_uid IS NOT NULL THEN
      NEW.owner_id := v_uid;
    END IF;

  ELSIF TG_TABLE_NAME = 'quotes' THEN
    -- explicit > deal's owner > lead's owner > creator > NULL
    IF NEW.owner_id IS NULL AND NEW.deal_id IS NOT NULL THEN
      SELECT owner_id INTO NEW.owner_id FROM public.deals WHERE id = NEW.deal_id;
    END IF;
    IF NEW.owner_id IS NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT assigned_to INTO NEW.owner_id FROM public.leads WHERE id = NEW.lead_id;
    END IF;
    IF NEW.owner_id IS NULL AND v_uid IS NOT NULL THEN
      NEW.owner_id := v_uid;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_assign_owner ON public.quotes;
CREATE TRIGGER quotes_assign_owner
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.assign_owner_on_insert();

-- Backfill down the chain, never over an existing owner. Order matters: deals
-- first (from their leads), then quotes (from the freshly-filled deals).
UPDATE public.deals d SET owner_id = l.assigned_to
  FROM public.leads l
  WHERE d.owner_id IS NULL AND d.lead_id = l.id AND l.assigned_to IS NOT NULL;

UPDATE public.quotes q SET owner_id = d.owner_id
  FROM public.deals d
  WHERE q.owner_id IS NULL AND q.deal_id = d.id AND d.owner_id IS NOT NULL;

UPDATE public.quotes q SET owner_id = l.assigned_to
  FROM public.leads l
  WHERE q.owner_id IS NULL AND q.lead_id = l.id AND l.assigned_to IS NOT NULL;

UPDATE public.quotes SET owner_id = created_by
  WHERE owner_id IS NULL AND created_by IS NOT NULL;
