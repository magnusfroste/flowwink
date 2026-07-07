-- CRM parity round 8: GDPR consent center, bulk lead email with unsubscribe
-- handling, predictive lead scoring. Idempotent, forward-dated.

-- ============================================================
-- 1. CONSENT CENTER (append-only audit trail; state = latest row)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  consent_type text NOT NULL DEFAULT 'marketing_email'
    CHECK (consent_type IN ('marketing_email', 'newsletter', 'sms', 'profiling', 'analytics')),
  status text NOT NULL CHECK (status IN ('granted', 'revoked')),
  source text,
  note text,
  actor uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_consents_email_idx
  ON public.contact_consents (lower(email), consent_type, occurred_at DESC);

ALTER TABLE public.contact_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_consents_admin_all" ON public.contact_consents;
CREATE POLICY "contact_consents_admin_all" ON public.contact_consents
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Current consent state for one email+type (latest event wins). 'none' = no record.
CREATE OR REPLACE FUNCTION public.fw_consent_state(p_email text, p_type text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT status FROM public.contact_consents
     WHERE lower(email) = lower(p_email) AND consent_type = p_type
     ORDER BY occurred_at DESC, created_at DESC LIMIT 1),
    'none')
$$;

CREATE OR REPLACE FUNCTION public.manage_consent(
  p_action text,
  p_email text DEFAULT NULL,
  p_consent_type text DEFAULT 'marketing_email',
  p_source text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_row public.contact_consents;
  v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage consents';
  END IF;

  IF p_action IN ('grant', 'revoke') THEN
    IF p_email IS NULL THEN RAISE EXCEPTION '% requires p_email', p_action; END IF;
    INSERT INTO public.contact_consents (email, consent_type, status, source, note, actor)
    VALUES (lower(p_email), p_consent_type,
            CASE WHEN p_action = 'grant' THEN 'granted' ELSE 'revoked' END,
            COALESCE(p_source, 'admin'), p_note, auth.uid())
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'consent', to_jsonb(v_row));

  ELSIF p_action = 'check' THEN
    IF p_email IS NULL THEN RAISE EXCEPTION 'check requires p_email'; END IF;
    SELECT COALESCE(jsonb_object_agg(t.consent_type, public.fw_consent_state(p_email, t.consent_type)), '{}'::jsonb)
      INTO v_rows
    FROM (VALUES ('marketing_email'), ('newsletter'), ('sms'), ('profiling'), ('analytics')) AS t(consent_type);
    RETURN jsonb_build_object('success', true, 'email', lower(p_email), 'consents', v_rows,
      'newsletter_unsubscribed', EXISTS (
        SELECT 1 FROM public.newsletter_subscribers
        WHERE lower(email) = lower(p_email) AND status = 'unsubscribed'));

  ELSIF p_action = 'history' THEN
    IF p_email IS NULL THEN RAISE EXCEPTION 'history requires p_email'; END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.occurred_at DESC), '[]'::jsonb) INTO v_rows
    FROM (SELECT * FROM public.contact_consents WHERE lower(email) = lower(p_email)
          ORDER BY occurred_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)) c;
    RETURN jsonb_build_object('success', true, 'history', v_rows);

  ELSIF p_action = 'list' THEN
    -- Current state per email+type (latest event wins)
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT DISTINCT ON (lower(email), consent_type)
             lower(email) AS email, consent_type, status, source, occurred_at
      FROM public.contact_consents
      ORDER BY lower(email), consent_type, occurred_at DESC, created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000)
    ) x;
    RETURN jsonb_build_object('success', true, 'consents', v_rows);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use grant|revoke|check|history|list', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_consent(text, text, text, text, text, integer) TO authenticated, service_role;

-- Keep consent trail in sync with the public preference center (/newsletter/manage):
-- unsubscribing there is a revocation of the newsletter consent; confirming grants it.
CREATE OR REPLACE FUNCTION public.sync_subscriber_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'unsubscribed' THEN
      INSERT INTO public.contact_consents (email, consent_type, status, source)
      VALUES (lower(NEW.email), 'newsletter', 'revoked', 'preference_center');
    ELSIF NEW.status = 'confirmed' THEN
      INSERT INTO public.contact_consents (email, consent_type, status, source)
      VALUES (lower(NEW.email), 'newsletter', 'granted', 'preference_center');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_subscriber_consent ON public.newsletter_subscribers;
