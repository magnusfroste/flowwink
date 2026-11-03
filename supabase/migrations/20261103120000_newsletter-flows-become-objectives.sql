-- Newsletter flows become FlowPilot objectives.
--
-- A flow used to be an agent_automations row running lead_nurture_sequence on
-- a cron or an event with fixed arguments. That skill saves ONE email someone
-- WROTE for ONE lead (lead_id, subject, content_md required), so no such row
-- could ever succeed: optic's "Re-engagement sequence" failed every Monday
-- with "lead_id is required" (2026-11-03). A flow needs judgement — which
-- leads, what to say — which is what FlowPilot's heartbeat brings to an
-- objective. The Flows tab now writes objectives (src/lib/newsletter-flows.ts,
-- whose goal texts this file mirrors; the guardrail test
-- newsletter-flows-are-objectives keeps them identical).
--
-- Each old row becomes one paused objective (at most one per flow kind — an
-- existing flow objective wins) and the row is removed. Paused, not active: the
-- old row never produced a draft, so turning FlowPilot loose on the lead list
-- is a person's decision, made on the Flows tab.
--
-- Idempotent: a second run finds no lead_nurture_sequence automations left.

DO $flows$
DECLARE
  r record;
  k text;
  p record;
BEGIN
  IF to_regclass('public.agent_automations') IS NULL OR to_regclass('public.agent_objectives') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, skill_arguments
    FROM public.agent_automations
    WHERE skill_name = 'lead_nurture_sequence'
      AND NOT (COALESCE(skill_arguments, '{}'::jsonb) ? 'content_md')
  LOOP
    k := CASE replace(COALESCE(r.skill_arguments->>'sequence_type', ''), '-', '_')
           WHEN 're_engage' THEN 're_engage'
           WHEN 'upsell' THEN 'upsell'
           ELSE 'welcome'
         END;

    SELECT * INTO p FROM (VALUES
    ('welcome', 'Newsletter flow — welcome: every day, find leads created since yesterday that have no welcome draft yet (manage_leads list), read each one (manage_leads get) and write a short welcome email in the site''s language, saved with lead_nurture_sequence (sequence_type welcome). Drafts only — a person reviews and sends them. This is a standing flow: never complete it.', 10, 'day'),
    ('re_engage', 'Newsletter flow — re-engage: once a week, find leads with no activity in the last 60 days and no re-engage draft in the last 30 (manage_leads list), read each one (manage_leads get) and write a short re-engagement email in the site''s language, saved with lead_nurture_sequence (sequence_type re-engage). Drafts only — a person reviews and sends them. This is a standing flow: never complete it.', 20, 'week'),
    ('upsell', 'Newsletter flow — upsell: every day, find leads with an order completed since yesterday and no upsell draft yet, read each one (manage_leads get) and write a short follow-up offering related products in the site''s language, saved with lead_nurture_sequence (sequence_type upsell). Drafts only — a person reviews and sends them. This is a standing flow: never complete it.', 10, 'day')
    ) AS presets(key, goal, max_per, per)
    WHERE presets.key = k;

    IF NOT EXISTS (
      SELECT 1 FROM public.agent_objectives WHERE constraints->>'newsletter_flow' = k
    ) THEN
      INSERT INTO public.agent_objectives (goal, status, constraints, success_criteria)
      VALUES (
        p.goal,
        'paused',
        jsonb_build_object(
          'newsletter_flow', k,
          'standing', true,
          'no_destructive_actions', true,
          'cadence', jsonb_build_object('counts', 'lead_nurture_sequence', 'max', p.max_per, 'per', p.per)
        ),
        '{}'::jsonb
      );
    END IF;

    DELETE FROM public.agent_automations WHERE id = r.id;
  END LOOP;
END
$flows$;
