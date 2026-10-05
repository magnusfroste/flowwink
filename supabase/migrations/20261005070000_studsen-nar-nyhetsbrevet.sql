-- Studsen når nyhetsbrevet.
--
-- email-webhook har tagit emot leverantörens händelser (delivered, bounced,
-- complained, unsubscribed) till email_events sedan juli, och triggern
-- auto_suppress_on_bounce har lagt hårda studsar och klagomål på
-- email_suppressions. Men nyhetsbrevet visste inget: leveransliggaren stod kvar
-- på "sent", prenumeranten på "confirmed", vyn visade 42 skickade när 3 aldrig
-- kom fram — och nästa utskick försökte igen (email-send skippade adressen, så
-- den räknades som "failed"). Odoo visar bounced per mailing; det gör vi nu.
--
--   1. newsletter_subscribers.status får 'bounced': en hård studs tar
--      prenumeranten ur listan tills adressen rättas.
--   2. newsletter_deliveries får 'bounced' | 'complained' | 'suppressed' samt
--      provider_message_id (leverantörens id, för händelser utan taggar),
--      delivered_at, bounce_type, bounced_at, event_note.
--   3. Triggern newsletter_reflect_email_event: varje händelse som bär
--      newsletter_id (Resends tags) eller matchar provider_message_id skrivs på
--      sin leveransrad; hård studs → prenumerant 'bounced', klagomål → 'unsubscribed'.
--      Hårda studsar och klagomål suppressas redan globalt av den äldre triggern.
--   4. newsletter_delivery_summary() räknar delivered/bounced/complained/suppressed.

