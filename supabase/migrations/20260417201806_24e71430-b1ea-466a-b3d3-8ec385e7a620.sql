-- Subscription status enum
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM (
    'trialing', 'active', 'past_due', 'canceled', 'paused', 'incomplete', 'incomplete_expired', 'unpaid'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email TEXT,
  customer_name TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  status public.subscription_status NOT NULL DEFAULT 'active',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  billing_interval TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  cancel_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_subscription_id TEXT,
  provider_customer_id TEXT,
  provider_price_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_sub_id_key
  ON public.subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_customer_email_idx ON public.subscriptions(customer_email);

-- Events log
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_event_id TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_events_subscription_id_idx ON public.subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS subscription_events_created_at_idx ON public.subscription_events(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_events_provider_event_key
  ON public.subscription_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- Updated_at trigger
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all subscriptions" ON public.subscriptions;
CREATE POLICY "Staff can view all subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'writer')
  );

DROP POLICY IF EXISTS "Customers can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Customers can view own subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Staff can manage subscriptions" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'));

DROP POLICY IF EXISTS "Staff can view subscription events" ON public.subscription_events;
CREATE POLICY "Staff can view subscription events" ON public.subscription_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'writer')
  );

DROP POLICY IF EXISTS "Admins can manage subscription events" ON public.subscription_events;
CREATE POLICY "Admins can manage subscription events" ON public.subscription_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));