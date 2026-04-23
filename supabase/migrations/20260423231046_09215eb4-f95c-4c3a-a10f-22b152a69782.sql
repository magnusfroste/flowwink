CREATE OR REPLACE FUNCTION public.guard_time_entries_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_date DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_check_date := OLD.entry_date;
  ELSE
    v_check_date := NEW.entry_date;
    IF TG_OP = 'UPDATE' AND OLD.entry_date IS NOT NULL
       AND public.is_period_closed(OLD.entry_date) THEN
      RAISE EXCEPTION 'Cannot modify time entry: period %-% is closed (original date %)',
        EXTRACT(YEAR FROM OLD.entry_date)::INTEGER,
        EXTRACT(MONTH FROM OLD.entry_date)::INTEGER,
        OLD.entry_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_check_date IS NOT NULL AND public.is_period_closed(v_check_date) THEN
    RAISE EXCEPTION 'Cannot % time entry: period %-% is closed (entry_date %)',
      LOWER(TG_OP),
      EXTRACT(YEAR FROM v_check_date)::INTEGER,
      EXTRACT(MONTH FROM v_check_date)::INTEGER,
      v_check_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_time_entries_period ON public.time_entries;
CREATE TRIGGER trg_guard_time_entries_period
BEFORE INSERT OR UPDATE OR DELETE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_time_entries_period();