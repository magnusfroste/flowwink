
-- 1. Make user_id nullable
ALTER TABLE public.time_entries ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add employee_id as alternative FK
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

-- 3. Ensure at least one identifier is present
CREATE OR REPLACE FUNCTION public.validate_time_entry_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.employee_id IS NULL THEN
    RAISE EXCEPTION 'time_entry must have either user_id or employee_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_time_entry_owner ON public.time_entries;
CREATE TRIGGER check_time_entry_owner
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_time_entry_owner();

-- 4. Index for employee lookups
CREATE INDEX IF NOT EXISTS idx_time_entries_employee_id ON public.time_entries(employee_id);
