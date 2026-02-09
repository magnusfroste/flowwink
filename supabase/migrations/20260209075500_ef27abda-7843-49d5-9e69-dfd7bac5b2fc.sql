-- ============================================
-- Add soft delete columns to pages table
-- ============================================
ALTER TABLE public.pages 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- Index for efficient trash queries
CREATE INDEX IF NOT EXISTS idx_pages_deleted_at ON public.pages(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================
-- Create webinars table
-- ============================================
CREATE TABLE IF NOT EXISTS public.webinars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  agenda TEXT,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  max_attendees INTEGER,
  platform TEXT NOT NULL DEFAULT 'google_meet' CHECK (platform IN ('google_meet', 'zoom', 'teams', 'custom')),
  meeting_url TEXT,
  recording_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'live', 'completed', 'cancelled')),
  cover_image TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- Create webinar_registrations table
-- ============================================
CREATE TABLE IF NOT EXISTS public.webinar_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  lead_id UUID REFERENCES public.leads(id),
  registered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  attended BOOLEAN NOT NULL DEFAULT false,
  follow_up_sent BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(webinar_id, email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webinars_date ON public.webinars(date);
CREATE INDEX IF NOT EXISTS idx_webinars_status ON public.webinars(status);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_webinar ON public.webinar_registrations(webinar_id);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_email ON public.webinar_registrations(email);

-- ============================================
-- Enable RLS
-- ============================================
ALTER TABLE public.webinars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_registrations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Webinars policies
-- ============================================
-- Anyone can view published webinars
CREATE POLICY "Public can view published webinars"
ON public.webinars FOR SELECT
USING (status IN ('published', 'live', 'completed'));

-- Authenticated users with roles can manage webinars
CREATE POLICY "Staff can manage webinars"
ON public.webinars FOR ALL
USING (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'approver') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'approver') OR public.has_role(auth.uid(), 'admin'));

-- ============================================
-- Webinar registrations policies
-- ============================================
-- Staff can view all registrations
CREATE POLICY "Staff can view registrations"
ON public.webinar_registrations FOR SELECT
USING (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'approver') OR public.has_role(auth.uid(), 'admin'));

-- Anyone can register (insert)
CREATE POLICY "Anyone can register for webinars"
ON public.webinar_registrations FOR INSERT
WITH CHECK (true);

-- Staff can update registrations
CREATE POLICY "Staff can update registrations"
ON public.webinar_registrations FOR UPDATE
USING (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'approver') OR public.has_role(auth.uid(), 'admin'));

-- Staff can delete registrations
CREATE POLICY "Staff can delete registrations"
ON public.webinar_registrations FOR DELETE
USING (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'approver') OR public.has_role(auth.uid(), 'admin'));

-- ============================================
-- Trigger for updated_at
-- ============================================
CREATE TRIGGER update_webinars_updated_at
  BEFORE UPDATE ON public.webinars
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();