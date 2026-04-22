-- 1. Add 'employee' to app_role enum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'employee' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'employee';
  END IF;
END $$;

-- 2. Add user_id to employees (link to auth.users)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_unique ON public.employees(user_id) WHERE user_id IS NOT NULL;

-- 3. Helper: current_employee_id() — security definer, no RLS recursion
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;

-- 4. RLS for leave_requests: employees self-service
DROP POLICY IF EXISTS "Employees view own leave" ON public.leave_requests;
CREATE POLICY "Employees view own leave"
ON public.leave_requests FOR SELECT
TO authenticated
USING (
  employee_id = public.current_employee_id()
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Employees create own leave" ON public.leave_requests;
CREATE POLICY "Employees create own leave"
ON public.leave_requests FOR INSERT
TO authenticated
WITH CHECK (
  employee_id = public.current_employee_id()
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Employees update own pending leave" ON public.leave_requests;
CREATE POLICY "Employees update own pending leave"
ON public.leave_requests FOR UPDATE
TO authenticated
USING (
  (employee_id = public.current_employee_id() AND status = 'pending')
  OR public.has_role(auth.uid(), 'admin')
);

-- 5. Optional: link existing employees to users by matching email (one-time)
UPDATE public.employees e
SET user_id = u.id
FROM auth.users u
WHERE e.user_id IS NULL
  AND e.email IS NOT NULL
  AND LOWER(e.email) = LOWER(u.email);