CREATE TRIGGER trg_sync_subscriber_consent
  AFTER UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.sync_subscriber_consent();

-- ============================================================
-- 2. BULK LEAD EMAIL (mass mail with unsubscribe + consent exclusions)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_email_blasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  body_html text NOT NULL,
  segment jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('dry_run', 'sending', 'sent', 'failed')),
  targeted_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  excluded_unsubscribed integer NOT NULL DEFAULT 0,
  excluded_revoked integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_email_blast_recipients (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  blast_id uuid NOT NULL REFERENCES public.lead_email_blasts(id) ON DELETE CASCADE,
  lead_id uuid,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'excluded')),
  exclusion_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_email_blast_recipients_blast_idx
  ON public.lead_email_blast_recipients (blast_id);

ALTER TABLE public.lead_email_blasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_email_blast_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_email_blasts_admin_all" ON public.lead_email_blasts;
CREATE POLICY "lead_email_blasts_admin_all" ON public.lead_email_blasts
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "lead_email_blast_recipients_admin_all" ON public.lead_email_blast_recipients;
CREATE POLICY "lead_email_blast_recipients_admin_all" ON public.lead_email_blast_recipients
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Resolve the base URL + a JWT for calling our own edge functions from SQL.
-- Vault first (fleet instances), then any registered cron job's embedded token
-- (Lovable-managed instances register crons with the anon key).
CREATE OR REPLACE FUNCTION public.fw_edge_credentials()
RETURNS TABLE (base_url text, token text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_token text;
  v_cmd text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_url := NULL; v_token := NULL;
  END;
  IF v_url IS NULL OR v_token IS NULL THEN
    SELECT command INTO v_cmd FROM cron.job
    WHERE command LIKE '%/functions/v1/%' AND command LIKE '%Bearer %'
    ORDER BY jobid LIMIT 1;
    IF v_cmd IS NOT NULL THEN
      v_url := COALESCE(v_url, (regexp_match(v_cmd, '(https://[a-z0-9]+\.supabase\.co)/functions/v1/'))[1]);
      v_token := COALESCE(v_token, (regexp_match(v_cmd, 'Bearer ([A-Za-z0-9_\.\-]+)'))[1]);
    END IF;
  END IF;
  IF v_url IS NULL OR v_token IS NULL THEN
    RAISE EXCEPTION 'No edge-function credentials available (vault empty and no cron jobs registered)';
  END IF;
  RETURN QUERY SELECT v_url, v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_bulk_lead_email(
  p_subject text,
  p_body_html text,
  p_statuses text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_min_score integer DEFAULT NULL,
  p_stage_key text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_dry_run boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_blast_id uuid;
  v_url text;
  v_token text;
  v_site_url text;
  v_targeted integer := 0;
  v_sent integer := 0;
  v_excl_unsub integer := 0;
  v_excl_revoked integer := 0;
  v_footer text;
  v_unsub text;
  r record;
  v_sample jsonb := '[]'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can send bulk lead email';
  END IF;
  IF p_subject IS NULL OR p_body_html IS NULL THEN
    RAISE EXCEPTION 'p_subject and p_body_html are required';
  END IF;

  SELECT value #>> '{}' INTO v_site_url FROM public.site_settings WHERE key = 'siteUrl';

  IF NOT p_dry_run THEN
    SELECT base_url, token INTO v_url, v_token FROM public.fw_edge_credentials();
  END IF;

  v_blast_id := gen_random_uuid();

  -- Create the blast header first so recipient rows can reference it (FK).
  IF NOT p_dry_run THEN
    INSERT INTO public.lead_email_blasts (id, subject, body_html, segment, status, created_by)
    VALUES (v_blast_id, p_subject, p_body_html,
      jsonb_build_object('statuses', p_statuses, 'sources', p_sources,
                         'min_score', p_min_score, 'stage_key', p_stage_key, 'limit', p_limit),
      'sending', auth.uid());
  END IF;

  FOR r IN
    SELECT DISTINCT ON (lower(l.email)) l.id, l.email, l.name
    FROM public.leads l
    LEFT JOIN public.pipeline_stages ps ON ps.id = l.stage_id
    WHERE l.email IS NOT NULL AND l.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      AND (p_statuses IS NULL OR l.status::text = ANY (p_statuses))
      AND (p_sources IS NULL OR l.source = ANY (p_sources))
      AND (p_min_score IS NULL OR l.score >= p_min_score)
      AND (p_stage_key IS NULL OR ps.key = p_stage_key)
    ORDER BY lower(l.email), l.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  LOOP
    v_targeted := v_targeted + 1;

    IF EXISTS (SELECT 1 FROM public.newsletter_subscribers
               WHERE lower(email) = lower(r.email) AND status = 'unsubscribed') THEN
      v_excl_unsub := v_excl_unsub + 1;
      IF NOT p_dry_run THEN
        INSERT INTO public.lead_email_blast_recipients (blast_id, lead_id, email, status, exclusion_reason)
        VALUES (v_blast_id, r.id, r.email, 'excluded', 'unsubscribed');
      END IF;
      CONTINUE;
    END IF;

    IF public.fw_consent_state(r.email, 'marketing_email') = 'revoked'
       OR public.fw_consent_state(r.email, 'newsletter') = 'revoked' THEN
      v_excl_revoked := v_excl_revoked + 1;
      IF NOT p_dry_run THEN
        INSERT INTO public.lead_email_blast_recipients (blast_id, lead_id, email, status, exclusion_reason)
        VALUES (v_blast_id, r.id, r.email, 'excluded', 'consent_revoked');
      END IF;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      IF v_sent < 10 THEN
        v_sample := v_sample || jsonb_build_object('email', r.email, 'name', r.name);
      END IF;
      v_sent := v_sent + 1;
      CONTINUE;
    END IF;

    -- Make sure the recipient exists on the unsubscribe list machinery
    -- (keeps status of already-known subscribers, incl. unsubscribed).
    INSERT INTO public.newsletter_subscribers (email, name, status, metadata)
    VALUES (lower(r.email), r.name, 'confirmed', jsonb_build_object('source', 'crm_blast'))
    ON CONFLICT (email) DO NOTHING;

    v_unsub := CASE WHEN COALESCE(v_site_url, '') <> ''
      THEN v_site_url || '/newsletter/manage?action=unsubscribe&email=' || r.email
      ELSE v_url || '/functions/v1/newsletter/subscribe?action=unsubscribe&email=' || r.email END;
    v_footer := '<hr style="margin-top:24px;border:none;border-top:1px solid #eee">'
      || '<p style="font-size:12px;color:#888">You receive this because you are in contact with us. '
      || '<a href="' || v_unsub || '">Unsubscribe</a></p>';

    PERFORM net.http_post(
      url := v_url || '/functions/v1/email-send',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_token),
      body := jsonb_build_object(
        'to', r.email,
        'subject', p_subject,
        'html', p_body_html || v_footer,
        'source', 'crm_blast',
        'related_entity_type', 'lead_email_blast',
        'related_entity_id', v_blast_id::text,
        'tags', jsonb_build_object('blast_id', v_blast_id::text)
      )
    );

    INSERT INTO public.lead_email_blast_recipients (blast_id, lead_id, email, status)
    VALUES (v_blast_id, r.id, r.email, 'sent');
    INSERT INTO public.lead_activities (lead_id, type, metadata, points)
    VALUES (r.id, 'bulk_email_sent', jsonb_build_object('blast_id', v_blast_id, 'subject', p_subject), 0);
    v_sent := v_sent + 1;
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE public.lead_email_blasts
      SET status = 'sent', targeted_count = v_targeted, sent_count = v_sent,
          excluded_unsubscribed = v_excl_unsub, excluded_revoked = v_excl_revoked
      WHERE id = v_blast_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'dry_run', p_dry_run,
    'blast_id', CASE WHEN p_dry_run THEN NULL ELSE v_blast_id END,
    'targeted', v_targeted, 'sent', v_sent,
    'excluded_unsubscribed', v_excl_unsub, 'excluded_consent_revoked', v_excl_revoked,
    'sample', CASE WHEN p_dry_run THEN v_sample ELSE NULL END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_bulk_lead_email(text, text, text[], text[], integer, text, integer, boolean) TO authenticated, service_role;

-- ============================================================
-- 3. PREDICTIVE LEAD SCORING (frequency-based Bayes over closed outcomes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.predict_lead_score(
  p_lead_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_apply boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lead public.leads;
  v_won bigint;
  v_lost bigint;
  v_prior numeric;
  v_odds numeric;
  v_prob numeric;
  v_factors jsonb := '[]'::jsonb;
  v_model text := 'bayes';
  v_activity_count bigint;
  -- feature helpers
  f_name text;
  f_value text;
  v_w bigint; v_l bigint; v_lr numeric;
  v_free_domains text[] := ARRAY['gmail.com','hotmail.com','outlook.com','yahoo.com','icloud.com','live.com','aol.com','protonmail.com'];
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can run predictive scoring';
  END IF;

  IF p_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  ELSIF p_email IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads WHERE lower(email) = lower(p_email)
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Provide p_lead_id or p_email';
  END IF;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;

  SELECT count(*) FILTER (WHERE status = 'customer' OR converted_at IS NOT NULL),
         count(*) FILTER (WHERE status = 'lost')
    INTO v_won, v_lost
  FROM public.leads WHERE id <> v_lead.id;

  SELECT count(*) INTO v_activity_count FROM public.lead_activities WHERE lead_id = v_lead.id;

  IF v_won + v_lost < 10 THEN
    -- Not enough closed history for a data-driven model: heuristic fallback.
    v_model := 'heuristic_fallback';
    v_prob := LEAST(0.95, GREATEST(0.02,
      0.10
      + CASE WHEN v_lead.company_id IS NOT NULL THEN 0.15 ELSE 0 END
      + CASE WHEN v_lead.phone IS NOT NULL THEN 0.10 ELSE 0 END
      + CASE WHEN split_part(lower(v_lead.email), '@', 2) <> ALL (v_free_domains) THEN 0.10 ELSE 0 END
      + LEAST(0.35, v_activity_count * 0.05)));
    v_factors := jsonb_build_array(jsonb_build_object(
      'factor', 'heuristic', 'detail',
      'fewer than 10 closed leads in history — attribute+engagement heuristic used'));
  ELSE
    v_prior := (v_won + 1.0) / (v_won + v_lost + 2.0);
    v_odds := v_prior / (1.0 - v_prior);

    -- Feature loop: source, email domain class, has_phone, has_company, activity bucket
    FOR f_name, f_value IN
      SELECT * FROM (VALUES
        ('source', COALESCE(v_lead.source, 'unknown')),
        ('domain_class', CASE WHEN split_part(lower(v_lead.email), '@', 2) = ANY (v_free_domains)
                              THEN 'free' ELSE 'corporate' END),
        ('has_phone', CASE WHEN v_lead.phone IS NULL THEN 'no' ELSE 'yes' END),
        ('has_company', CASE WHEN v_lead.company_id IS NULL THEN 'no' ELSE 'yes' END),
        ('activity_bucket', CASE WHEN v_activity_count = 0 THEN '0'
                                 WHEN v_activity_count <= 2 THEN '1-2'
                                 WHEN v_activity_count <= 5 THEN '3-5' ELSE '6+' END)
      ) t(name, value)
    LOOP
      IF f_name = 'source' THEN
        SELECT count(*) FILTER (WHERE (status = 'customer' OR converted_at IS NOT NULL) AND COALESCE(source,'unknown') = f_value),
               count(*) FILTER (WHERE status = 'lost' AND COALESCE(source,'unknown') = f_value)
          INTO v_w, v_l FROM public.leads WHERE id <> v_lead.id;
      ELSIF f_name = 'domain_class' THEN
        SELECT count(*) FILTER (WHERE (status = 'customer' OR converted_at IS NOT NULL)
                 AND (CASE WHEN split_part(lower(email),'@',2) = ANY (v_free_domains) THEN 'free' ELSE 'corporate' END) = f_value),
               count(*) FILTER (WHERE status = 'lost'
                 AND (CASE WHEN split_part(lower(email),'@',2) = ANY (v_free_domains) THEN 'free' ELSE 'corporate' END) = f_value)
          INTO v_w, v_l FROM public.leads WHERE id <> v_lead.id;
      ELSIF f_name = 'has_phone' THEN
        SELECT count(*) FILTER (WHERE (status = 'customer' OR converted_at IS NOT NULL)
                 AND (CASE WHEN phone IS NULL THEN 'no' ELSE 'yes' END) = f_value),
               count(*) FILTER (WHERE status = 'lost'
                 AND (CASE WHEN phone IS NULL THEN 'no' ELSE 'yes' END) = f_value)
          INTO v_w, v_l FROM public.leads WHERE id <> v_lead.id;
      ELSIF f_name = 'has_company' THEN
        SELECT count(*) FILTER (WHERE (status = 'customer' OR converted_at IS NOT NULL)
                 AND (CASE WHEN company_id IS NULL THEN 'no' ELSE 'yes' END) = f_value),
               count(*) FILTER (WHERE status = 'lost'
                 AND (CASE WHEN company_id IS NULL THEN 'no' ELSE 'yes' END) = f_value)
          INTO v_w, v_l FROM public.leads WHERE id <> v_lead.id;
      ELSE -- activity_bucket
        SELECT count(*) FILTER (WHERE (l.status = 'customer' OR l.converted_at IS NOT NULL) AND b.bucket = f_value),
               count(*) FILTER (WHERE l.status = 'lost' AND b.bucket = f_value)
          INTO v_w, v_l
        FROM public.leads l
        LEFT JOIN LATERAL (
          SELECT CASE WHEN count(*) = 0 THEN '0' WHEN count(*) <= 2 THEN '1-2'
                      WHEN count(*) <= 5 THEN '3-5' ELSE '6+' END AS bucket
          FROM public.lead_activities la WHERE la.lead_id = l.id
        ) b ON true
        WHERE l.id <> v_lead.id;
      END IF;

      -- Laplace-smoothed likelihood ratio P(f|won)/P(f|lost)
      v_lr := ((v_w + 1.0) / (v_won + 2.0)) / ((v_l + 1.0) / (v_lost + 2.0));
      v_odds := v_odds * v_lr;
      v_factors := v_factors || jsonb_build_object(
        'factor', f_name, 'value', f_value,
        'won_with', v_w, 'lost_with', v_l,
        'likelihood_ratio', round(v_lr, 3),
        'direction', CASE WHEN v_lr > 1.05 THEN 'positive'
                          WHEN v_lr < 0.95 THEN 'negative' ELSE 'neutral' END);
    END LOOP;

    v_prob := v_odds / (1.0 + v_odds);
  END IF;

  IF p_apply THEN
    UPDATE public.leads SET score = round(v_prob * 100)::integer, updated_at = now()
      WHERE id = v_lead.id;
    INSERT INTO public.lead_activities (lead_id, type, metadata, points)
    VALUES (v_lead.id, 'predictive_scoring',
            jsonb_build_object('model', v_model, 'probability_pct', round(v_prob * 100, 1)), 0);
  END IF;

  RETURN jsonb_build_object('success', true, 'lead_id', v_lead.id, 'email', v_lead.email,
    'model', v_model, 'win_probability_pct', round(v_prob * 100, 1),
    'training_won', v_won, 'training_lost', v_lost,
    'applied_to_score', p_apply, 'factors', v_factors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.predict_lead_score(uuid, text, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
