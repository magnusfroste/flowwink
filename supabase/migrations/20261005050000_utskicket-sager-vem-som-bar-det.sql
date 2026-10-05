-- Utskicket säger vem som bar det.
--
-- synclairvision skickade nyhetsbrev genom Composio/Gmail och Newsletter-sidan
-- varnade "Resend API key is missing" — samtidigt som breven levererades
-- (2026-10-05). Sidan frågade "är Resend på?", email-send frågade "vem bär det
-- här brevet?". Två frågor, två svar. Valet bor nu i _shared/email/provider-choice.ts
-- och läses av båda. Men när tre transporter är möjliga räcker inte "sent" längre
-- för att säga vad som hände: leveransliggaren får en kolumn för vem som bar
-- brevet, och en summering per nyhetsbrev som vyn visar.

ALTER TABLE public.newsletter_deliveries ADD COLUMN IF NOT EXISTS provider text;
COMMENT ON COLUMN public.newsletter_deliveries.provider IS
  'What email-send answered it carried the mail with: resend, smtp, composio — or "simulated" when no provider was active and the mail reached nobody.';

CREATE OR REPLACE FUNCTION public.newsletter_delivery_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH per_newsletter AS (
    SELECT d.newsletter_id,
           count(*) FILTER (WHERE d.status = 'sent')    AS sent,
           count(*) FILTER (WHERE d.status = 'failed')  AS failed,
           count(*) FILTER (WHERE d.status = 'pending') AS pending
      FROM newsletter_deliveries d
     GROUP BY d.newsletter_id
  ), carriers AS (
    SELECT x.newsletter_id, jsonb_object_agg(x.provider, x.n) AS providers
      FROM (SELECT newsletter_id, COALESCE(provider, 'unknown') AS provider, count(*) AS n
              FROM newsletter_deliveries WHERE status = 'sent'
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
        'providers', COALESCE(c.providers, '{}'::jsonb),
        'last_error', (SELECT x.error_message FROM newsletter_deliveries x
                        WHERE x.newsletter_id = p.newsletter_id AND x.status = 'failed' AND x.error_message IS NOT NULL
                        ORDER BY x.claimed_at DESC LIMIT 1)))
        FROM per_newsletter p LEFT JOIN carriers c ON c.newsletter_id = p.newsletter_id), '[]'::jsonb)
  END;
$$;

REVOKE ALL ON FUNCTION public.newsletter_delivery_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.newsletter_delivery_summary() TO authenticated, service_role;
