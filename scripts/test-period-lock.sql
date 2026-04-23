-- =============================================================================
-- Period-lock unit tests for time_entries
-- Runs as a single transaction that ROLLBACKs at the end so it is non-destructive.
-- Each test uses an assertion helper that raises on failure.
-- =============================================================================

BEGIN;

-- Allow trigger to run without auth.uid() (we're not testing RLS here, only the trigger)
SET LOCAL role = postgres;

-- Test scaffolding -----------------------------------------------------------
CREATE TEMP TABLE _test_results (
  test_name TEXT,
  passed BOOLEAN,
  detail TEXT
);

CREATE OR REPLACE FUNCTION pg_temp.assert_blocked(
  p_test TEXT, p_sql TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    INSERT INTO _test_results VALUES (p_test, false, 'expected exception, got success');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _test_results VALUES (p_test, true, SQLERRM);
  WHEN OTHERS THEN
    INSERT INTO _test_results VALUES (p_test, false, 'wrong error: ' || SQLERRM);
  END;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_allowed(
  p_test TEXT, p_sql TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    INSERT INTO _test_results VALUES (p_test, true, 'ok');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_results VALUES (p_test, false, 'expected success, got: ' || SQLERRM);
  END;
END $$;

-- Fixtures -------------------------------------------------------------------
-- Use a sentinel project + employee so we don't collide with real data.
INSERT INTO public.projects (id, name, status, is_billable)
VALUES ('11111111-1111-1111-1111-111111111111', '__period_lock_test__', 'active', true)
ON CONFLICT (id) DO NOTHING;

-- Close period 2024-03 and permanently lock 2024-01
INSERT INTO public.accounting_periods (fiscal_year, period_month, status)
VALUES (2024, 3, 'closed'), (2024, 1, 'locked'), (2024, 6, 'open')
ON CONFLICT (fiscal_year, period_month) DO UPDATE SET status = EXCLUDED.status;

-- Pre-existing entry inside the closed period (created BEFORE close in real life;
-- we bypass by temporarily disabling the trigger to seed it)
ALTER TABLE public.time_entries DISABLE TRIGGER trg_guard_time_entries_period;
INSERT INTO public.time_entries (id, project_id, entry_date, hours, description)
VALUES ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        '2024-03-15', 4, 'pre-existing in closed month');
INSERT INTO public.time_entries (id, project_id, entry_date, hours, description)
VALUES ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        '2024-06-15', 4, 'in open month');
INSERT INTO public.time_entries (id, project_id, entry_date, hours, description)
VALUES ('44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111',
        '2024-01-15', 4, 'pre-existing in locked month');
ALTER TABLE public.time_entries ENABLE TRIGGER trg_guard_time_entries_period;

-- ===========================================================================
-- TEST SCENARIOS
-- ===========================================================================

-- 1. INSERT into a closed period must fail (most common: late timesheet entry)
SELECT pg_temp.assert_blocked('insert_into_closed_period', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours)
  VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-20', 2)
$sql$);

-- 2. INSERT into a permanently locked period must fail
SELECT pg_temp.assert_blocked('insert_into_locked_period', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours)
  VALUES ('11111111-1111-1111-1111-111111111111', '2024-01-31', 1)
$sql$);

-- 3. INSERT into open period must succeed
SELECT pg_temp.assert_allowed('insert_into_open_period', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours)
  VALUES ('11111111-1111-1111-1111-111111111111', '2024-06-20', 3)
$sql$);

-- 4. UPDATE existing entry inside closed period must fail (no field touched)
SELECT pg_temp.assert_blocked('update_hours_inside_closed', $sql$
  UPDATE public.time_entries SET hours = 8
  WHERE id = '22222222-2222-2222-2222-222222222222'
$sql$);

-- 5. DELETE from closed period must fail
SELECT pg_temp.assert_blocked('delete_from_closed_period', $sql$
  DELETE FROM public.time_entries
  WHERE id = '22222222-2222-2222-2222-222222222222'
$sql$);

-- 6. Attempt to MOVE entry out of closed period (change date to open month) must fail
--    This is the "sneaky" edge-case: user tries to escape the lock by changing entry_date.
SELECT pg_temp.assert_blocked('move_entry_out_of_closed', $sql$
  UPDATE public.time_entries SET entry_date = '2024-06-15'
  WHERE id = '22222222-2222-2222-2222-222222222222'
$sql$);

-- 7. Attempt to MOVE entry INTO a closed period must fail
SELECT pg_temp.assert_blocked('move_entry_into_closed', $sql$
  UPDATE public.time_entries SET entry_date = '2024-03-10'
  WHERE id = '33333333-3333-3333-3333-333333333333'
$sql$);

