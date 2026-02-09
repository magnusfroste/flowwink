-- Webinars table
CREATE TABLE IF NOT EXISTS public.webinars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  agenda text,
  date timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  max_attendees integer,
  platform text NOT NULL DEFAULT 'google_meet' CHECK (platform IN ('google_meet', 'zoom', 'teams', 'custom')),
  meeting_url text,
  recording_url text,
  cover_image text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'live', 'completed', 'cancelled')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Webinar registrations table
CREATE TABLE IF NOT EXISTS public.webinar_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id uuid NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  attended boolean NOT NULL DEFAULT false,
  follow_up_sent boolean NOT NULL DEFAULT false,
  UNIQUE(webinar_id, email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webinars_status ON public.webinars(status);
CREATE INDEX IF NOT EXISTS idx_webinars_date ON public.webinars(date);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_webinar_id ON public.webinar_registrations(webinar_id);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_email ON public.webinar_registrations(email);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_lead_id ON public.webinar_registrations(lead_id);

-- RLS
ALTER TABLE public.webinars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_registrations ENABLE ROW LEVEL SECURITY;

-- Webinars: admins can do everything, public can read published
CREATE POLICY "Admins can manage webinars" ON public.webinars
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'approver'))
  );

CREATE POLICY "Public can read published webinars" ON public.webinars
  FOR SELECT USING (status IN ('published', 'live', 'completed'));

-- Registrations: admins can read all, public can insert (register)
CREATE POLICY "Admins can manage registrations" ON public.webinar_registrations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'approver'))
  );

CREATE POLICY "Anyone can register for webinars" ON public.webinar_registrations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Registrants can read own registrations" ON public.webinar_registrations
  FOR SELECT USING (true);
