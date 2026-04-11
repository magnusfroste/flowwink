-- Employees table
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  department TEXT,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  emergency_contact JSONB DEFAULT '{}',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view employees"
  ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete employees"
  ON public.employees FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Leave requests table
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL DEFAULT 'vacation',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(5,1) NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view leave requests"
  ON public.leave_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert leave requests"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update leave requests"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete leave requests"
  ON public.leave_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Onboarding checklists
CREATE TABLE IF NOT EXISTS public.onboarding_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Onboarding',
  items JSONB NOT NULL DEFAULT '[]',
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view onboarding checklists"
  ON public.onboarding_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert onboarding checklists"
  ON public.onboarding_checklists FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update onboarding checklists"
  ON public.onboarding_checklists FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete onboarding checklists"
  ON public.onboarding_checklists FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_onboarding_checklists_updated_at
  BEFORE UPDATE ON public.onboarding_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Employee documents
CREATE TABLE IF NOT EXISTS public.employee_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view employee documents"
  ON public.employee_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert employee documents"
  ON public.employee_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete employee documents"
  ON public.employee_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));