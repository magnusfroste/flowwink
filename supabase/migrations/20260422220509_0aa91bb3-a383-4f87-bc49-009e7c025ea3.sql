-- Validate balance before approving a leave request
CREATE OR REPLACE FUNCTION public.validate_leave_balance_on_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
  v_allocated NUMERIC;
  v_carried NUMERIC;
  v_used NUMERIC;
  v_available NUMERIC;
BEGIN
  -- Only check on transition into 'approved'
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM NEW.start_date)::INTEGER;

  SELECT COALESCE(allocated_days, 0), COALESCE(carried_over_days, 0)
  INTO v_allocated, v_carried
  FROM public.leave_allocations
  WHERE employee_id = NEW.employee_id
    AND leave_type = NEW.leave_type
    AND year = v_year;

  -- If no allocation exists, treat as 0 (will block unless days = 0)
  v_allocated := COALESCE(v_allocated, 0);
  v_carried := COALESCE(v_carried, 0);

  -- Sum already-approved days for this type/year (excluding current row)
  SELECT COALESCE(SUM(days), 0)
  INTO v_used
  FROM public.leave_requests
  WHERE employee_id = NEW.employee_id
    AND leave_type = NEW.leave_type
    AND status = 'approved'
    AND id <> NEW.id
    AND EXTRACT(YEAR FROM start_date)::INTEGER = v_year;

  v_available := v_allocated + v_carried - v_used;

  IF NEW.days > v_available THEN
    RAISE EXCEPTION 'Cannot approve: requested % days but only % days available for % in % (allocated %, carried %, already approved %)',
      NEW.days, v_available, NEW.leave_type, v_year, v_allocated, v_carried, v_used
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_request_validate_balance ON public.leave_requests;
CREATE TRIGGER leave_request_validate_balance
BEFORE INSERT OR UPDATE OF status ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.validate_leave_balance_on_approve();

-- Enable realtime so balance cards update live
ALTER TABLE public.leave_requests REPLICA IDENTITY FULL;
ALTER TABLE public.leave_allocations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'leave_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'leave_allocations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_allocations;
  END IF;
END $$;