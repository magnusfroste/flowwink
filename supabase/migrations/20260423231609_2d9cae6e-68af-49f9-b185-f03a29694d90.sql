CREATE OR REPLACE FUNCTION public.run_period_lock_tests()
RETURNS TABLE(test_name TEXT, passed BOOLEAN, detail TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_proj UUID := '11111111-1111-1111-1111-111111111111';
  v_seed_closed UUID := '22222222-2222-2222-2222-222222222222';
  v_seed_open UUID := '33333333-3333-3333-3333-333333333333';
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can run period-lock tests';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _r (test_name TEXT, passed BOOLEAN, detail TEXT) ON COMMIT DROP;
  TRUNCATE _r;

  DELETE FROM public.accounting_periods WHERE fiscal_year = 2024 AND period_month IN (1,3,6);
  INSERT INTO public.accounting_periods (fiscal_year, period_month, status)
  VALUES (2024, 3, 'closed'), (2024, 1, 'locked'), (2024, 6, 'open');

  INSERT INTO public.projects (id, name, is_billable)
  VALUES (v_proj, '__period_lock_test__', true)
  ON CONFLICT (id) DO NOTHING;

  ALTER TABLE public.time_entries DISABLE TRIGGER trg_guard_time_entries_period;
  DELETE FROM public.time_entries WHERE project_id = v_proj;
  INSERT INTO public.time_entries (id, project_id, entry_date, hours, description) VALUES
    (v_seed_closed, v_proj, '2024-03-15', 4, 'closed-month seed'),
    (v_seed_open,   v_proj, '2024-06-15', 4, 'open-month seed');
  ALTER TABLE public.time_entries ENABLE TRIGGER trg_guard_time_entries_period;

  BEGIN INSERT INTO public.time_entries (project_id, entry_date, hours) VALUES (v_proj, '2024-03-20', 2);
    INSERT INTO _r VALUES ('01_insert_into_closed_period', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('01_insert_into_closed_period', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('01_insert_into_closed_period', false, 'wrong: '||SQLSTATE); END;

  BEGIN INSERT INTO public.time_entries (project_id, entry_date, hours) VALUES (v_proj, '2024-01-31', 1);
    INSERT INTO _r VALUES ('02_insert_into_locked_period', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('02_insert_into_locked_period', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('02_insert_into_locked_period', false, 'wrong: '||SQLSTATE); END;

  BEGIN INSERT INTO public.time_entries (project_id, entry_date, hours) VALUES (v_proj, '2024-06-20', 3);
    INSERT INTO _r VALUES ('03_insert_into_open_period', true, 'ok');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('03_insert_into_open_period', false, 'failed: '||SQLERRM); END;

  BEGIN UPDATE public.time_entries SET hours = 8 WHERE id = v_seed_closed;
    INSERT INTO _r VALUES ('04_update_inside_closed', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('04_update_inside_closed', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('04_update_inside_closed', false, 'wrong: '||SQLSTATE); END;

  BEGIN DELETE FROM public.time_entries WHERE id = v_seed_closed;
    INSERT INTO _r VALUES ('05_delete_from_closed', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('05_delete_from_closed', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('05_delete_from_closed', false, 'wrong: '||SQLSTATE); END;

  BEGIN UPDATE public.time_entries SET entry_date = '2024-06-15' WHERE id = v_seed_closed;
    INSERT INTO _r VALUES ('06_move_out_of_closed', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('06_move_out_of_closed', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('06_move_out_of_closed', false, 'wrong: '||SQLSTATE); END;

  BEGIN UPDATE public.time_entries SET entry_date = '2024-03-10' WHERE id = v_seed_open;
    INSERT INTO _r VALUES ('07_move_into_closed', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('07_move_into_closed', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('07_move_into_closed', false, 'wrong: '||SQLSTATE); END;

  BEGIN INSERT INTO public.time_entries (project_id, entry_date, hours) VALUES (v_proj, '2024-03-31', 1);
    INSERT INTO _r VALUES ('08_boundary_last_day_closed', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('08_boundary_last_day_closed', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('08_boundary_last_day_closed', false, 'wrong: '||SQLSTATE); END;

  BEGIN INSERT INTO public.time_entries (project_id, entry_date, hours) VALUES (v_proj, '2024-04-01', 1);
    INSERT INTO _r VALUES ('09_boundary_first_day_after_closed', true, 'ok');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('09_boundary_first_day_after_closed', false, 'failed: '||SQLERRM); END;

  BEGIN INSERT INTO public.time_entries (project_id, entry_date, hours) VALUES (v_proj, '2024-03-01', 1);
    INSERT INTO _r VALUES ('10_boundary_first_day_closed', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('10_boundary_first_day_closed', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('10_boundary_first_day_closed', false, 'wrong: '||SQLSTATE); END;

  BEGIN INSERT INTO public.time_entries (project_id, entry_date, hours) VALUES (v_proj, '2024-02-29', 1);
    INSERT INTO _r VALUES ('11_boundary_leap_day', true, 'ok');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('11_boundary_leap_day', false, 'failed: '||SQLERRM); END;

  BEGIN
    INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES (v_proj, ('2024-03-31 23:30:00+00'::timestamptz AT TIME ZONE 'UTC')::date, 1);
    INSERT INTO _r VALUES ('12_tz_utc_late_still_closed', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('12_tz_utc_late_still_closed', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('12_tz_utc_late_still_closed', false, 'wrong: '||SQLSTATE); END;

  BEGIN
    INSERT INTO public.time_entries (project_id, entry_date, hours)
    VALUES (v_proj, ('2024-03-31 23:30:00+00'::timestamptz AT TIME ZONE 'Europe/Stockholm')::date, 1);
    INSERT INTO _r VALUES ('13_tz_same_instant_cet_is_april', true, 'ok');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('13_tz_same_instant_cet_is_april', false, 'failed: '||SQLERRM); END;

  BEGIN INSERT INTO public.time_entries (project_id, entry_date, hours, description)
    VALUES (v_proj, '2024-03-30', 7, 'forgot to log this last week');
    INSERT INTO _r VALUES ('14_late_submission_in_closed', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('14_late_submission_in_closed', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('14_late_submission_in_closed', false, 'wrong: '||SQLSTATE); END;

  UPDATE public.accounting_periods SET status = 'open' WHERE fiscal_year = 2024 AND period_month = 3;
  BEGIN INSERT INTO public.time_entries (project_id, entry_date, hours, description)
    VALUES (v_proj, '2024-03-25', 2, 'after reopen');
    INSERT INTO _r VALUES ('15_insert_after_reopen', true, 'ok');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('15_insert_after_reopen', false, 'failed: '||SQLERRM); END;
  UPDATE public.accounting_periods SET status = 'closed' WHERE fiscal_year = 2024 AND period_month = 3;
  BEGIN INSERT INTO public.time_entries (project_id, entry_date, hours) VALUES (v_proj, '2024-03-26', 1);
    INSERT INTO _r VALUES ('16_blocked_again_after_reclose', false, 'expected block');
  EXCEPTION WHEN check_violation THEN INSERT INTO _r VALUES ('16_blocked_again_after_reclose', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _r VALUES ('16_blocked_again_after_reclose', false, 'wrong: '||SQLSTATE); END;

  BEGIN UPDATE public.time_entries SET hours = 5 WHERE id = v_seed_open;
    INSERT INTO _r VALUES ('17_update_open_period', true, 'ok');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('17_update_open_period', false, 'failed: '||SQLERRM); END;

  BEGIN DELETE FROM public.time_entries WHERE id = v_seed_open;
    INSERT INTO _r VALUES ('18_delete_open_period', true, 'ok');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('18_delete_open_period', false, 'failed: '||SQLERRM); END;

  IF public.is_period_closed('2024-03-15'::date) THEN
    INSERT INTO _r VALUES ('19_helper_true_for_closed', true, 'ok');
  ELSE INSERT INTO _r VALUES ('19_helper_true_for_closed', false, 'expected true'); END IF;
  IF NOT public.is_period_closed('2024-06-15'::date) THEN
    INSERT INTO _r VALUES ('20_helper_false_for_open', true, 'ok');
  ELSE INSERT INTO _r VALUES ('20_helper_false_for_open', false, 'expected false'); END IF;

  ALTER TABLE public.time_entries DISABLE TRIGGER trg_guard_time_entries_period;
  DELETE FROM public.time_entries WHERE project_id = v_proj;
  ALTER TABLE public.time_entries ENABLE TRIGGER trg_guard_time_entries_period;
  DELETE FROM public.projects WHERE id = v_proj;
  DELETE FROM public.accounting_periods WHERE fiscal_year = 2024 AND period_month IN (1,3,6);

  RETURN QUERY SELECT _r.test_name, _r.passed, _r.detail FROM _r ORDER BY _r.test_name;
END;
$func$;