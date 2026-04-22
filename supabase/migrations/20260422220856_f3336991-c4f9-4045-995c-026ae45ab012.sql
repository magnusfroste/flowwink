-- 1. Add manager_id to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON public.employees(manager_id);

-- 2. Recursive helper: all employee IDs reporting to this auth user (any depth)
CREATE OR REPLACE FUNCTION public.get_team_member_ids(_manager_user_id UUID)
RETURNS TABLE(employee_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE manager_emp AS (
    -- Find the employee row that is this user
    SELECT id FROM public.employees WHERE user_id = _manager_user_id
  ),
  team AS (
    -- Direct reports
    SELECT e.id
    FROM public.employees e
    JOIN manager_emp m ON e.manager_id = m.id

    UNION

    -- Indirect (recursive) reports
    SELECT e.id
    FROM public.employees e
    JOIN team t ON e.manager_id = t.id
  )
  SELECT id FROM team;
$$;

-- 3. Boolean helper for RLS
CREATE OR REPLACE FUNCTION public.is_manager_of(_manager_user_id UUID, _employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.get_team_member_ids(_manager_user_id) WHERE employee_id = _employee_id
  );
$$;

-- 4. Cycle prevention trigger
CREATE OR REPLACE FUNCTION public.prevent_manager_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'An employee cannot be their own manager';
  END IF;

  -- Walk up the chain to detect cycle
  IF EXISTS (
    WITH RECURSIVE chain AS (
      SELECT id, manager_id FROM public.employees WHERE id = NEW.manager_id
      UNION ALL
      SELECT e.id, e.manager_id FROM public.employees e
      JOIN chain c ON e.id = c.manager_id
    )
    SELECT 1 FROM chain WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Cycle detected: this employee is already in the manager chain above';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_prevent_manager_cycle ON public.employees;
CREATE TRIGGER employees_prevent_manager_cycle
BEFORE INSERT OR UPDATE OF manager_id ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.prevent_manager_cycle();

-- 5. RLS policies: managers can see their team
DROP POLICY IF EXISTS "Managers can view team members" ON public.employees;
CREATE POLICY "Managers can view team members"
ON public.employees
FOR SELECT
USING (public.is_manager_of(auth.uid(), id));

DROP POLICY IF EXISTS "Managers can view team leave requests" ON public.leave_requests;
CREATE POLICY "Managers can view team leave requests"
ON public.leave_requests
FOR SELECT
USING (public.is_manager_of(auth.uid(), employee_id));

DROP POLICY IF EXISTS "Managers can update team leave requests" ON public.leave_requests;
CREATE POLICY "Managers can update team leave requests"
ON public.leave_requests
FOR UPDATE
USING (public.is_manager_of(auth.uid(), employee_id))
WITH CHECK (public.is_manager_of(auth.uid(), employee_id));

DROP POLICY IF EXISTS "Managers can view team allocations" ON public.leave_allocations;
CREATE POLICY "Managers can view team allocations"
ON public.leave_allocations
FOR SELECT
USING (public.is_manager_of(auth.uid(), employee_id));