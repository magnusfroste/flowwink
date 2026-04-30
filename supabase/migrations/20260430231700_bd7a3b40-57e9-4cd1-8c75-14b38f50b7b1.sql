
-- ── Subscriptions v2: Churn intelligence + Win-back ──

-- Churn reason categories
DO $$ BEGIN
  CREATE TYPE public.churn_reason_category AS ENUM (
    'too_expensive', 'missing_feature', 'switched_competitor',
    'no_longer_needed', 'poor_support', 'technical_issues',
    'temporary_pause', 'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. Churn reasons table
CREATE TABLE IF NOT EXISTS public.subscription_churn_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  customer_email text,
  reason public.churn_reason_category NOT NULL DEFAULT 'other',
  feedback text,
  nps_score integer CHECK (nps_score IS NULL OR (nps_score >= 0 AND nps_score <= 10)),
  would_return boolean,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_churn_reasons_sub ON public.subscription_churn_reasons(subscription_id);
CREATE INDEX IF NOT EXISTS idx_churn_reasons_reason ON public.subscription_churn_reasons(reason);
CREATE INDEX IF NOT EXISTS idx_churn_reasons_created ON public.subscription_churn_reasons(created_at DESC);

ALTER TABLE public.subscription_churn_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_churn_reasons" ON public.subscription_churn_reasons;
CREATE POLICY "admins_manage_churn_reasons" ON public.subscription_churn_reasons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Win-back campaigns
CREATE TABLE IF NOT EXISTS public.subscription_winback_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL DEFAULT 'manual', -- manual | at_risk | churned | dunning_failed
  target_segment jsonb DEFAULT '{}'::jsonb,    -- e.g. { reason: ['too_expensive'], days_since_churn: 14 }
  offer_type text NOT NULL DEFAULT 'discount', -- discount | extended_trial | upgrade | custom
  discount_percent integer CHECK (discount_percent IS NULL OR (discount_percent BETWEEN 0 AND 100)),
  discount_duration_months integer,
  email_subject text,
  email_body text,
  cta_url text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_winback_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_manage_winback_campaigns" ON public.subscription_winback_campaigns;
CREATE POLICY "admins_manage_winback_campaigns" ON public.subscription_winback_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Win-back sends
CREATE TABLE IF NOT EXISTS public.subscription_winback_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.subscription_winback_campaigns(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  customer_email text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'queued', -- queued | sent | opened | clicked | converted | failed
  sent_at timestamptz,
  opened_at timestamptz,
  converted_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_winback_sends_campaign ON public.subscription_winback_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_winback_sends_email ON public.subscription_winback_sends(customer_email);
CREATE INDEX IF NOT EXISTS idx_winback_sends_status ON public.subscription_winback_sends(status);

ALTER TABLE public.subscription_winback_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_manage_winback_sends" ON public.subscription_winback_sends;
CREATE POLICY "admins_manage_winback_sends" ON public.subscription_winback_sends
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Extend subscriptions with health/risk
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_score integer CHECK (health_score IS NULL OR (health_score BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS at_risk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS at_risk_reason text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_at_risk ON public.subscriptions(at_risk) WHERE at_risk = true;
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON public.subscriptions(current_period_end);

-- 5. RPC: record_churn_reason
CREATE OR REPLACE FUNCTION public.record_churn_reason(
  p_subscription_id uuid,
  p_reason public.churn_reason_category,
  p_feedback text DEFAULT NULL,
  p_nps_score integer DEFAULT NULL,
  p_would_return boolean DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  SELECT customer_email INTO v_email FROM public.subscriptions WHERE id = p_subscription_id;
  INSERT INTO public.subscription_churn_reasons
    (subscription_id, customer_email, reason, feedback, nps_score, would_return)
  VALUES (p_subscription_id, v_email, p_reason, p_feedback, p_nps_score, p_would_return)
  RETURNING id INTO v_id;

  -- Emit event if helper exists
  BEGIN
    PERFORM public.emit_platform_event('subscription.churn_reason_recorded',
      jsonb_build_object('subscription_id', p_subscription_id, 'reason', p_reason),
      'subscriptions');
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  RETURN v_id;
END;
$$;

-- 6. RPC: flag at-risk subscriptions
CREATE OR REPLACE FUNCTION public.flag_at_risk_subscriptions()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_flagged integer;
BEGIN
  WITH updated AS (
    UPDATE public.subscriptions s
    SET at_risk = true,
        at_risk_reason = CASE
          WHEN s.status = 'past_due' THEN 'payment_failed'
          WHEN s.cancel_at_period_end THEN 'cancellation_scheduled'
          WHEN s.health_score IS NOT NULL AND s.health_score < 30 THEN 'low_health_score'
          ELSE 'unknown'
        END,
        updated_at = now()
    WHERE s.status IN ('active', 'trialing', 'past_due')
      AND (
        s.status = 'past_due'
        OR s.cancel_at_period_end = true
        OR (s.health_score IS NOT NULL AND s.health_score < 30)
      )
      AND s.at_risk = false
    RETURNING s.id
  )
  SELECT count(*) INTO v_flagged FROM updated;

  RETURN jsonb_build_object('flagged', v_flagged, 'run_at', now());
END;
$$;

-- 7. RPC: upcoming renewals
CREATE OR REPLACE FUNCTION public.upcoming_renewals(p_days_ahead integer DEFAULT 7)
RETURNS TABLE (
  id uuid,
  customer_email text,
  customer_name text,
  product_name text,
  current_period_end timestamptz,
  unit_amount_cents integer,
  currency text,
  status text,
  cancel_at_period_end boolean,
  days_until_renewal integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    s.id,
    s.customer_email,
    s.customer_name,
    s.product_name,
    s.current_period_end,
    s.unit_amount_cents,
    s.currency,
    s.status::text,
    s.cancel_at_period_end,
    EXTRACT(DAY FROM (s.current_period_end - now()))::integer AS days_until_renewal
  FROM public.subscriptions s
  WHERE s.status IN ('active', 'trialing')
    AND s.current_period_end IS NOT NULL
    AND s.current_period_end BETWEEN now() AND now() + (p_days_ahead || ' days')::interval
  ORDER BY s.current_period_end ASC;
$$;

-- 8. updated_at trigger for winback campaigns
DROP TRIGGER IF EXISTS update_winback_campaigns_updated_at ON public.subscription_winback_campaigns;
CREATE TRIGGER update_winback_campaigns_updated_at
  BEFORE UPDATE ON public.subscription_winback_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Grants
GRANT EXECUTE ON FUNCTION public.record_churn_reason(uuid, public.churn_reason_category, text, integer, boolean) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.flag_at_risk_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upcoming_renewals(integer) TO authenticated;