-- 1 ────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.newsletter_subscribers DROP CONSTRAINT IF EXISTS newsletter_subscribers_status_check;
  ALTER TABLE public.newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_status_check
    CHECK (status IN ('pending', 'confirmed', 'unsubscribed', 'bounced'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2 ────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.newsletter_deliveries DROP CONSTRAINT IF EXISTS newsletter_deliveries_status_check;
  ALTER TABLE public.newsletter_deliveries ADD CONSTRAINT newsletter_deliveries_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'complained', 'suppressed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.newsletter_deliveries
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_type text CHECK (bounce_type IS NULL OR bounce_type IN ('hard', 'soft')),
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_note text;
CREATE INDEX IF NOT EXISTS newsletter_deliveries_provider_message
  ON public.newsletter_deliveries (provider_message_id) WHERE provider_message_id IS NOT NULL;
COMMENT ON COLUMN public.newsletter_deliveries.status IS
  'pending = claimed, outcome unknown · sent = provider accepted · failed = provider rejected · bounced = hard bounce reported back · complained = spam complaint · suppressed = on email_suppressions at send time, never handed to a provider';

-- 3 ────────────────────────────────────────────────────────────────────────
-- Resend echoes the tags the send carried; email-send sends them as an array
-- [{name, value}] and Resend's webhook returns an object {name: value}. Read both.
CREATE OR REPLACE FUNCTION public.newsletter_id_from_event_payload(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE v text; t jsonb;
BEGIN
  IF p_payload IS NULL THEN RETURN NULL; END IF;
  t := p_payload->'tags';
  IF t IS NULL THEN t := p_payload->'data'->'tags'; END IF;
  IF t IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(t) = 'object' THEN
    v := t->>'newsletter_id';
  ELSIF jsonb_typeof(t) = 'array' THEN
    SELECT e->>'value' INTO v FROM jsonb_array_elements(t) e WHERE e->>'name' = 'newsletter_id' LIMIT 1;
  END IF;
  IF v IS NULL OR v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.newsletter_reflect_email_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recipient text := lower(trim(COALESCE(NEW.recipient, '')));
  v_newsletter uuid;
  v_delivery uuid;
  v_hard boolean := COALESCE(NEW.hard_bounce, false);
  v_note text;
BEGIN
  IF NEW.event_type NOT IN ('delivered', 'bounced', 'complained', 'unsubscribed') THEN RETURN NEW; END IF;

  -- Which delivery? The newsletter tag first, then the provider's message id.
  v_newsletter := public.newsletter_id_from_event_payload(NEW.payload);
  IF v_newsletter IS NOT NULL AND v_recipient <> '' THEN
    SELECT id INTO v_delivery FROM newsletter_deliveries
     WHERE newsletter_id = v_newsletter AND lower(recipient_email) = v_recipient
     ORDER BY claimed_at DESC LIMIT 1;
  ELSIF NEW.message_id IS NOT NULL THEN
    SELECT id, newsletter_id INTO v_delivery, v_newsletter FROM newsletter_deliveries
     WHERE provider_message_id = NEW.message_id LIMIT 1;
  END IF;

  v_note := NULLIF(trim(COALESCE(
    NEW.payload->'bounce'->>'message', NEW.payload->'data'->'bounce'->>'message',
    NEW.payload->'bounce'->>'subType', NEW.payload->>'reason', '')), '');

  IF v_delivery IS NOT NULL THEN
    IF NEW.event_type = 'delivered' THEN
      UPDATE newsletter_deliveries SET delivered_at = COALESCE(delivered_at, NEW.created_at) WHERE id = v_delivery;
    ELSIF NEW.event_type = 'bounced' THEN
      UPDATE newsletter_deliveries
         SET status = CASE WHEN v_hard THEN 'bounced' ELSE status END,
             bounce_type = CASE WHEN v_hard THEN 'hard' ELSE 'soft' END,
             bounced_at = NEW.created_at,
             event_note = COALESCE(v_note, CASE WHEN v_hard THEN 'hard bounce' ELSE 'soft bounce' END)
       WHERE id = v_delivery;
    ELSIF NEW.event_type = 'complained' THEN
      UPDATE newsletter_deliveries SET status = 'complained', bounced_at = NEW.created_at,
             event_note = COALESCE(v_note, 'spam complaint') WHERE id = v_delivery;
    END IF;
  END IF;

  -- The subscriber: a hard bounce takes them out of the list until the address is
  -- fixed; a complaint or an unsubscribe is an unsubscribe. The global suppression
  -- (auto_suppress_on_bounce) already stops every other mail to the address.
  IF v_recipient <> '' THEN
    IF NEW.event_type = 'bounced' AND v_hard THEN
      UPDATE newsletter_subscribers SET status = 'bounced', updated_at = now()
       WHERE lower(email) = v_recipient AND status IN ('pending', 'confirmed');
    ELSIF NEW.event_type IN ('complained', 'unsubscribed') THEN
      UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, now()), updated_at = now()
       WHERE lower(email) = v_recipient AND status IN ('pending', 'confirmed', 'bounced');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_newsletter_reflect_email_event ON public.email_events;
CREATE TRIGGER trg_newsletter_reflect_email_event AFTER INSERT ON public.email_events
  FOR EACH ROW EXECUTE FUNCTION public.newsletter_reflect_email_event();
REVOKE EXECUTE ON FUNCTION public.newsletter_reflect_email_event() FROM PUBLIC, anon, authenticated;

-- 4 ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.newsletter_delivery_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH per_newsletter AS (
    SELECT d.newsletter_id,
           count(*) FILTER (WHERE d.status = 'sent')       AS sent,
           count(*) FILTER (WHERE d.status = 'failed')     AS failed,
           count(*) FILTER (WHERE d.status = 'pending')    AS pending,
           count(*) FILTER (WHERE d.status = 'bounced')    AS bounced,
           count(*) FILTER (WHERE d.status = 'complained') AS complained,
           count(*) FILTER (WHERE d.status = 'suppressed') AS suppressed,
           count(*) FILTER (WHERE d.delivered_at IS NOT NULL) AS delivered,
           count(*) FILTER (WHERE d.bounce_type = 'soft' AND d.status = 'sent') AS soft_bounced
      FROM newsletter_deliveries d
     GROUP BY d.newsletter_id
  ), carriers AS (
    SELECT x.newsletter_id, jsonb_object_agg(x.provider, x.n) AS providers
      FROM (SELECT newsletter_id, COALESCE(provider, 'unknown') AS provider, count(*) AS n
              FROM newsletter_deliveries WHERE status IN ('sent', 'bounced', 'complained')
             GROUP BY newsletter_id, COALESCE(provider, 'unknown')) x
     GROUP BY x.newsletter_id
  )
  SELECT CASE
    WHEN NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'newsletter'))
      THEN '[]'::jsonb
    ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'newsletter_id', p.newsletter_id,
        'sent', p.sent, 'failed', p.failed, 'pending', p.pending,
        'bounced', p.bounced, 'complained', p.complained, 'suppressed', p.suppressed,
        'delivered', p.delivered, 'soft_bounced', p.soft_bounced,
        'providers', COALESCE(c.providers, '{}'::jsonb),
        'last_error', (SELECT x.error_message FROM newsletter_deliveries x
                        WHERE x.newsletter_id = p.newsletter_id AND x.status = 'failed' AND x.error_message IS NOT NULL
                        ORDER BY x.claimed_at DESC LIMIT 1)))
        FROM per_newsletter p LEFT JOIN carriers c ON c.newsletter_id = p.newsletter_id), '[]'::jsonb)
  END;
$$;
REVOKE ALL ON FUNCTION public.newsletter_delivery_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.newsletter_delivery_summary() TO authenticated, service_role;
