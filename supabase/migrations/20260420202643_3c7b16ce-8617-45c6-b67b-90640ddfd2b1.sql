
-- 1. Auto-link leads to companies by email domain
CREATE OR REPLACE FUNCTION public.auto_link_lead_to_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
  v_company_id uuid;
BEGIN
  IF NEW.company_id IS NOT NULL OR NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  v_domain := lower(split_part(NEW.email, '@', 2));
  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_company_id
  FROM public.companies
  WHERE lower(domain) = v_domain
  LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    NEW.company_id := v_company_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_lead_to_company ON public.leads;
CREATE TRIGGER trg_auto_link_lead_to_company
  BEFORE INSERT OR UPDATE OF email, company_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_lead_to_company();

-- 2. Backfill all existing leads/contacts that have an email but no company_id
UPDATE public.leads l
SET company_id = c.id
FROM public.companies c
WHERE l.company_id IS NULL
  AND l.email IS NOT NULL
  AND lower(split_part(l.email, '@', 2)) = lower(c.domain)
  AND c.domain IS NOT NULL
  AND c.domain <> '';

-- 3. Promote companies that have any won deal (re-run of existing logic, now that company_id is filled)
UPDATE public.companies c
SET lifecycle_stage = 'customer',
    customer_since = COALESCE(c.customer_since, sub.first_won),
    updated_at = now()
FROM (
  SELECT l.company_id, MIN(d.closed_at) AS first_won
  FROM public.deals d
  JOIN public.leads l ON l.id = d.lead_id
  WHERE d.stage = 'closed_won'
    AND l.company_id IS NOT NULL
  GROUP BY l.company_id
) sub
WHERE c.id = sub.company_id
  AND c.lifecycle_stage <> 'customer';
