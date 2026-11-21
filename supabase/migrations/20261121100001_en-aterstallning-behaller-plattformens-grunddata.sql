-- A reset keeps the platform's own configuration (2026-11-21).
--
-- A fresh install fills 31 tables from migrations. The sandbox wipe kept 24 of
-- them, and reset_site_data (the admin's "Reset site data") 14. Migrations never
-- run twice, so whatever a wipe takes and nothing puts back is gone for good.
-- Read on sandbox the morning after its 04:00 rebuild: no stock locations (WH/MAIN
-- and the rest — inventory has nowhere to put a thing), no trash sources (Trash is
-- empty), no outreach country policy, no HR rule templates, no year-end statement
-- sections, no cron cadence profiles, no partner titles. reset_site_data also
-- emptied the automations, which the skill sync never adds back (it remembers
-- every name it seeded once), and the journals, tax boxes, pipeline stages,
-- business hours, units and the rest the sandbox wipe already keeps.
--
-- Both wipes now keep those tables. The seven that were already wiped are filled
-- again where they are empty (sandbox) — an instance that has rows is not touched.
-- The rows are the ones a fresh install writes.

CREATE OR REPLACE FUNCTION public.sandbox_reset_wipe(p_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  KEEP text[] := ARRAY[
    -- identity, config, agent surface
    'agent_skills','agent_automations','agent_trust_policies',
    'site_settings','user_roles','profiles','api_keys',
    -- role/nav matrix (empty here = every non-admin sees an empty product)
    'role_module_access','role_module_access_defaults',
    -- accounting reference
    'chart_of_accounts','account_roles','accounting_templates','locale_packs',
    'account_tax_boxes','journals','currencies',
    -- operational reference
    'payroll_country_profiles','expense_rate_tables','postal_code_rules',
    'pipeline_stages','business_hours',
    'uoms','uom_categories',
    -- platform reference only a migration seeds (2026-11-21: sandbox had none of it)
    'account_statement_sections','cron_cadence','hr_rule_templates',
    'outreach_country_policy','partner_titles','stock_locations','trash_sources'
  ];
  _demo jsonb;
  _legacy jsonb;
  _admin_email text;
  _tables text[];
  _users_deleted int := 0;
  _skill_count int;
  _settings_count int;
BEGIN
  -- FIRST. Before the confirm token, before the role check, before anything
  -- that could be satisfied by an operator who knows the password. On a testbed
  -- there is no correct set of arguments to this function.
  PERFORM public.assert_not_testbed('sandbox_reset_wipe');

  IF p_confirm IS DISTINCT FROM 'WIPE-SANDBOX' THEN
    RAISE EXCEPTION 'sandbox_reset_wipe requires p_confirm = ''WIPE-SANDBOX''';
  END IF;

  SELECT value INTO _demo   FROM public.site_settings WHERE key = 'demo_mode';
  SELECT value INTO _legacy FROM public.site_settings WHERE key = 'sandbox_mode';
  IF NOT (
       _demo = 'true'::jsonb OR (_demo ->> 'enabled') = 'true'
    OR _legacy = 'true'::jsonb OR (_legacy ->> 'enabled') = 'true'
  ) THEN
    RAISE EXCEPTION 'sandbox_reset_wipe refused: this instance is not a demo (site_settings.demo_mode is not enabled)';
  END IF;

  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only service_role or an admin can reset the sandbox';
  END IF;

  SELECT COALESCE(
    NULLIF((SELECT value #>> '{}' FROM public.site_settings WHERE key = 'sandbox_admin_email'), ''),
    'demo@flowwink.com'
  ) INTO _admin_email;

  SELECT array_agg(tablename ORDER BY tablename) INTO _tables
    FROM pg_tables
   WHERE schemaname = 'public'
     AND NOT (tablename = ANY(KEEP));

  IF _tables IS NOT NULL AND array_length(_tables, 1) > 0 THEN
    EXECUTE 'TRUNCATE TABLE '
      || (SELECT string_agg(format('public.%I', t), ', ') FROM unnest(_tables) AS t)
      || ' RESTART IDENTITY CASCADE';
  END IF;

  DELETE FROM auth.users WHERE lower(email) IS DISTINCT FROM lower(_admin_email);
  GET DIAGNOSTICS _users_deleted = ROW_COUNT;
  UPDATE auth.users
     SET encrypted_password = extensions.crypt('demo1234', extensions.gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now())
   WHERE lower(email) = lower(_admin_email);

  SELECT count(*) INTO _skill_count FROM public.agent_skills;
  SELECT count(*) INTO _settings_count FROM public.site_settings;
  IF _skill_count = 0 OR _settings_count = 0 THEN
    RAISE EXCEPTION 'sandbox_reset_wipe rollback: a keep-table was emptied (agent_skills=%, site_settings=%)',
      _skill_count, _settings_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(_admin_email)) THEN
    RAISE EXCEPTION 'sandbox_reset_wipe rollback: sandbox admin % missing after auth normalize', _admin_email;
  END IF;

  -- The platform's mail templates are seeded by migrations, which never run
  -- again: the wipe emptied them and nothing put them back.
  PERFORM public.seed_platform_email_templates();

  RETURN jsonb_build_object(
    'tables_wiped', COALESCE(array_length(_tables, 1), 0),
    'users_deleted', _users_deleted,
    'admin_email', _admin_email,
    'skills_kept', _skill_count
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.reset_site_data(p_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  KEEP text[] := ARRAY[
    -- identity & access (admin user survives)
    'profiles','user_roles','role_module_access','role_module_access_defaults',
    -- instance config & credentials (Supabase/gateway connections)
    'site_settings','api_keys',
    -- seeded platform layers
    'agent_skills','agent_skill_packs','agent_trust_policies',
    'chart_of_accounts','account_roles','accounting_templates','locale_packs','currencies',
    -- what the sandbox wipe keeps too: the automations (the sync never re-adds a
    -- name it seeded once), journals, tax boxes, pipeline stages, hours, units
    'agent_automations','account_tax_boxes','journals','pipeline_stages','business_hours',
    'payroll_country_profiles','expense_rate_tables','postal_code_rules','uoms','uom_categories',
    -- platform reference only a migration seeds (2026-11-21: sandbox had none of it)
    'account_statement_sections','cron_cadence','hr_rule_templates',
    'outreach_country_policy','partner_titles','stock_locations','trash_sources',
    -- migration bookkeeping
    -- the business's mail templates: its own wording, and the platform's seeds
    'email_templates',
    'schema_migrations','supabase_migrations'
  ];
  _tables text[];
  _skills int;
  _settings int;
  _roles int;
  _profiles int;
BEGIN
  PERFORM set_config('app.archive_override', 'on', true);
  PERFORM public.assert_not_testbed('reset_site_data');

  IF p_confirm IS DISTINCT FROM 'RESET-SITE' THEN
    RAISE EXCEPTION 'reset_site_data requires p_confirm = ''RESET-SITE''';
  END IF;

  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only an admin can reset the site';
  END IF;

  SELECT array_agg(tablename ORDER BY tablename) INTO _tables
    FROM pg_tables
   WHERE schemaname = 'public'
     AND NOT (tablename = ANY(KEEP));

  IF _tables IS NOT NULL AND array_length(_tables, 1) > 0 THEN
    EXECUTE 'TRUNCATE TABLE '
      || (SELECT string_agg(format('public.%I', t), ', ') FROM unnest(_tables) AS t)
      || ' RESTART IDENTITY CASCADE';
  END IF;

  SELECT count(*) INTO _skills FROM public.agent_skills;
  SELECT count(*) INTO _settings FROM public.site_settings;
  SELECT count(*) INTO _roles FROM public.user_roles;
  SELECT count(*) INTO _profiles FROM public.profiles;

  IF _skills = 0 OR _settings = 0 OR _roles = 0 OR _profiles = 0 THEN
    RAISE EXCEPTION 'reset_site_data rollback: a keep-table was emptied (skills=%, settings=%, user_roles=%, profiles=%)',
      _skills, _settings, _roles, _profiles;
  END IF;

  RETURN jsonb_build_object(
    'tables_wiped', COALESCE(array_length(_tables, 1), 0),
    'tables_kept', array_length(KEEP, 1),
    'skills_kept', _skills,
    'admins_kept', _roles
  );
END $fn$;

REVOKE ALL ON FUNCTION public.sandbox_reset_wipe(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sandbox_reset_wipe(text) TO service_role;
REVOKE ALL ON FUNCTION public.reset_site_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_site_data(text) TO authenticated, service_role;

-- ── The seven tables, filled again where a wipe left them empty ─────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.account_statement_sections) THEN
    INSERT INTO public.account_statement_sections (id, locale, section, account_code, description, created_at) VALUES ('78744386-9513-4a54-b641-d8dc63f5b20b', 'se-bas2024', 'year_result', '8990', 'Resultat', '2026-11-21 01:13:41.754624+00');
    INSERT INTO public.account_statement_sections (id, locale, section, account_code, description, created_at) VALUES ('f4e61f3e-ef07-4512-85f9-0db9da87e65a', 'se-bas2024', 'year_result', '8999', 'Årets resultat', '2026-11-21 01:13:41.754624+00');
    INSERT INTO public.account_statement_sections (id, locale, section, account_code, description, created_at) VALUES ('c80425c5-f717-4636-b86b-4c180a87b5b9', 'se-bas2024', 'income_tax', '8910', 'Skatt som belastar årets resultat', '2026-11-21 01:13:41.754624+00');
    INSERT INTO public.account_statement_sections (id, locale, section, account_code, description, created_at) VALUES ('775a91ca-92bc-4450-ba89-e537a88300fb', 'se-bas2024', 'income_tax', '8920', 'Skatt på grund av ändrad beskattning', '2026-11-21 01:13:41.754624+00');
    INSERT INTO public.account_statement_sections (id, locale, section, account_code, description, created_at) VALUES ('ae6fd4a9-18d1-45bc-8175-f317be138e14', 'se-bas2024', 'income_tax', '8930', 'Restituerad skatt', '2026-11-21 01:13:41.754624+00');
    INSERT INTO public.account_statement_sections (id, locale, section, account_code, description, created_at) VALUES ('f0073628-28c0-4c95-9b7a-193b1e3b8eaa', 'se-bas2024', 'income_tax', '8940', 'Uppskjuten skatt', '2026-11-21 01:13:41.754624+00');
    INSERT INTO public.account_statement_sections (id, locale, section, account_code, description, created_at) VALUES ('d6803970-a6d7-4b23-8bed-73010c699362', 'se-bas2024', 'income_tax', '8980', 'Övriga skatter', '2026-11-21 01:13:41.754624+00');
    INSERT INTO public.account_statement_sections (id, locale, section, account_code, description, created_at) VALUES ('2a1e3d3d-9b55-4897-80b9-f536061fdf44', 'ifrs-generic', 'income_tax', '8000', 'Income Tax Expense', '2026-11-21 01:13:41.754624+00');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cron_cadence) THEN
    INSERT INTO public.cron_cadence (jobname, low, balanced, high, note) VALUES ('event-dispatcher-every-minute', '1-59/5 * * * *', '* * * * *', '* * * * *', 'Drains agent_events; pulses only when something is unprocessed.');
    INSERT INTO public.cron_cadence (jobname, low, balanced, high, note) VALUES ('automation-dispatcher-every-minute', '3-59/5 * * * *', '* * * * *', '* * * * *', 'Runs due automations/workflows/tasks; pulses only when something is due.');
    INSERT INTO public.cron_cadence (jobname, low, balanced, high, note) VALUES ('voice-calls-sweep-stale', '2-59/5 * * * *', '* * * * *', '* * * * *', 'SQL only; marks abandoned calls.');
    INSERT INTO public.cron_cadence (jobname, low, balanced, high, note) VALUES ('knowledge-indexer', '7-59/15 * * * *', '*/5 * * * *', '*/2 * * * *', 'Chunks, embeds, extracts; pulses only when the queue has rows.');
    INSERT INTO public.cron_cadence (jobname, low, balanced, high, note) VALUES ('newsletter-dispatch-scheduled', '4-59/15 * * * *', '*/5 * * * *', '*/5 * * * *', 'Pulses only when a newsletter is scheduled and due.');
    INSERT INTO public.cron_cadence (jobname, low, balanced, high, note) VALUES ('gmail-reconcile', '6-59/15 * * * *', '*/5 * * * *', '*/5 * * * *', 'Already skips itself when no mailbox is connected.');
    INSERT INTO public.cron_cadence (jobname, low, balanced, high, note) VALUES ('publish-scheduled-pages', '8-59/15 * * * *', '*/5 * * * *', '*/5 * * * *', 'SQL only.');
    INSERT INTO public.cron_cadence (jobname, low, balanced, high, note) VALUES ('flowpilot-heartbeat', '0 6 * * *', '0 0,12 * * *', '0 */6 * * *', 'The autonomous loop; the expensive one.');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hr_rule_templates) THEN
    INSERT INTO public.hr_rule_templates (country, label, employer_notice, employee_notice, probation_max_months, probation_end_notice_days, vacation_days, laws, notes, updated_at) VALUES ('SE', 'Sweden', '[{"months": 1, "from_years": 0}, {"months": 2, "from_years": 2}, {"months": 3, "from_years": 4}, {"months": 4, "from_years": 6}, {"months": 5, "from_years": 8}, {"months": 6, "from_years": 10}]', '[{"months": 1, "from_years": 0}]', 6, 14, 25, '{"onboarding.benefits": "Without a collective agreement no law requires occupational pension or the agreement insurances; with one (kollektivavtal) they are part of the deal.", "onboarding.contract": "LAS 6 c § — the essential terms in writing no later than 7 days after the first day, the rest within a month. Employment is permanent unless the contract says otherwise (LAS 4 §).", "onboarding.vacation": "Semesterlagen 4 § — 25 vacation days a year. In the first year, how many of them are paid depends on the earning year (7 §); the rest can be taken unpaid.", "offboarding.decision": "LAS 11 § — the employee gives one month''s notice; the employer 1 to 6 months by length of employment (1 under two years, then one more month per two years, 6 from ten years). A longer period in the contract wins.", "offboarding.vacation": "Semesterlagen 28 § — paid vacation days not taken when the employment ends are paid out as vacation pay (semesterersättning).", "onboarding.probation": "LAS 6 § — probation is at most six months. To end it, tell the person at least two weeks before (LAS 31 §); a union they belong to is told too.", "onboarding.tax_table": "Tax is 30 % — the side-income rate. For a main employment use the person''s tax table (ask them, or look it up at Skatteverket).", "onboarding.pay_details": "Every salary is reported per person to Skatteverket each month (AGI, arbetsgivardeklaration på individnivå), keyed by the personal identity number.", "offboarding.certificate": "Lag om arbetslöshetsförsäkring 47 § — the employer gives an employer''s certificate (arbetsgivarintyg) on request.", "onboarding.first_salary": "The salary and the tax withheld are reported to Skatteverket (AGI) by the 12th of the month after payday — the 17th in January and August.", "onboarding.introduction": "Arbetsmiljölagen 3 kap. 3 § — the employer makes sure the employee knows the conditions of the work and its risks.", "offboarding.close_record": "Salary records are part of the accounts and kept for seven years (bokföringslagen 7 kap.) — close the record, never delete it.", "offboarding.final_salary": "Reported to Skatteverket like any salary (AGI) by the 12th of the month after payday — the 17th in January and August.", "offboarding.notice_period": "LAS 11 § — the notice runs from the day it is given. A shorter notice only by written agreement.", "offboarding.priority_right": "LAS 25 § — after a redundancy, someone employed more than 12 months in the last three years has a priority right to re-employment for nine months after the last day.", "offboarding.written_notice": "LAS 8 § — the employer''s notice is in writing and says how to challenge it, and whether the person has a priority right to re-employment. Hand it over in person if you can.", "offboarding.grounds_personal": "LAS 7 § — the employer needs objective grounds (saklig grund). For personal reasons: a documented warning and a real chance to improve first, and tell the person at least two weeks before the notice (LAS 30 §).", "offboarding.grounds_probation": "LAS 6 § — a probation can be ended without grounds; tell the person at least two weeks before (LAS 31 §), and their union if they are a member.", "offboarding.grounds_redundancy": "LAS 7 § — redundancy (arbetsbrist) is objective grounds. With a collective agreement, negotiate with the union before deciding (MBL 11 §). The order of priority follows length of employment (LAS 22 §); the employer may exempt three people.", "onboarding.employer_registration": "Register with Skatteverket (skatte- och avgiftsanmälan) in good time before the first payday."}', 'LAS, semesterlagen, AGI. Without a collective agreement; an agreement (kollektivavtal) can give longer notice and more.', '2026-11-21 01:13:48.133585+00');
    INSERT INTO public.hr_rule_templates (country, label, employer_notice, employee_notice, probation_max_months, probation_end_notice_days, vacation_days, laws, notes, updated_at) VALUES ('NO', 'Norway', '[{"months": 1, "from_years": 0}, {"months": 2, "from_years": 5}, {"months": 3, "from_years": 10}]', '[{"months": 1, "from_years": 0}, {"months": 2, "from_years": 5}, {"months": 3, "from_years": 10}]', 6, 14, 21, '{"onboarding.contract": "Arbeidsmiljøloven § 14-6 — a written contract with the core terms within 7 days of the first day.", "onboarding.vacation": "Ferieloven § 5 — 25 working days a year counting Saturdays: four weeks and one day (21 days on a five-day week).", "offboarding.decision": "Arbeidsmiljøloven § 15-3 — one month, two after five years, three after ten; an employee over 50 with ten years gets 4–6 months from the employer. A longer period in the contract wins.", "offboarding.vacation": "Ferieloven — earned holiday pay (feriepenger) not yet paid is settled with the final salary.", "onboarding.probation": "Arbeidsmiljøloven § 15-6 — probation up to six months; 14 days'' notice during it.", "offboarding.notice_period": "Arbeidsmiljøloven § 15-3 — the notice runs from the first day of the month after it is given.", "offboarding.written_notice": "Arbeidsmiljøloven § 15-4 — the employer''s notice is in writing, handed over in person or by registered letter, with how to challenge it."}', 'Template — check it against arbeidsmiljøloven and any tariff agreement before relying on it. The age-based extension is not computed.', '2026-11-21 01:13:48.133585+00');
    INSERT INTO public.hr_rule_templates (country, label, employer_notice, employee_notice, probation_max_months, probation_end_notice_days, vacation_days, laws, notes, updated_at) VALUES ('DK', 'Denmark', '[{"months": 1, "from_years": 0}, {"months": 3, "from_years": 0.5}, {"months": 4, "from_years": 2.75}, {"months": 5, "from_years": 5.67}, {"months": 6, "from_years": 8.58}]', '[{"months": 1, "from_years": 0}]', 3, 14, 25, '{"onboarding.contract": "Ansættelsesbevisloven — the core terms in writing within 7 days of the first day.", "onboarding.vacation": "Ferieloven — 25 vacation days a year, earned 2.08 days a month.", "offboarding.decision": "Funktionærloven § 2 — for salaried employees: the employer gives 1 month in the first six months, then 3, rising to 6 after almost nine years; the employee gives 1 month. Hourly staff follow their collective agreement.", "offboarding.vacation": "Ferieloven — vacation earned and not taken is settled as feriepenge when the employment ends.", "onboarding.probation": "Funktionærloven § 2, stk. 5 — probation up to three months; 14 days'' notice during it."}', 'Template for salaried employees (funktionærer) — check it against funktionærloven and any collective agreement before relying on it.', '2026-11-21 01:13:48.133585+00');
    INSERT INTO public.hr_rule_templates (country, label, employer_notice, employee_notice, probation_max_months, probation_end_notice_days, vacation_days, laws, notes, updated_at) VALUES ('FI', 'Finland', '[{"days": 14, "from_years": 0}, {"months": 1, "from_years": 1}, {"months": 2, "from_years": 4}, {"months": 4, "from_years": 8}, {"months": 6, "from_years": 12}]', '[{"days": 14, "from_years": 0}, {"months": 1, "from_years": 5}]', 6, 0, 25, '{"onboarding.contract": "EU directive 2019/1152 — the core terms of employment in writing within 7 days of the first day, the rest within a month.", "onboarding.vacation": "Vuosilomalaki — 2–2.5 days a month (30 days a year counting Saturdays, about 25 on a five-day week).", "offboarding.decision": "Työsopimuslaki 6:3 — the employer gives 14 days to 6 months by length of employment; the employee 14 days, one month after five years.", "offboarding.vacation": "Vuosilomalaki — untaken vacation is paid out as holiday compensation (lomakorvaus) at the end.", "onboarding.probation": "Työsopimuslaki 1:4 — probation up to six months; either side may end it at once, never on discriminatory grounds.", "offboarding.grounds_personal": "Työsopimuslaki 7:1–2 — the employer needs a proper and weighty reason; a warning first for most conduct.", "offboarding.grounds_redundancy": "Työsopimuslaki 7:3 — financial or production grounds, and the work must have ceased substantially; offer other work first."}', 'Template — check it against työsopimuslaki and any collective agreement before relying on it.', '2026-11-21 01:13:48.133585+00');
    INSERT INTO public.hr_rule_templates (country, label, employer_notice, employee_notice, probation_max_months, probation_end_notice_days, vacation_days, laws, notes, updated_at) VALUES ('DE', 'Germany', '[{"days": 28, "from_years": 0}, {"months": 1, "from_years": 2}, {"months": 2, "from_years": 5}, {"months": 3, "from_years": 8}, {"months": 4, "from_years": 10}, {"months": 5, "from_years": 12}, {"months": 6, "from_years": 15}, {"months": 7, "from_years": 20}]', '[{"days": 28, "from_years": 0}]', 6, 14, 20, '{"onboarding.contract": "Nachweisgesetz — the essential terms in writing, the core ones on the first day of work.", "onboarding.vacation": "BUrlG § 3 — at least 24 working days on a six-day week: 20 on a five-day week.", "offboarding.decision": "BGB § 622 — four weeks to the 15th or the end of a month; the employer''s notice grows from one month after two years to seven after twenty, to the end of a month.", "offboarding.vacation": "BUrlG § 7 (4) — vacation that can no longer be taken is paid out.", "onboarding.probation": "BGB § 622 (3) — during a probation of up to six months, two weeks'' notice.", "offboarding.written_notice": "BGB § 623 — a notice is only valid on paper with a handwritten signature; e-mail is not enough.", "offboarding.grounds_personal": "KSchG § 1 — after six months, in a business with more than ten employees, a dismissal needs social justification; a works council is heard first (BetrVG § 102).", "offboarding.grounds_redundancy": "KSchG § 1 (3) — the social selection weighs length of service, age, maintenance obligations and disability."}', 'Template — check it against BGB, KSchG and any collective agreement before relying on it. "To the 15th or the end of a month" is not computed: the earliest day is a minimum.', '2026-11-21 01:13:48.133585+00');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.outreach_country_policy) THEN
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('CH', 'Switzerland', 'consent_required', 'UWG Art. 3(1)(o): consent required; sender identity and opt-out mandatory.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('IE', 'Ireland', 'permissive', 'B2B allowed with opt-out.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('DE', 'Germany', 'consent_required', 'UWG §7: prior consent required for B2B email. Send only with documented consent or an existing relationship.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('IT', 'Italy', 'consent_required', 'Garante: prior consent required for commercial email.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('AT', 'Austria', 'consent_required', 'TKG §174: prior consent required.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('ES', 'Spain', 'consent_required', 'LSSI: consent required unless there is a prior contractual relationship.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('NL', 'Netherlands', 'permissive', 'B2B allowed with opt-out; unsubscribe must work on first click.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('US', 'United States', 'permissive', 'CAN-SPAM: opt-out based; a physical postal address is required in the message.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('NO', 'Norway', 'permissive', 'B2B allowed with opt-out (EEA, ePrivacy-aligned).', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('GB', 'United Kingdom', 'permissive', 'PECR: corporate subscribers may be emailed with an opt-out; sole traders/partnerships count as individuals.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('SE', 'Sweden', 'permissive', 'B2B to a business address about that business''s field is allowed with a working opt-out.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('FR', 'France', 'permissive', 'B2B allowed to a professional address when the message concerns their profession (CNIL).', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('FI', 'Finland', 'permissive', 'B2B allowed with opt-out.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('BE', 'Belgium', 'permissive', 'B2B allowed with opt-out.', '2026-11-21 01:13:41.737783+00');
    INSERT INTO public.outreach_country_policy (country_code, country_name, policy, note, updated_at) VALUES ('DK', 'Denmark', 'permissive', 'B2B allowed with opt-out; keep the relevance link to the recipient''s role explicit.', '2026-11-21 01:13:41.737783+00');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.partner_titles) THEN
    INSERT INTO public.partner_titles (id, name, shortcut, sequence, active, created_at) VALUES ('4e45010d-f3e3-415a-b291-5e7d2dc2b7c4', 'Fru', 'Fru', 10, true, '2026-11-21 01:13:43.126693+00');
    INSERT INTO public.partner_titles (id, name, shortcut, sequence, active, created_at) VALUES ('0e5c8ba0-1967-4418-bfb1-f7aa283ca4b1', 'Herr', 'Herr', 20, true, '2026-11-21 01:13:43.126693+00');
    INSERT INTO public.partner_titles (id, name, shortcut, sequence, active, created_at) VALUES ('195446a0-3d88-4350-ad3b-75ff0776b0bd', 'Doktor', 'Dr', 30, true, '2026-11-21 01:13:43.126693+00');
    INSERT INTO public.partner_titles (id, name, shortcut, sequence, active, created_at) VALUES ('a9fa4ac8-6bd5-4f68-a4c0-3a4429194173', 'Professor', 'Prof', 40, true, '2026-11-21 01:13:43.126693+00');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.stock_locations) THEN
    INSERT INTO public.stock_locations (id, code, name, location_type, parent_id, is_active, notes, created_at, updated_at) VALUES ('0a5d533e-19b2-44e2-959e-2852fcb5b623', 'WH/MAIN', 'Main Warehouse', 'internal', NULL, true, NULL, '2026-11-21 01:13:41.851501+00', '2026-11-21 01:13:41.851501+00');
    INSERT INTO public.stock_locations (id, code, name, location_type, parent_id, is_active, notes, created_at, updated_at) VALUES ('b2f28e72-980e-4cf7-9772-4848effaab25', 'WH/TRANSIT', 'In Transit', 'transit', NULL, true, NULL, '2026-11-21 01:13:41.851501+00', '2026-11-21 01:13:41.851501+00');
    INSERT INTO public.stock_locations (id, code, name, location_type, parent_id, is_active, notes, created_at, updated_at) VALUES ('8caf34cf-72e5-47c5-9e6f-5479fa9ff3af', 'WH/SCRAP', 'Scrap', 'scrap', NULL, true, NULL, '2026-11-21 01:13:41.851501+00', '2026-11-21 01:13:41.851501+00');
    INSERT INTO public.stock_locations (id, code, name, location_type, parent_id, is_active, notes, created_at, updated_at) VALUES ('d1031848-be28-4fce-bef3-a1f0305f4bf2', 'WH/VENDORS', 'Vendors', 'vendor', NULL, true, NULL, '2026-11-21 01:13:41.851501+00', '2026-11-21 01:13:41.851501+00');
    INSERT INTO public.stock_locations (id, code, name, location_type, parent_id, is_active, notes, created_at, updated_at) VALUES ('1bde3ddf-679d-4fed-b131-b92f5508ed5c', 'WH/CUSTOMERS', 'Customers', 'customer', NULL, true, NULL, '2026-11-21 01:13:41.851501+00', '2026-11-21 01:13:41.851501+00');
    INSERT INTO public.stock_locations (id, code, name, location_type, parent_id, is_active, notes, created_at, updated_at) VALUES ('86117432-a524-405f-9793-7e9d945b5c75', 'WH/PRODUCTION', 'Production', 'production', NULL, true, NULL, '2026-11-21 01:13:41.851501+00', '2026-11-21 01:13:41.851501+00');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trash_sources) THEN
    INSERT INTO public.trash_sources (source_key, label, module_key, kind, history_table, identity_column, title_column, subtitle_column, preview_column, preview_fallback_column, preview_kind, deleted_at_column, deleted_by_column, live_table, live_identity_column, deleted_marker_column, deleted_marker_value, restore_rpc, restore_requires_admin, sort_order, enabled, created_at) VALUES ('pages', 'Page', 'pages', 'soft_delete', 'pages', 'id', 'title', 'slug', 'content_json', NULL, 'jsonb', 'deleted_at', 'deleted_by', NULL, NULL, 'action', 'delete', NULL, false, 10, true, '2026-11-21 01:13:42.637186+00');
    INSERT INTO public.trash_sources (source_key, label, module_key, kind, history_table, identity_column, title_column, subtitle_column, preview_column, preview_fallback_column, preview_kind, deleted_at_column, deleted_by_column, live_table, live_identity_column, deleted_marker_column, deleted_marker_value, restore_rpc, restore_requires_admin, sort_order, enabled, created_at) VALUES ('wiki', 'Wiki page', 'wiki', 'revision', 'wiki_page_revisions', 'slug', 'title', 'slug', 'content_md', NULL, 'text', 'revised_at', 'edited_by', 'wiki_pages', 'slug', 'action', 'delete', 'wiki_page_history', false, 20, true, '2026-11-21 01:13:42.637186+00');
    INSERT INTO public.trash_sources (source_key, label, module_key, kind, history_table, identity_column, title_column, subtitle_column, preview_column, preview_fallback_column, preview_kind, deleted_at_column, deleted_by_column, live_table, live_identity_column, deleted_marker_column, deleted_marker_value, restore_rpc, restore_requires_admin, sort_order, enabled, created_at) VALUES ('kb', 'KB article', 'knowledgeBase', 'revision', 'kb_article_revisions', 'article_id', 'title', 'slug', 'answer_text', 'question', 'text', 'revised_at', 'edited_by', 'kb_articles', 'id', 'action', 'delete', 'kb_article_history', true, 30, true, '2026-11-21 01:13:42.637186+00');
    INSERT INTO public.trash_sources (source_key, label, module_key, kind, history_table, identity_column, title_column, subtitle_column, preview_column, preview_fallback_column, preview_kind, deleted_at_column, deleted_by_column, live_table, live_identity_column, deleted_marker_column, deleted_marker_value, restore_rpc, restore_requires_admin, sort_order, enabled, created_at) VALUES ('blog', 'Blog post', 'blog', 'revision', 'blog_post_revisions', 'post_id', 'title', 'slug', 'content_json', 'excerpt', 'jsonb', 'revised_at', 'edited_by', 'blog_posts', 'id', 'action', 'delete', 'blog_post_history', false, 40, true, '2026-11-21 01:13:42.669163+00');
    INSERT INTO public.trash_sources (source_key, label, module_key, kind, history_table, identity_column, title_column, subtitle_column, preview_column, preview_fallback_column, preview_kind, deleted_at_column, deleted_by_column, live_table, live_identity_column, deleted_marker_column, deleted_marker_value, restore_rpc, restore_requires_admin, sort_order, enabled, created_at) VALUES ('handbook', 'Handbook chapter', 'handbook', 'revision', 'handbook_chapter_revisions', 'chapter_id', 'title', 'slug', 'content_md', NULL, 'text', 'revised_at', 'edited_by', 'handbook_chapters', 'id', 'action', 'delete', 'handbook_chapter_history', false, 50, true, '2026-11-21 01:13:42.669163+00');
  END IF;
END $$;

-- ── Proof: reads only ────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['account_statement_sections','cron_cadence','hr_rule_templates',
    'outreach_country_policy','partner_titles','stock_locations','trash_sources'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'sandbox_reset_wipe'
                    AND pg_get_functiondef(p.oid) LIKE '%''' || t || '''%') THEN
      RAISE EXCEPTION 'sandbox_reset_wipe would still wipe %', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'reset_site_data'
                    AND pg_get_functiondef(p.oid) LIKE '%''' || t || '''%') THEN
      RAISE EXCEPTION 'reset_site_data would still wipe %', t;
    END IF;
  END LOOP;
END $$;
