-- =============================================================================
-- Period-lock unit tests for time_entries (runs as superuser via psql,
-- bypasses RLS by using a SECURITY DEFINER test harness function).
-- The whole run is wrapped in a transaction that ROLLBACKs at the end.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _test_results (
  test_name TEXT,
  passed BOOLEAN,
  detail TEXT
);

CREATE OR REPLACE FUNCTION pg_temp.assert_blocked(p_test TEXT, p_sql TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    INSERT INTO _test_results VALUES (p_test, false, 'expected exception, got success');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _test_results VALUES (p_test, true, 'blocked as expected');
  WHEN OTHERS THEN
    INSERT INTO _test_results VALUES (p_test, false, 'wrong error: ' || SQLSTATE || ' ' || SQLERRM);
  END;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_allowed(p_test TEXT, p_sql TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    INSERT INTO _test_results VALUES (p_test, true, 'ok');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results VALUES (p_test, false, 'expected success, got: ' || SQLSTATE || ' ' || SQLERRM);
  END;
END $$;

-- Disable RLS on time_entries for the duration of the test (rolled back).
ALTER TABLE public.time_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods DISABLE ROW LEVEL SECURITY;

-- Fixtures -------------------------------------------------------------------
INSERT INTO public.projects (id, name, status, is_billable)
VALUES ('11111111-1111-1111-1111-111111111111', '__period_lock_test__', 'active', true)
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.accounting_periods WHERE fiscal_year = 2024 AND period_month IN (1,3,6);
INSERT INTO public.accounting_periods (fiscal_year, period_month, status)
VALUES (2024, 3, 'closed'), (2024, 1, 'locked'), (2024, 6, 'open');

ALTER TABLE public.time_entries DISABLE TRIGGER trg_guard_time_entries_period;
DELETE FROM public.time_entries WHERE id IN (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444');
INSERT INTO public.time_entries (id, project_id, entry_date, hours, description) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '2024-03-15', 4, 'closed-month seed'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '2024-06-15', 4, 'open-month seed'),
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '2024-01-15', 4, 'locked-month seed');
ALTER TABLE public.time_entries ENABLE TRIGGER trg_guard_time_entries_period;

-- Test scenarios -------------------------------------------------------------
SELECT pg_temp.assert_blocked('01_insert_into_closed_period',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-20', 2)$$);

SELECT pg_temp.assert_blocked('02_insert_into_locked_period',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES ('11111111-1111-1111-1111-111111111111', '2024-01-31', 1)$$);

SELECT pg_temp.assert_allowed('03_insert_into_open_period',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES ('11111111-1111-1111-1111-111111111111', '2024-06-20', 3)$$);

SELECT pg_temp.assert_blocked('04_update_hours_inside_closed',
  $$UPDATE public.time_entries SET hours = 8
    WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.assert_blocked('05_delete_from_closed_period',
  $$DELETE FROM public.time_entries
    WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.assert_blocked('06_move_entry_out_of_closed',
  $$UPDATE public.time_entries SET entry_date = '2024-06-15'
    WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.assert_blocked('07_move_entry_into_closed',
  $$UPDATE public.time_entries SET entry_date = '2024-03-10'
    WHERE id = '33333333-3333-3333-3333-333333333333'$$);

SELECT pg_temp.assert_blocked('08_boundary_last_day_of_closed',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-31', 1)$$);

SELECT pg_temp.assert_allowed('09_boundary_first_day_after_closed',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES ('11111111-1111-1111-1111-111111111111', '2024-04-01', 1)$$);

SELECT pg_temp.assert_blocked('10_boundary_first_day_of_closed',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-01', 1)$$);

SELECT pg_temp.assert_allowed('11_boundary_leap_day_before_closed',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES ('11111111-1111-1111-1111-111111111111', '2024-02-29', 1)$$);

-- Timezone edge: same UTC instant resolves to different DATE in different zones.
SELECT pg_temp.assert_blocked('12_tz_late_utc_still_in_closed',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES ('11111111-1111-1111-1111-111111111111',
            ('2024-03-31 23:30:00+00'::timestamptz AT TIME ZONE 'UTC')::date, 1)$$);

SELECT pg_temp.assert_allowed('13_tz_same_instant_in_cet_is_april',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES ('11111111-1111-1111-1111-111111111111',
            ('2024-03-31 23:30:00+00'::timestamptz AT TIME ZONE 'Europe/Stockholm')::date, 1)$$);

-- Late submission: user remembers a forgotten day after period close.
SELECT pg_temp.assert_blocked('14_late_submission_yesterday_in_closed_month',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours, description)
    VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-30', 7,
            'forgot to log this last week')$$);

-- Reopen → insert allowed → re-close → blocked
UPDATE public.accounting_periods SET status = 'open'
  WHERE fiscal_year = 2024 AND period_month = 3;
SELECT pg_temp.assert_allowed('15_insert_after_reopen',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours, description)
    VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-25', 2, 'after reopen')$$);
UPDATE public.accounting_periods SET status = 'closed'
  WHERE fiscal_year = 2024 AND period_month = 3;
SELECT pg_temp.assert_blocked('16_insert_blocked_again_after_reclose',
  $$INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-26', 1)$$);

SELECT pg_temp.assert_allowed('17_update_open_period_entry',
  $$UPDATE public.time_entries SET hours = 5
    WHERE id = '33333333-3333-3333-3333-333333333333'$$);

SELECT pg_temp.assert_allowed('18_delete_open_period_entry',
  $$DELETE FROM public.time_entries
    WHERE id = '33333333-3333-3333-3333-333333333333'$$);

DO $$ BEGIN
  IF public.is_period_closed('2024-03-15'::date) THEN
    INSERT INTO _test_results VALUES ('19_helper_true_for_closed', true, 'ok');
  ELSE
    INSERT INTO _test_results VALUES ('19_helper_true_for_closed', false, 'expected true');
  END IF;
  IF NOT public.is_period_closed('2024-06-15'::date) THEN
    INSERT INTO _test_results VALUES ('20_helper_false_for_open', true, 'ok');
  ELSE
    INSERT INTO _test_results VALUES ('20_helper_false_for_open', false, 'expected false');
  END IF;
END $$;

-- Report ---------------------------------------------------------------------
SELECT
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS s,
  test_name,
  detail
FROM _test_results
ORDER BY test_name;

SELECT COUNT(*) FILTER (WHERE passed) AS passed,
       COUNT(*) FILTER (WHERE NOT passed) AS failed,
       COUNT(*) AS total
FROM _test_results;

ROLLBACK;
