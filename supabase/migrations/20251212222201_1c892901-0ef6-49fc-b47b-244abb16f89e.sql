-- Create site_settings table for editable footer content
CREATE TABLE public.site_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings (for public footer)
CREATE POLICY "Anyone can view site settings"
ON public.site_settings
FOR SELECT
USING (true);

-- Only admins can update settings
CREATE POLICY "Admins can update site settings"
ON public.site_settings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert settings
CREATE POLICY "Admins can insert site settings"
ON public.site_settings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default footer settings
INSERT INTO public.site_settings (key, value) VALUES (
  'footer',
  '{
    "phone": "08-688 40 00",
    "email": "info@sophiahemmet.se",
    "address": "Valhallavägen 91",
    "postalCode": "114 28 Stockholm",
    "weekdayHours": "08:00–17:00",
    "weekendHours": "Stängt",
    "brandName": "Sophiahemmet",
    "brandTagline": "Kvalitetsvård med patienten i fokus sedan 1884."
  }'::jsonb
);