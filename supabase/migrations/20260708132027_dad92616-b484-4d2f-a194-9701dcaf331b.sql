
-- 1) email_templates
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  text text,
  category text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_templates staff" ON public.email_templates;
CREATE POLICY "email_templates staff" ON public.email_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'marketing') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'support'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'marketing') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'support'));

-- 2) email_threads (subject/thread_key-based)
CREATE TABLE IF NOT EXISTS public.email_threads (
  thread_key text PRIMARY KEY,
  subject text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  first_message_at timestamptz NOT NULL DEFAULT now(),
  message_count integer NOT NULL DEFAULT 0,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_threads TO authenticated;
GRANT ALL ON public.email_threads TO service_role;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_threads staff" ON public.email_threads;
CREATE POLICY "email_threads staff" ON public.email_threads
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'marketing'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'marketing'));

CREATE OR REPLACE FUNCTION public.normalize_thread_key(p_subject text, p_thread_id text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
    nullif(p_thread_id, ''),
    lower(regexp_replace(coalesce(p_subject,''), '^(re:|fwd:|fw:)\s*', '', 'ig'))
  );
$$;

CREATE OR REPLACE FUNCTION public.touch_email_thread() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text;
BEGIN
  IF NEW.channel <> 'email' THEN RETURN NEW; END IF;
  v_key := normalize_thread_key(NEW.subject, NEW.thread_id);
  IF v_key IS NULL OR v_key = '' THEN RETURN NEW; END IF;
  NEW.thread_id := v_key;
  INSERT INTO public.email_threads (thread_key, subject, last_message_at, message_count, related_entity_type, related_entity_id)
    VALUES (v_key, NEW.subject, coalesce(NEW.sent_at, now()), 1, NEW.related_entity_type, NEW.related_entity_id)
    ON CONFLICT (thread_key) DO UPDATE SET
      last_message_at = greatest(email_threads.last_message_at, coalesce(NEW.sent_at, now())),
      message_count = email_threads.message_count + 1,
      updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_email_thread ON public.outbound_communications;
CREATE TRIGGER trg_touch_email_thread BEFORE INSERT ON public.outbound_communications
  FOR EACH ROW EXECUTE FUNCTION public.touch_email_thread();

-- 3) email_signatures
CREATE TABLE IF NOT EXISTS public.email_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  from_address text,
  html text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_signatures_from ON public.email_signatures(lower(from_address)) WHERE from_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_signatures_user ON public.email_signatures(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_signatures TO authenticated;
GRANT ALL ON public.email_signatures TO service_role;
ALTER TABLE public.email_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_signatures own or admin" ON public.email_signatures;
CREATE POLICY "email_signatures own or admin" ON public.email_signatures
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'admin'));

-- 4) email_events + email_suppressions
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id uuid REFERENCES public.outbound_communications(id) ON DELETE SET NULL,
  message_id text,
  event_type text NOT NULL CHECK (event_type IN ('delivered','opened','clicked','bounced','complained','deferred','failed','unsubscribed')),
  recipient text,
  hard_bounce boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_events_msg ON public.email_events(message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON public.email_events(recipient);
GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_events staff read" ON public.email_events;
CREATE POLICY "email_events staff read" ON public.email_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'marketing') OR has_role(auth.uid(),'sales'));

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email text PRIMARY KEY,
  reason text NOT NULL,
  source_event_id uuid REFERENCES public.email_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_suppressions TO authenticated;
GRANT ALL ON public.email_suppressions TO service_role;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_suppressions staff" ON public.email_suppressions;
CREATE POLICY "email_suppressions staff" ON public.email_suppressions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'marketing'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'marketing'));

-- Trigger: hard bounce or complaint auto-suppresses
CREATE OR REPLACE FUNCTION public.auto_suppress_on_bounce() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.recipient IS NOT NULL AND (
       (NEW.event_type = 'bounced' AND NEW.hard_bounce)
       OR NEW.event_type = 'complained'
       OR NEW.event_type = 'unsubscribed'
  ) THEN
    INSERT INTO public.email_suppressions (email, reason, source_event_id)
      VALUES (lower(NEW.recipient), NEW.event_type, NEW.id)
      ON CONFLICT (email) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_suppress ON public.email_events;
CREATE TRIGGER trg_auto_suppress AFTER INSERT ON public.email_events
  FOR EACH ROW EXECUTE FUNCTION public.auto_suppress_on_bounce();