-- 8. Boundary: last day of closed month (2024-03-31) blocked
SELECT pg_temp.assert_blocked('boundary_last_day_of_closed', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours)
  VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-31', 1)
$sql$);

-- 9. Boundary: first day after closed month (2024-04-01) allowed
SELECT pg_temp.assert_allowed('boundary_first_day_after_closed', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours)
  VALUES ('11111111-1111-1111-1111-111111111111', '2024-04-01', 1)
$sql$);

-- 10. Boundary: first day of closed month (2024-03-01) blocked
SELECT pg_temp.assert_blocked('boundary_first_day_of_closed', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours)
  VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-01', 1)
$sql$);

-- 11. Boundary: last day before closed month (2024-02-29 leap) allowed
SELECT pg_temp.assert_allowed('boundary_leap_day_before_closed', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours)
  VALUES ('11111111-1111-1111-1111-111111111111', '2024-02-29', 1)
$sql$);

-- 12. Timezone edge case: a TIMESTAMPTZ at 23:30 UTC on 2024-03-31 is still
--     date 2024-03-31 in UTC and 2024-04-01 in CET (UTC+2 in summer).
--     entry_date is a DATE column, so the *date written* is what counts.
--     Test that casting a timestamptz to date in different zones produces
--     the expected blocked/allowed behavior.
SELECT pg_temp.assert_blocked('timezone_late_utc_still_in_closed', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours)
  VALUES ('11111111-1111-1111-1111-111111111111',
          ('2024-03-31 23:30:00+00'::timestamptz AT TIME ZONE 'UTC')::date,
          1)
$sql$);

SELECT pg_temp.assert_allowed('timezone_same_instant_in_cet_is_april', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours)
  VALUES ('11111111-1111-1111-1111-111111111111',
          ('2024-03-31 23:30:00+00'::timestamptz AT TIME ZONE 'Europe/Stockholm')::date,
          1)
$sql$);

-- 13. Late submission scenario: user submits "yesterday" (2024-03-30) AFTER period close
SELECT pg_temp.assert_blocked('late_submission_yesterday_in_closed_month', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours, description)
  VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-30', 7,
          'forgot to log this last week')
$sql$);

-- 14. Reopen workflow: closing → reopen → INSERT should succeed → re-close
UPDATE public.accounting_periods SET status = 'open'
  WHERE fiscal_year = 2024 AND period_month = 3;
SELECT pg_temp.assert_allowed('insert_after_reopen', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours, description)
  VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-25', 2,
          'corrected after reopen')
$sql$);
UPDATE public.accounting_periods SET status = 'closed'
  WHERE fiscal_year = 2024 AND period_month = 3;
SELECT pg_temp.assert_blocked('insert_blocked_again_after_reclose', $sql$
  INSERT INTO public.time_entries (project_id, entry_date, hours)
  VALUES ('11111111-1111-1111-1111-111111111111', '2024-03-26', 1)
$sql$);

-- 15. UPDATE non-date field on entry in OPEN month must succeed
SELECT pg_temp.assert_allowed('update_open_period_entry', $sql$
  UPDATE public.time_entries SET hours = 5
  WHERE id = '33333333-3333-3333-3333-333333333333'
$sql$);

-- 16. DELETE from OPEN period must succeed
SELECT pg_temp.assert_allowed('delete_open_period_entry', $sql$
  DELETE FROM public.time_entries
  WHERE id = '33333333-3333-3333-3333-333333333333'
$sql$);

-- 17. is_period_closed() helper sanity
DO $$ BEGIN
  IF NOT public.is_period_closed('2024-03-15'::date) THEN
    INSERT INTO _test_results VALUES ('helper_returns_true_for_closed', false, 'expected true');
  ELSE
    INSERT INTO _test_results VALUES ('helper_returns_true_for_closed', true, 'ok');
  END IF;
  IF public.is_period_closed('2024-06-15'::date) THEN
    INSERT INTO _test_results VALUES ('helper_returns_false_for_open', false, 'expected false');
  ELSE
    INSERT INTO _test_results VALUES ('helper_returns_false_for_open', true, 'ok');
  END IF;
END $$;

-- ===========================================================================
-- RESULT REPORT
-- ===========================================================================
SELECT
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status,
  test_name,
  CASE WHEN passed THEN '' ELSE detail END AS detail
FROM _test_results
ORDER BY passed, test_name;

SELECT
  COUNT(*) FILTER (WHERE passed)        AS passed,
  COUNT(*) FILTER (WHERE NOT passed)    AS failed,
  COUNT(*)                              AS total
FROM _test_results;

-- Always rollback so this script never mutates the database.
ROLLBACK;
