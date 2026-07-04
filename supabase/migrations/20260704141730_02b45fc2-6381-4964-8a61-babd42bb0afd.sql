
ALTER TABLE public.page_views
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_page_views_lead_id ON public.page_views(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_views_visitor_id ON public.page_views(visitor_id) WHERE visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_views_visitor_created ON public.page_views(visitor_id, created_at DESC) WHERE visitor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.visitor_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  identified_at timestamptz NOT NULL DEFAULT now(),
  identification_source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(visitor_id, lead_id)
);

GRANT SELECT ON public.visitor_identities TO authenticated;
GRANT ALL ON public.visitor_identities TO service_role;

ALTER TABLE public.visitor_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view visitor identities" ON public.visitor_identities;
CREATE POLICY "Admins can view visitor identities"
  ON public.visitor_identities FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages visitor identities" ON public.visitor_identities;
CREATE POLICY "Service role manages visitor identities"
  ON public.visitor_identities FOR ALL
  TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_visitor_identities_visitor ON public.visitor_identities(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_identities_lead ON public.visitor_identities(lead_id);

CREATE TABLE IF NOT EXISTS public.visitor_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  signal_name text NOT NULL,
  score_delta integer NOT NULL DEFAULT 0,
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  rule_id text,
  fired_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.visitor_signals TO authenticated;
GRANT ALL ON public.visitor_signals TO service_role;

ALTER TABLE public.visitor_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view visitor signals" ON public.visitor_signals;
CREATE POLICY "Admins can view visitor signals"
  ON public.visitor_signals FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages visitor signals" ON public.visitor_signals;
CREATE POLICY "Service role manages visitor signals"
  ON public.visitor_signals FOR ALL
  TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_visitor_signals_lead ON public.visitor_signals(lead_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_signals_visitor ON public.visitor_signals(visitor_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_signals_type ON public.visitor_signals(signal_type, fired_at DESC);

CREATE OR REPLACE FUNCTION public.stitch_visitor_to_lead(
  p_visitor_id text,
  p_lead_id uuid,
  p_source text DEFAULT 'unknown'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_backfilled integer := 0;
  v_first_seen timestamptz;
BEGIN
  IF p_visitor_id IS NULL OR p_lead_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'visitor_id and lead_id required');
  END IF;

  SELECT MIN(created_at) INTO v_first_seen
  FROM public.page_views WHERE visitor_id = p_visitor_id;

  INSERT INTO public.visitor_identities (visitor_id, lead_id, first_seen_at, identification_source)
  VALUES (p_visitor_id, p_lead_id, COALESCE(v_first_seen, now()), p_source)
  ON CONFLICT (visitor_id, lead_id) DO UPDATE
    SET identified_at = EXCLUDED.identified_at,
        identification_source = EXCLUDED.identification_source,
        updated_at = now();

  UPDATE public.page_views
     SET lead_id = p_lead_id
   WHERE visitor_id = p_visitor_id AND lead_id IS NULL;
  GET DIAGNOSTICS v_backfilled = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'backfilled_page_views', v_backfilled,
    'first_seen_at', v_first_seen
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.stitch_visitor_to_lead(text, uuid, text) TO authenticated, service_role, anon;

CREATE OR REPLACE FUNCTION public.trg_lead_auto_stitch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitor text;
BEGIN
  IF NEW.email IS NULL THEN RETURN NEW; END IF;

  FOR v_visitor IN
    SELECT DISTINCT session_id
    FROM public.chat_conversations
    WHERE customer_email = NEW.email AND session_id IS NOT NULL
  LOOP
    PERFORM public.stitch_visitor_to_lead(v_visitor, NEW.id, 'auto_lead_create');
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_auto_stitch ON public.leads;
CREATE TRIGGER lead_auto_stitch
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_lead_auto_stitch();

INSERT INTO public.site_settings (key, value)
VALUES (
  'visitor_intelligence_rules',
  '{
    "enabled": true,
    "rules": [
      {"id": "return_visitor", "name": "Återkommande besökare (3+ sessioner/7d)", "type": "session_count", "window_days": 7, "threshold": 3, "score": 10},
      {"id": "pricing_interest", "name": "Prisintresse (2+ besök på /pricing)", "type": "url_visits", "url_pattern": "/pricing", "window_days": 14, "threshold": 2, "score": 20},
      {"id": "deep_engagement", "name": "Djupt engagemang (10+ sidvisningar)", "type": "page_view_count", "window_days": 30, "threshold": 10, "score": 15},
      {"id": "reawakening", "name": "Återuppvaknad efter 14+ dagars tystnad", "type": "reawakening", "silence_days": 14, "score": 12}
    ]
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.site_settings (key, value)
VALUES (
  'cookie_consent_v2',
  '{
    "enabled": true,
    "categories": {
      "essential": {"label": "Essentiella", "description": "Krävs för att sajten ska fungera.", "required": true},
      "analytics": {"label": "Analys", "description": "Anonym mätning av sidbesök och trafik.", "required": false},
      "marketing": {"label": "Marknadsföring", "description": "Personalisering och beteendesignaler för säljteamet.", "required": false}
    }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

DROP TRIGGER IF EXISTS update_visitor_identities_updated_at ON public.visitor_identities;
CREATE TRIGGER update_visitor_identities_updated_at
  BEFORE UPDATE ON public.visitor_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
