
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_score_visitor_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_anon text;
BEGIN
  -- Only fire when a lead has identifiable contact info
  IF NEW.email IS NULL AND NEW.phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: only fire when email/phone just became present
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.email IS NOT DISTINCT FROM NEW.email)
       AND (OLD.phone IS NOT DISTINCT FROM NEW.phone) THEN
      RETURN NEW;
    END IF;
  END IF;

  v_url  := 'https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/score-visitor-intent';
  v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpvdHhmZmpmc2RsaHJka3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTk2MzAsImV4cCI6MjA4MTEzNTYzMH0.h_S8ZHuCWWz97-uzQge0sb3riHmElrKTTfs5jrwE72c';

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon
    ),
    body    := jsonb_build_object('lead_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a lead insert if the async call fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_score_on_identify ON public.leads;
CREATE TRIGGER leads_score_on_identify
AFTER INSERT OR UPDATE OF email, phone ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_score_visitor_intent();
