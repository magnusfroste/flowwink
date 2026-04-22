-- Performance Goals (PDP)
CREATE TABLE IF NOT EXISTS public.performance_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'professional', -- professional, personal, skill, business
  target_date DATE,
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'active', -- draft, active, completed, cancelled
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 5),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees see own goals" ON public.performance_goals;
CREATE POLICY "Employees see own goals" ON public.performance_goals
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.is_manager_of(auth.uid(), employee_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Employees manage own goals" ON public.performance_goals;
CREATE POLICY "Employees manage own goals" ON public.performance_goals
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.is_manager_of(auth.uid(), employee_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.is_manager_of(auth.uid(), employee_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP TRIGGER IF EXISTS trg_perf_goals_updated ON public.performance_goals;
CREATE TRIGGER trg_perf_goals_updated BEFORE UPDATE ON public.performance_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 1:1 Meetings
CREATE TABLE IF NOT EXISTS public.one_on_ones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  agenda TEXT,
  notes TEXT,
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  employee_mood TEXT, -- great, good, neutral, struggling, blocked
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, completed, cancelled, no_show
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.one_on_ones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants see 1:1s" ON public.one_on_ones;
CREATE POLICY "Participants see 1:1s" ON public.one_on_ones
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE (e.id = employee_id OR e.id = manager_id) AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Participants manage 1:1s" ON public.one_on_ones;
CREATE POLICY "Participants manage 1:1s" ON public.one_on_ones
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE (e.id = employee_id OR e.id = manager_id) AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE (e.id = employee_id OR e.id = manager_id) AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP TRIGGER IF EXISTS trg_one_on_ones_updated ON public.one_on_ones;
CREATE TRIGGER trg_one_on_ones_updated BEFORE UPDATE ON public.one_on_ones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Feedback (360, peer, manager)
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiver_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  giver_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  giver_user_id UUID,
  feedback_type TEXT NOT NULL DEFAULT 'peer', -- peer, manager, self, upward, 360
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  strengths TEXT,
  improvements TEXT,
  comments TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  visibility TEXT NOT NULL DEFAULT 'receiver_and_manager', -- private, receiver_only, receiver_and_manager, public
  related_review_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Feedback visibility" ON public.feedback;
CREATE POLICY "Feedback visibility" ON public.feedback
  FOR SELECT TO authenticated
  USING (
    -- Receiver always sees feedback addressed to them
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = receiver_id AND e.user_id = auth.uid())
    -- Giver sees what they wrote
    OR giver_user_id = auth.uid()
    -- Manager sees feedback to their reports if visibility allows
    OR (visibility IN ('receiver_and_manager', 'public') AND public.is_manager_of(auth.uid(), receiver_id))
    -- Admin sees all
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Authenticated can give feedback" ON public.feedback;
CREATE POLICY "Authenticated can give feedback" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (giver_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Givers edit own feedback" ON public.feedback;
CREATE POLICY "Givers edit own feedback" ON public.feedback
  FOR UPDATE TO authenticated
  USING (giver_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Givers delete own feedback" ON public.feedback;
CREATE POLICY "Givers delete own feedback" ON public.feedback
  FOR DELETE TO authenticated
  USING (giver_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_feedback_updated ON public.feedback;
CREATE TRIGGER trg_feedback_updated BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Performance Reviews
CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  period_type TEXT NOT NULL DEFAULT 'annual', -- annual, quarterly, probation, ad_hoc
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  achievements TEXT,
  areas_of_improvement TEXT,
  goals_next_period TEXT,
  manager_comments TEXT,
  employee_comments TEXT,
  salary_adjustment_pct NUMERIC(5,2),
  promotion_recommended BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, employee_review, completed, acknowledged
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Review visibility" ON public.performance_reviews;
CREATE POLICY "Review visibility" ON public.performance_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR public.is_manager_of(auth.uid(), employee_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Manager and admin manage reviews" ON public.performance_reviews;
CREATE POLICY "Manager and admin manage reviews" ON public.performance_reviews
  FOR ALL TO authenticated
  USING (
    public.is_manager_of(auth.uid(), employee_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.is_manager_of(auth.uid(), employee_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Employee can comment on own review" ON public.performance_reviews;
CREATE POLICY "Employee can comment on own review" ON public.performance_reviews
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_perf_reviews_updated ON public.performance_reviews;
CREATE TRIGGER trg_perf_reviews_updated BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_perf_goals_employee ON public.performance_goals(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_one_on_ones_employee ON public.one_on_ones(employee_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_one_on_ones_manager ON public.one_on_ones(manager_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_receiver ON public.feedback(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_employee ON public.performance_reviews(employee_id, period_end DESC);