CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- SURVEYS / NPS MODULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.survey_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'nps' CHECK (kind IN ('nps','csat','ces','custom')),
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.survey_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES public.survey_templates(id) ON DELETE RESTRICT,
  trigger TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('manual','order.delivered','order.paid','ticket.closed','contract.renewed','booking.completed','deal.won')),
  delay_hours INTEGER NOT NULL DEFAULT 24,
  is_active BOOLEAN NOT NULL DEFAULT true,
  email_subject TEXT NOT NULL DEFAULT 'How was your experience?',
  email_intro TEXT NOT NULL DEFAULT 'We''d love your feedback. It takes 10 seconds.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.survey_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.survey_campaigns(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  related_entity_type TEXT,
  related_entity_id UUID,
  lead_id UUID,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_sends_campaign ON public.survey_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_survey_sends_email ON public.survey_sends(recipient_email);
CREATE INDEX IF NOT EXISTS idx_survey_sends_lead ON public.survey_sends(lead_id);
CREATE INDEX IF NOT EXISTS idx_survey_sends_token ON public.survey_sends(token);

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id UUID NOT NULL REFERENCES public.survey_sends(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.survey_campaigns(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.survey_templates(id) ON DELETE RESTRICT,
  score INTEGER,
  category TEXT,
  comment TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient_email TEXT NOT NULL,
  lead_id UUID,
  flowpilot_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_campaign ON public.survey_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_score ON public.survey_responses(score);
CREATE INDEX IF NOT EXISTS idx_survey_responses_lead ON public.survey_responses(lead_id);

CREATE OR REPLACE FUNCTION public.categorize_nps_response()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.score IS NOT NULL THEN
    NEW.category := CASE
      WHEN NEW.score <= 6 THEN 'detractor'
      WHEN NEW.score <= 8 THEN 'passive'
      ELSE 'promoter'
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categorize_nps ON public.survey_responses;
CREATE TRIGGER trg_categorize_nps
BEFORE INSERT OR UPDATE OF score ON public.survey_responses
FOR EACH ROW EXECUTE FUNCTION public.categorize_nps_response();

CREATE OR REPLACE FUNCTION public.mark_survey_send_responded()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.survey_sends SET responded_at = now() WHERE id = NEW.send_id;
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'emit_platform_event') THEN
    PERFORM public.emit_platform_event(
      'survey.responded',
      jsonb_build_object(
        'response_id', NEW.id,
        'campaign_id', NEW.campaign_id,
        'score', NEW.score,
        'category', NEW.category,
        'recipient_email', NEW.recipient_email,
        'lead_id', NEW.lead_id
      ),
      'surveys'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_survey_responded ON public.survey_responses;
CREATE TRIGGER trg_mark_survey_responded
AFTER INSERT ON public.survey_responses
FOR EACH ROW EXECUTE FUNCTION public.mark_survey_send_responded();

ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_templates ON public.survey_templates;
CREATE POLICY admin_all_templates ON public.survey_templates
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS admin_all_campaigns ON public.survey_campaigns;
CREATE POLICY admin_all_campaigns ON public.survey_campaigns
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS admin_all_sends ON public.survey_sends;
CREATE POLICY admin_all_sends ON public.survey_sends
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS admin_all_responses ON public.survey_responses;
CREATE POLICY admin_all_responses ON public.survey_responses
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_survey_by_token(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_send public.survey_sends%ROWTYPE;
  v_campaign public.survey_campaigns%ROWTYPE;
  v_template public.survey_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_send FROM public.survey_sends WHERE token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF v_send.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;
  IF v_send.responded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_responded');
  END IF;
  IF v_send.opened_at IS NULL THEN
    UPDATE public.survey_sends SET opened_at = now() WHERE id = v_send.id;
  END IF;
  SELECT * INTO v_campaign FROM public.survey_campaigns WHERE id = v_send.campaign_id;
  SELECT * INTO v_template FROM public.survey_templates WHERE id = v_campaign.template_id;
  RETURN jsonb_build_object(
    'success', true,
    'send_id', v_send.id,
    'campaign', jsonb_build_object('name', v_campaign.name, 'email_intro', v_campaign.email_intro),
    'template', jsonb_build_object('kind', v_template.kind, 'name', v_template.name, 'questions', v_template.questions),
    'recipient_name', v_send.recipient_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_survey_response(
  _token TEXT,
  _score INTEGER DEFAULT NULL,
  _comment TEXT DEFAULT NULL,
  _answers JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_send public.survey_sends%ROWTYPE;
  v_response_id UUID;
BEGIN
  SELECT * INTO v_send FROM public.survey_sends WHERE token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_token'); END IF;
  IF v_send.expires_at < now() THEN RETURN jsonb_build_object('success', false, 'error', 'expired'); END IF;
  IF v_send.responded_at IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', 'already_responded'); END IF;
  INSERT INTO public.survey_responses (send_id, campaign_id, template_id, score, comment, answers, recipient_email, lead_id)
  SELECT v_send.id, v_send.campaign_id, c.template_id, _score, _comment, _answers, v_send.recipient_email, v_send.lead_id
  FROM public.survey_campaigns c WHERE c.id = v_send.campaign_id
  RETURNING id INTO v_response_id;
  RETURN jsonb_build_object('success', true, 'response_id', v_response_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_survey_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_survey_response(TEXT, INTEGER, TEXT, JSONB) TO anon, authenticated;

INSERT INTO public.survey_templates (name, kind, description, questions)
SELECT 'Default NPS', 'nps', 'Standard Net Promoter Score with optional follow-up.',
  '[{"id":"score","type":"nps","label":"How likely are you to recommend us to a friend or colleague?"},
    {"id":"comment","type":"long_text","label":"What''s the main reason for your score?","required":false}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.survey_templates WHERE kind = 'nps' AND name = 'Default NPS');

INSERT INTO public.survey_templates (name, kind, description, questions)
SELECT 'Default CSAT', 'csat', 'Customer Satisfaction (1-5 stars).',
  '[{"id":"score","type":"csat","label":"How satisfied were you with your experience?"},
    {"id":"comment","type":"long_text","label":"Anything we could have done better?","required":false}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.survey_templates WHERE kind = 'csat' AND name = 'Default CSAT');

CREATE OR REPLACE VIEW public.survey_nps_stats AS
SELECT
  c.id AS campaign_id,
  c.name AS campaign_name,
  COUNT(r.id) AS total_responses,
  COUNT(*) FILTER (WHERE r.category = 'promoter') AS promoters,
  COUNT(*) FILTER (WHERE r.category = 'passive') AS passives,
  COUNT(*) FILTER (WHERE r.category = 'detractor') AS detractors,
  ROUND(100.0 * (COUNT(*) FILTER (WHERE r.category = 'promoter')::numeric
    - COUNT(*) FILTER (WHERE r.category = 'detractor')::numeric)
    / NULLIF(COUNT(r.id), 0), 1) AS nps_score,
  ROUND(AVG(r.score)::numeric, 2) AS avg_score
FROM public.survey_campaigns c
LEFT JOIN public.survey_responses r ON r.campaign_id = c.id
GROUP BY c.id, c.name;

GRANT SELECT ON public.survey_nps_stats TO authenticated;