-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Helper function to dispatch events/signals via edge functions
CREATE OR REPLACE FUNCTION public.dispatch_automation_event(
  event_name text,
  signal_name text,
  payload jsonb,
  entity_type text DEFAULT NULL,
  entity_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url text;
  service_key text;
  headers jsonb;
BEGIN
  supabase_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1);
  service_key := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1);
  
  IF supabase_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for automation dispatch';
    RETURN;
  END IF;

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || service_key
  );

  -- Fire event to send-webhook
  IF event_name IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-webhook',
      headers := headers,
      body := jsonb_build_object(
        'event', event_name,
        'data', payload
      )
    );
  END IF;

  -- Fire signal to signal-dispatcher
  IF signal_name IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/signal-dispatcher',
      headers := headers,
      body := jsonb_build_object(
        'signal', signal_name,
        'data', payload,
        'context', jsonb_build_object(
          'entity_type', COALESCE(entity_type, 'unknown'),
          'entity_id', COALESCE(entity_id, '')
        )
      )
    );
  END IF;
END;
$$;

-- TRIGGER: New lead created
CREATE OR REPLACE FUNCTION public.trigger_lead_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'lead.created', 'lead_created',
    jsonb_build_object('id', NEW.id, 'email', NEW.email, 'name', COALESCE(NEW.name, ''), 'source', NEW.source, 'score', COALESCE(NEW.score, 0), 'status', NEW.status::text),
    'lead', NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_lead_created AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.trigger_lead_created();

-- TRIGGER: Lead score/status updated
CREATE OR REPLACE FUNCTION public.trigger_lead_score_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.score IS DISTINCT FROM NEW.score THEN
    PERFORM dispatch_automation_event(
      'lead.score_updated', 'lead_score_updated',
      jsonb_build_object('id', NEW.id, 'email', NEW.email, 'score', COALESCE(NEW.score, 0), 'old_score', COALESCE(OLD.score, 0), 'status', NEW.status::text),
      'lead', NEW.id::text
    );
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM dispatch_automation_event(
      'lead.status_changed', 'lead_status_changed',
      jsonb_build_object('id', NEW.id, 'email', NEW.email, 'old_status', OLD.status::text, 'new_status', NEW.status::text, 'score', COALESCE(NEW.score, 0)),
      'lead', NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_lead_updated AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.trigger_lead_score_changed();

-- TRIGGER: Blog post published
CREATE OR REPLACE FUNCTION public.trigger_blog_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status = 'published' THEN
    PERFORM dispatch_automation_event(
      'blog.published', 'blog_published',
      jsonb_build_object('id', NEW.id, 'title', NEW.title, 'slug', NEW.slug, 'excerpt', COALESCE(NEW.excerpt, '')),
      'blog_post', NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_blog_published AFTER UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.trigger_blog_published();

-- TRIGGER: New booking created
CREATE OR REPLACE FUNCTION public.trigger_booking_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'booking.created', 'booking_created',
    jsonb_build_object('id', NEW.id, 'customer_name', NEW.customer_name, 'customer_email', NEW.customer_email, 'start_time', NEW.start_time, 'status', NEW.status),
    'booking', NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_booking_created AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.trigger_booking_created();

-- TRIGGER: New form submission
CREATE OR REPLACE FUNCTION public.trigger_form_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'form.submitted', 'form_submitted',
    jsonb_build_object('id', NEW.id, 'form_name', COALESCE(NEW.form_name, 'unknown'), 'block_id', NEW.block_id, 'data', NEW.data),
    'form_submission', NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_form_submitted AFTER INSERT ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.trigger_form_submitted();

-- TRIGGER: New order placed
CREATE OR REPLACE FUNCTION public.trigger_order_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'order.created', 'order_created',
    jsonb_build_object('id', NEW.id, 'customer_email', NEW.customer_email, 'total_cents', NEW.total_cents, 'currency', NEW.currency, 'status', NEW.status),
    'order', NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_order_created AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trigger_order_created();