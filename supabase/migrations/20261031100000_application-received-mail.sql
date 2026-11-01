-- ============================================================
-- Migration: the candidate hears back — application_received in en + sv
-- Date: 2026-10-31
-- Safe to re-run: Yes (seeds only where name + locale are missing)
-- ============================================================
--
-- process-job-application — the one door every application comes through
-- (careers page, job-listings block, FormBlock with a CV field, an agent via
-- submit_job_application) — answers the candidate at once, in their language.
-- The words live here, editable under Communications → Templates; the code
-- passes data only (candidate_name, job_title, site_name). A fragment:
-- email-send frames it in the business's brand. Seeded where (name, locale)
-- is missing, so an operator's own version survives.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('application_received', 'en', 'transactional',
       'We received your application — {{job_title}}',
       '<h2 style="margin:0 0 12px;font-size:20px">Thank you for your application</h2>'
       || '<p>Hi{{#candidate_name}} {{candidate_name}}{{/candidate_name}},</p>'
       || '<p>We have received your application for <strong>{{job_title}}</strong>. We read every application ourselves and will get back to you as soon as we can.</p>'
       || '<p>Kind regards,<br>{{site_name}}</p>',
       '["candidate_name","job_title","site_name"]'),
      ('application_received', 'sv', 'transactional',
       'Vi har tagit emot din ansökan — {{job_title}}',
       '<h2 style="margin:0 0 12px;font-size:20px">Tack för din ansökan</h2>'
       || '<p>Hej{{#candidate_name}} {{candidate_name}}{{/candidate_name}}!</p>'
       || '<p>Vi har tagit emot din ansökan till tjänsten <strong>{{job_title}}</strong>. Vi läser varje ansökan själva och hör av oss så snart vi kan.</p>'
       || '<p>Vänliga hälsningar<br>{{site_name}}</p>',
       '["candidate_name","job_title","site_name"]')
    ) AS t(name, locale, category, subject, html, variables)
  LOOP
    INSERT INTO public.email_templates (name, locale, subject, html, category, variables, active)
    SELECT r.name, r.locale, r.subject, r.html, r.category, r.variables::jsonb, true
    WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE name = r.name AND locale = r.locale);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.email_templates WHERE name = 'application_received' AND locale = 'en') THEN
    RAISE EXCEPTION 'application_received: English version missing after seeding';
  END IF;
END $$;
