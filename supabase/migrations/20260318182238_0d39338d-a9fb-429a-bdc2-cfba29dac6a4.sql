
-- Add 'growth' to agent_skill_category enum
ALTER TYPE public.agent_skill_category ADD VALUE IF NOT EXISTS 'growth';

-- Ad Campaigns table
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'meta',
  objective TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  budget_cents INTEGER NOT NULL DEFAULT 0,
  spent_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SEK',
  target_audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_date DATE,
  end_date DATE,
  external_id TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ad Creatives table
CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'text',
  headline TEXT,
  body TEXT,
  cta_text TEXT,
  image_url TEXT,
  performance JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

-- ad_campaigns policies
CREATE POLICY "Admins can manage ad campaigns" ON public.ad_campaigns FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can insert ad campaigns" ON public.ad_campaigns FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update ad campaigns" ON public.ad_campaigns FOR UPDATE USING (true);
CREATE POLICY "Authenticated can view ad campaigns" ON public.ad_campaigns FOR SELECT TO authenticated USING (true);

-- ad_creatives policies
CREATE POLICY "Admins can manage ad creatives" ON public.ad_creatives FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can insert ad creatives" ON public.ad_creatives FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update ad creatives" ON public.ad_creatives FOR UPDATE USING (true);
CREATE POLICY "Authenticated can view ad creatives" ON public.ad_creatives FOR SELECT TO authenticated USING (true);
