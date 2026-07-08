
-- 1. UTM columns
ALTER TABLE public.page_views
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS landing_url TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_utm_source TEXT,
  ADD COLUMN IF NOT EXISTS first_utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS first_utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS last_utm_source TEXT,
  ADD COLUMN IF NOT EXISTS last_utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS last_utm_campaign TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS first_utm_source TEXT,
  ADD COLUMN IF NOT EXISTS first_utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS first_utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS last_utm_source TEXT,
  ADD COLUMN IF NOT EXISTS last_utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS last_utm_campaign TEXT;

ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

CREATE INDEX IF NOT EXISTS idx_page_views_utm_campaign ON public.page_views(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_last_utm_campaign ON public.leads(last_utm_campaign) WHERE last_utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_last_utm_campaign ON public.orders(last_utm_campaign) WHERE last_utm_campaign IS NOT NULL;

-- 2. utm_attributions log
CREATE TABLE IF NOT EXISTS public.utm_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT,
  session_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  landing_url TEXT,
  referrer TEXT,
  touch_type TEXT NOT NULL DEFAULT 'landing' CHECK (touch_type IN ('landing','conversion')),
  conversion_kind TEXT,
  conversion_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_utm_attr_visitor ON public.utm_attributions(visitor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_utm_attr_campaign ON public.utm_attributions(utm_campaign, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_utm_attr_touch ON public.utm_attributions(touch_type, occurred_at DESC);

GRANT SELECT, INSERT ON public.utm_attributions TO anon;
GRANT SELECT, INSERT ON public.utm_attributions TO authenticated;
GRANT ALL ON public.utm_attributions TO service_role;

ALTER TABLE public.utm_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can log UTM touch" ON public.utm_attributions;
CREATE POLICY "Anyone can log UTM touch"
  ON public.utm_attributions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins read utm attribution" ON public.utm_attributions;
CREATE POLICY "Admins read utm attribution"
  ON public.utm_attributions FOR SELECT
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage utm attribution" ON public.utm_attributions;
CREATE POLICY "Admins manage utm attribution"
  ON public.utm_attributions FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

-- 3. Attribution report (by campaign/source, aggregating page_views + leads + orders)
CREATE OR REPLACE FUNCTION public.utm_attribution_report(_since TIMESTAMPTZ DEFAULT (now() - interval '30 days'))
RETURNS TABLE (
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  visits BIGINT,
  unique_visitors BIGINT,
  leads BIGINT,
  orders BIGINT,
  revenue_cents BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (
    SELECT
      COALESCE(pv.utm_source,'(none)')  AS utm_source,
      COALESCE(pv.utm_medium,'(none)')  AS utm_medium,
      COALESCE(pv.utm_campaign,'(none)') AS utm_campaign,
      COUNT(*)::BIGINT                   AS visits,
      COUNT(DISTINCT pv.visitor_id)::BIGINT AS unique_visitors
    FROM public.page_views pv
    WHERE pv.created_at >= _since
    GROUP BY 1,2,3
  ),
  l AS (
    SELECT
      COALESCE(last_utm_source,'(none)')  AS utm_source,
      COALESCE(last_utm_medium,'(none)')  AS utm_medium,
      COALESCE(last_utm_campaign,'(none)') AS utm_campaign,
      COUNT(*)::BIGINT                    AS leads
    FROM public.leads
    WHERE created_at >= _since
    GROUP BY 1,2,3
  ),
  o AS (
    SELECT
      COALESCE(last_utm_source,'(none)')  AS utm_source,
      COALESCE(last_utm_medium,'(none)')  AS utm_medium,
      COALESCE(last_utm_campaign,'(none)') AS utm_campaign,
      COUNT(*)::BIGINT                    AS orders,
      COALESCE(SUM(total_cents),0)::BIGINT AS revenue_cents
    FROM public.orders
    WHERE created_at >= _since AND status <> 'cancelled'
    GROUP BY 1,2,3
  )
  SELECT
    COALESCE(v.utm_source, l.utm_source, o.utm_source) AS utm_source,
    COALESCE(v.utm_medium, l.utm_medium, o.utm_medium) AS utm_medium,
    COALESCE(v.utm_campaign, l.utm_campaign, o.utm_campaign) AS utm_campaign,
    COALESCE(v.visits,0)          AS visits,
    COALESCE(v.unique_visitors,0) AS unique_visitors,
    COALESCE(l.leads,0)           AS leads,
    COALESCE(o.orders,0)          AS orders,
    COALESCE(o.revenue_cents,0)   AS revenue_cents
  FROM v
  FULL OUTER JOIN l USING (utm_source, utm_medium, utm_campaign)
  FULL OUTER JOIN o USING (utm_source, utm_medium, utm_campaign)
  ORDER BY 7 DESC, 6 DESC, 4 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.utm_attribution_report(TIMESTAMPTZ) TO authenticated, service_role;

-- 4. social_posts (organic scheduling)
CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('linkedin','x','instagram','facebook','other')),
  media_url TEXT,
  link_url TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','posted','failed','cancelled')),
  external_ref TEXT,
  external_url TEXT,
  posted_at TIMESTAMPTZ,
  error TEXT,
  blog_post_id UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_status_scheduled ON public.social_posts(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_channel ON public.social_posts(channel);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage social posts" ON public.social_posts;
CREATE POLICY "Admins manage social posts"
  ON public.social_posts FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_social_posts_updated_at ON public.social_posts;
CREATE TRIGGER trg_social_posts_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mark a social post as posted (agent/user callable). external_ref/url optional.
CREATE OR REPLACE FUNCTION public.mark_social_post_posted(
  _post_id UUID,
  _external_ref TEXT DEFAULT NULL,
  _external_url TEXT DEFAULT NULL
)
RETURNS public.social_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.social_posts;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can mark social posts';
  END IF;
  UPDATE public.social_posts
     SET status = 'posted',
         posted_at = COALESCE(posted_at, now()),
         external_ref = COALESCE(_external_ref, external_ref),
         external_url = COALESCE(_external_url, external_url),
         error = NULL
   WHERE id = _post_id
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Social post % not found', _post_id;
  END IF;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_social_post_posted(UUID, TEXT, TEXT) TO authenticated, service_role;

-- Process due scheduled posts: flip past-due 'scheduled' -> 'posted' with a stub note
-- (Actual channel publish requires per-channel API creds — this is the manual/stub path.)
CREATE OR REPLACE FUNCTION public.process_due_social_posts()
RETURNS TABLE(post_id UUID, channel TEXT, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins/service_role can process social post queue';
  END IF;

  RETURN QUERY
  WITH due AS (
    UPDATE public.social_posts sp
       SET status = 'failed',
           error = 'No channel publisher configured — mark manually or connect the integration.'
     WHERE sp.status = 'scheduled'
       AND sp.scheduled_at IS NOT NULL
       AND sp.scheduled_at <= now() - interval '5 minutes'
     RETURNING sp.id, sp.channel, sp.status
  )
  SELECT * FROM due;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_due_social_posts() TO authenticated, service_role;
