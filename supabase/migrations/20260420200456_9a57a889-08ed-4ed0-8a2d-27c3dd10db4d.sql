-- 1. Lifecycle stage enum + columns on companies
DO $$ BEGIN
  CREATE TYPE public.company_lifecycle_stage AS ENUM ('prospect', 'customer', 'churned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS lifecycle_stage public.company_lifecycle_stage NOT NULL DEFAULT 'prospect',
  ADD COLUMN IF NOT EXISTS customer_since TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_companies_lifecycle_stage ON public.companies(lifecycle_stage);

-- 2. company_id on orders (B2C ↔ B2B bridge)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_id ON public.orders(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email_lower ON public.orders(LOWER(customer_email));

-- 3. Trigger: deal.stage → closed_won → bump lead + company
CREATE OR REPLACE FUNCTION public.handle_deal_won()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Only act on transition INTO closed_won
  IF NEW.stage = 'closed_won' AND (OLD.stage IS DISTINCT FROM 'closed_won') THEN
    -- Bump lead status
    UPDATE public.leads
    SET status = 'customer', updated_at = now()
    WHERE id = NEW.lead_id AND status <> 'customer';

    -- Find lead's company and bump lifecycle
    SELECT company_id INTO v_company_id FROM public.leads WHERE id = NEW.lead_id;
    IF v_company_id IS NOT NULL THEN
      UPDATE public.companies
      SET lifecycle_stage = 'customer',
          customer_since = COALESCE(customer_since, now()),
          updated_at = now()
      WHERE id = v_company_id AND lifecycle_stage <> 'customer';
    END IF;
  END IF;

  -- Optional: handle churn
  IF NEW.stage = 'closed_lost' AND OLD.stage = 'closed_won' THEN
    -- Lost after won = potential churn signal, but don't auto-churn (manual decision)
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_won_to_customer ON public.deals;
CREATE TRIGGER trg_deal_won_to_customer
  AFTER UPDATE OF stage ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_deal_won();

-- Also fire on INSERT in case a deal is created already-won
DROP TRIGGER IF EXISTS trg_deal_won_on_insert ON public.deals;
CREATE TRIGGER trg_deal_won_on_insert
  AFTER INSERT ON public.deals
  FOR EACH ROW
  WHEN (NEW.stage = 'closed_won')
  EXECUTE FUNCTION public.handle_deal_won();

-- 4. Trigger: order.created → CRM bridge
--    - Match email to existing lead, bump status to 'customer'
--    - Otherwise create a new lead with status='customer'
--    - Match email domain to existing company, link orders.company_id
CREATE OR REPLACE FUNCTION public.handle_order_to_crm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id UUID;
  v_company_id UUID;
  v_domain TEXT;
BEGIN
  IF NEW.customer_email IS NULL OR NEW.customer_email = '' THEN
    RETURN NEW;
  END IF;

  -- Extract domain
  v_domain := LOWER(SPLIT_PART(NEW.customer_email, '@', 2));

  -- Try to match existing company by domain (skip free-mail providers)
  IF v_domain IS NOT NULL AND v_domain NOT IN ('gmail.com','hotmail.com','outlook.com','yahoo.com','icloud.com','live.com','me.com','aol.com','protonmail.com') THEN
    SELECT id INTO v_company_id FROM public.companies
    WHERE LOWER(domain) = v_domain
    LIMIT 1;

    IF v_company_id IS NOT NULL AND NEW.company_id IS NULL THEN
      NEW.company_id := v_company_id;
      -- Bump company to customer
      UPDATE public.companies
      SET lifecycle_stage = 'customer',
          customer_since = COALESCE(customer_since, now()),
          updated_at = now()
      WHERE id = v_company_id AND lifecycle_stage <> 'customer';
    END IF;
  END IF;

  -- Match or create lead
  SELECT id INTO v_lead_id FROM public.leads
  WHERE LOWER(email) = LOWER(NEW.customer_email)
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET status = 'customer',
        company_id = COALESCE(company_id, v_company_id),
        updated_at = now()
    WHERE id = v_lead_id;
  ELSE
    INSERT INTO public.leads (email, name, source, source_id, status, score, company_id)
    VALUES (
      NEW.customer_email,
      NEW.customer_name,
      'order',
      NEW.id::text,
      'customer',
      50,
      v_company_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_to_crm ON public.orders;
CREATE TRIGGER trg_order_to_crm
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_to_crm();

-- 5. Backfill: mark existing companies with won deals as customers
UPDATE public.companies c
SET lifecycle_stage = 'customer',
    customer_since = COALESCE(c.customer_since, sub.first_won)
FROM (
  SELECT l.company_id, MIN(d.updated_at) AS first_won
  FROM public.deals d
  JOIN public.leads l ON l.id = d.lead_id
  WHERE d.stage = 'closed_won' AND l.company_id IS NOT NULL
  GROUP BY l.company_id
) sub
WHERE c.id = sub.company_id AND c.lifecycle_stage <> 'customer';

-- Backfill: companies whose domain matches an existing order
UPDATE public.companies c
SET lifecycle_stage = 'customer',
    customer_since = COALESCE(c.customer_since, sub.first_order)
FROM (
  SELECT LOWER(c2.domain) AS domain, MIN(o.created_at) AS first_order
  FROM public.orders o
  JOIN public.companies c2 ON LOWER(c2.domain) = LOWER(SPLIT_PART(o.customer_email, '@', 2))
  WHERE c2.domain IS NOT NULL AND c2.domain <> ''
  GROUP BY LOWER(c2.domain)
) sub
WHERE LOWER(c.domain) = sub.domain AND c.lifecycle_stage <> 'customer';

-- Backfill: link existing orders to companies by domain
UPDATE public.orders o
SET company_id = c.id
FROM public.companies c
WHERE o.company_id IS NULL
  AND c.domain IS NOT NULL
  AND LOWER(c.domain) = LOWER(SPLIT_PART(o.customer_email, '@', 2));