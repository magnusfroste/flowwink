-- Email <-> lead association at write time.
-- A BEFORE INSERT trigger on outbound_communications covers ALL writers
-- (admin UI, edge functions, agent skills) symmetrically — no per-writer
-- patches. Matches the counterpart email address (sender for inbound,
-- recipient for outbound) against leads.email; associates only on an
-- unambiguous single-lead match.

-- Extracts the first email address from a raw header value, which may be
-- plain ("a@x.com"), RFC 5322 ("Name <a@x.com>") or a comma-joined list.
CREATE OR REPLACE FUNCTION public.extract_email_address(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (regexp_match(lower(coalesce(raw, '')), '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'))[1];
$$;

CREATE OR REPLACE FUNCTION public.associate_comm_with_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addr text;
  v_lead_id uuid;
  v_count int;
BEGIN
  IF NEW.channel <> 'email' OR NEW.related_entity_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_addr := public.extract_email_address(
    CASE WHEN NEW.direction = 'inbound'
      THEN coalesce(NEW.sender, NEW.recipient)
      ELSE NEW.recipient
    END
  );
  IF v_addr IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int, min(id::text)::uuid
    INTO v_count, v_lead_id
  FROM public.leads
  WHERE lower(email) = v_addr;

  -- Only associate on an unambiguous match; ambiguous emails stay unlinked.
  IF v_count = 1 THEN
    NEW.related_entity_type := 'lead';
    NEW.related_entity_id := v_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_associate_comm_with_lead ON public.outbound_communications;
CREATE TRIGGER trg_associate_comm_with_lead
  BEFORE INSERT ON public.outbound_communications
  FOR EACH ROW
  EXECUTE FUNCTION public.associate_comm_with_lead();

-- Backfill existing email rows with the same matching logic.
UPDATE public.outbound_communications oc
SET related_entity_type = 'lead',
    related_entity_id   = l.id
FROM public.leads l
WHERE oc.channel = 'email'
  AND oc.related_entity_id IS NULL
  AND lower(l.email) = public.extract_email_address(
        CASE WHEN oc.direction = 'inbound'
          THEN coalesce(oc.sender, oc.recipient)
          ELSE oc.recipient
        END)
  AND NOT EXISTS (
    SELECT 1 FROM public.leads l2
    WHERE lower(l2.email) = lower(l.email) AND l2.id <> l.id
  );

CREATE INDEX IF NOT EXISTS idx_outbound_comm_related_entity
  ON public.outbound_communications (related_entity_type, related_entity_id, created_at DESC)
  WHERE related_entity_id IS NOT NULL;
