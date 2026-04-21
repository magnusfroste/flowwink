-- Recruitment Module (ATS) — Odoo + Teamtailor inspired

DO $$ BEGIN
  CREATE TYPE public.application_stage AS ENUM (
    'applied','screened','interview_scheduled','interviewed','offer_sent','hired','rejected','withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.job_posting_status AS ENUM ('draft','published','closed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.employment_kind AS ENUM ('full_time','part_time','contract','internship','temporary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.job_postings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  department TEXT,
  location TEXT,
  remote_policy TEXT,
  employment_type public.employment_kind NOT NULL DEFAULT 'full_time',
  description TEXT,
  responsibilities TEXT,
  requirements TEXT,
  required_skills TEXT[] DEFAULT '{}',
  nice_to_have_skills TEXT[] DEFAULT '{}',
  salary_min_cents INTEGER,
  salary_max_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'SEK',
  status public.job_posting_status NOT NULL DEFAULT 'draft',
  hero_image_url TEXT,
  perks TEXT[] DEFAULT '{}',
  hiring_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  external_apply_url TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_postings_status ON public.job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_postings_slug ON public.job_postings(slug);

ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published jobs" ON public.job_postings;
CREATE POLICY "Public can view published jobs" ON public.job_postings FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "Admins manage job postings" ON public.job_postings;
CREATE POLICY "Admins manage job postings" ON public.job_postings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_posting_id UUID NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  linkedin_url TEXT,
  resume_url TEXT,
  cover_letter TEXT,
  parsed_resume JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_skills TEXT[] DEFAULT '{}',
  matching_skills TEXT[] DEFAULT '{}',
  missing_skills TEXT[] DEFAULT '{}',
  ai_score NUMERIC(5,2),
  ai_reasoning TEXT,
  ai_summary TEXT,
  source TEXT NOT NULL DEFAULT 'career_site',
  stage public.application_stage NOT NULL DEFAULT 'applied',
  rejected_reason TEXT,
  assigned_recruiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_job ON public.applications(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_applications_stage ON public.applications(stage);
CREATE INDEX IF NOT EXISTS idx_applications_score ON public.applications(ai_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_applications_email ON public.applications(candidate_email);

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can submit applications" ON public.applications;
CREATE POLICY "Public can submit applications" ON public.applications FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.job_postings jp WHERE jp.id = job_posting_id AND jp.status = 'published')
  );

DROP POLICY IF EXISTS "Admins manage applications" ON public.applications;
CREATE POLICY "Admins manage applications" ON public.applications FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.application_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  from_stage public.application_stage,
  to_stage public.application_stage NOT NULL,
  changed_by UUID,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_stages_app ON public.application_stages(application_id, created_at DESC);

ALTER TABLE public.application_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read stage history" ON public.application_stages;
CREATE POLICY "Admins read stage history" ON public.application_stages FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins write stage history" ON public.application_stages;
CREATE POLICY "Admins write stage history" ON public.application_stages FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.candidate_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  author_id UUID,
  body TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_notes_app ON public.candidate_notes(application_id, created_at DESC);

ALTER TABLE public.candidate_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage candidate notes" ON public.candidate_notes;
CREATE POLICY "Admins manage candidate notes" ON public.candidate_notes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_job_postings_updated_at ON public.job_postings;
CREATE TRIGGER trg_job_postings_updated_at
  BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_applications_updated_at ON public.applications;
CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.log_application_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.application_stages (application_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, NULL, NEW.stage, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.application_stages (application_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, OLD.stage, NEW.stage, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_stage_log ON public.applications;
CREATE TRIGGER trg_applications_stage_log
  AFTER INSERT OR UPDATE OF stage ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.log_application_stage_change();