-- 5) touch triggers for updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_email_templates ON public.email_templates;
CREATE TRIGGER trg_touch_email_templates BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_email_threads ON public.email_threads;
CREATE TRIGGER trg_touch_email_threads BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_email_signatures ON public.email_signatures;
CREATE TRIGGER trg_touch_email_signatures BEFORE UPDATE ON public.email_signatures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6) RPCs
CREATE OR REPLACE FUNCTION public.upsert_email_template(
  p_name text,
  p_subject text,
  p_html text,
  p_text text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_variables jsonb DEFAULT '[]'::jsonb,
  p_active boolean DEFAULT true
) RETURNS public.email_templates
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.email_templates;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'marketing') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'support')) THEN
    RAISE EXCEPTION 'Not authorised to manage email templates';
  END IF;
  INSERT INTO public.email_templates (name, subject, html, text, category, variables, active, created_by)
    VALUES (p_name, p_subject, p_html, p_text, p_category, coalesce(p_variables,'[]'::jsonb), coalesce(p_active,true), auth.uid())
    ON CONFLICT (name) DO UPDATE SET
      subject = EXCLUDED.subject,
      html = EXCLUDED.html,
      text = EXCLUDED.text,
      category = EXCLUDED.category,
      variables = EXCLUDED.variables,
      active = EXCLUDED.active,
      updated_at = now()
    RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.delete_email_template(p_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only admin can delete templates';
  END IF;
  DELETE FROM public.email_templates WHERE name = p_name;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_email_signature(
  p_html text,
  p_from_address text DEFAULT NULL,
  p_is_default boolean DEFAULT false
) RETURNS public.email_signatures
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.email_signatures; v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Auth required';
  END IF;
  IF p_is_default AND v_uid IS NOT NULL THEN
    UPDATE public.email_signatures SET is_default = false WHERE user_id = v_uid;
  END IF;
  IF p_from_address IS NOT NULL THEN
    INSERT INTO public.email_signatures (user_id, from_address, html, is_default)
      VALUES (v_uid, p_from_address, p_html, coalesce(p_is_default,false))
      ON CONFLICT ((lower(from_address))) DO UPDATE SET
        html = EXCLUDED.html,
        is_default = EXCLUDED.is_default,
        user_id = coalesce(EXCLUDED.user_id, email_signatures.user_id),
        updated_at = now()
      RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.email_signatures (user_id, html, is_default)
      VALUES (v_uid, p_html, coalesce(p_is_default,false))
      RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.add_email_suppression(p_email text, p_reason text DEFAULT 'manual')
RETURNS public.email_suppressions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.email_suppressions;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'marketing')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  INSERT INTO public.email_suppressions (email, reason) VALUES (lower(p_email), p_reason)
    ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.remove_email_suppression(p_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  DELETE FROM public.email_suppressions WHERE email = lower(p_email);
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.record_email_event(
  p_message_id text,
  p_event_type text,
  p_recipient text DEFAULT NULL,
  p_hard_bounce boolean DEFAULT false,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_communication_id uuid DEFAULT NULL
) RETURNS public.email_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.email_events;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  INSERT INTO public.email_events (communication_id, message_id, event_type, recipient, hard_bounce, payload)
    VALUES (p_communication_id, p_message_id, p_event_type, p_recipient, coalesce(p_hard_bounce,false), coalesce(p_payload,'{}'::jsonb))
    RETURNING * INTO v_row;
  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_email_template(text,text,text,text,text,jsonb,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_email_template(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_email_signature(text,text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_email_suppression(text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_email_suppression(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_email_event(text,text,text,boolean,jsonb,uuid) TO authenticated, service_role;

-- 7) seed common templates (idempotent)
INSERT INTO public.email_templates (name, subject, html, text, category, variables) VALUES
  ('welcome',
   'Welcome to {{company_name}}!',
   '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px"><h2>Welcome, {{first_name}}!</h2><p>Thanks for joining {{company_name}}. We''re glad to have you.</p><p>If you have any questions, just reply to this email.</p></div>',
   'Welcome, {{first_name}}! Thanks for joining {{company_name}}.',
   'onboarding',
   '["first_name","company_name"]'::jsonb),
  ('invoice_follow_up',
   'Reminder: invoice {{invoice_number}} is due',
   '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px"><h2>Payment reminder</h2><p>Hi {{customer_name}},</p><p>This is a friendly reminder that invoice <strong>{{invoice_number}}</strong> for {{amount}} is due on {{due_date}}.</p><p>You can view and pay it here: <a href="{{invoice_url}}">{{invoice_url}}</a>.</p></div>',
   'Hi {{customer_name}}, invoice {{invoice_number}} for {{amount}} is due on {{due_date}}. Pay at {{invoice_url}}',
   'billing',
   '["customer_name","invoice_number","amount","due_date","invoice_url"]'::jsonb),
  ('sales_follow_up',
   'Following up on {{topic}}',
   '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px"><p>Hi {{first_name}},</p><p>Just following up on our conversation about {{topic}}. Do you have any questions I can help answer?</p><p>Happy to jump on a quick call — let me know a time that works.</p></div>',
   'Hi {{first_name}}, following up on {{topic}}. Any questions?',
   'sales',
   '["first_name","topic"]'::jsonb)
ON CONFLICT (name) DO NOTHING;
