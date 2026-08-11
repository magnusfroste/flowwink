-- The service chain: a signed contract becomes an active service the customer
-- sees in their portal — and can raise a ticket against.
--
-- deal → quote (products, price) → contract (§4 lines, §5 term) → SIGN →
-- subscription (the service's passport: status, commitment, health) → portal
-- "My services" → ticket on the service.
--
-- THE ONE-INVOICER RULE, structural not advisory. There are two local billers:
-- contract-billing-cron (contracts where billing_enabled) and
-- subscription-billing-cron (subscriptions where provider='manual'). A service
-- born from a contract must be billed by exactly one of them. It is:
-- `provider='contract'`. subscription-billing-cron only picks up 'manual', so
-- it never touches a contract-born row — the contract keeps billing, as today.
-- A guardrail test asserts the cron's filter stays 'manual'-only, so the rule
-- cannot silently erode into double-billing.

-- 1. The service knows which agreement it came from.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

-- 2. A ticket can point at the service it concerns — the whole "raise an issue
--    on my service" flow. Support then sees service, contract and SLA at once.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL;

-- One service per contract: re-signing or a double-fire must not mint a second
-- passport for the same agreement.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_contract_id_uniq
  ON public.subscriptions(contract_id) WHERE contract_id IS NOT NULL;

-- 3. Birth function — idempotent, called from contract-sign on accept.
--    Returns the subscription id (existing or new). Commitment flows from the
--    contract's own term, filled once at signing, never re-entered.
CREATE OR REPLACE FUNCTION public.create_subscription_from_contract(p_contract_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  c public.contracts%ROWTYPE;
  v_sub_id uuid;
  v_months int;
  v_interval text;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'Contract not found: %', p_contract_id;
  END IF;

  -- Already has its passport — return it, do not mint a second.
  SELECT id INTO v_sub_id FROM public.subscriptions WHERE contract_id = p_contract_id;
  IF v_sub_id IS NOT NULL THEN
    RETURN v_sub_id;
  END IF;

  -- Commitment from the agreement: prefer explicit months, else derive from
  -- start→end. A contract with no term still yields a service (open-ended).
  v_months := CASE
    WHEN c.start_date IS NOT NULL AND c.end_date IS NOT NULL
      THEN GREATEST(1, (date_part('year', age(c.end_date, c.start_date)) * 12
                        + date_part('month', age(c.end_date, c.start_date)))::int)
    ELSE NULL
  END;
  v_interval := COALESCE(NULLIF(c.billing_interval, ''), 'month');

  INSERT INTO public.subscriptions (
    customer_email, customer_name, status,
    unit_amount_cents, currency,
    billing_interval, billing_interval_count,
    -- provider='contract' is the one-invoicer marker: subscription-billing-cron
    -- bills 'manual' only, so this row is the contract's to invoice.
    provider,
    contract_id,
    commitment_start, commitment_months, commitment_end,
    current_period_start, current_period_end,
    product_name
  )
  VALUES (
    c.counterparty_email, c.counterparty_name, 'active',
    COALESCE(c.billing_amount_cents, c.value_cents, 0), COALESCE(c.currency, 'SEK'),
    v_interval, COALESCE(c.billing_interval_count, 1),
    'contract',
    c.id,
    c.start_date, v_months,
    CASE WHEN c.start_date IS NOT NULL AND v_months IS NOT NULL
         THEN c.start_date + (v_months || ' months')::interval
         ELSE c.end_date END,
    c.start_date, c.billing_next_date,
    c.title
  )
  RETURNING id INTO v_sub_id;

  RETURN v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_subscription_from_contract(uuid)
  TO authenticated, service_role;

-- Portal read path: a customer sees their own services. is_staff sees all
-- (support answering a ticket needs the service behind it). Same allow shape
-- as the rest of the portal.
DROP POLICY IF EXISTS "Customers read own subscriptions" ON public.subscriptions;
CREATE POLICY "Customers read own subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    is_staff(auth.uid())
    OR customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
