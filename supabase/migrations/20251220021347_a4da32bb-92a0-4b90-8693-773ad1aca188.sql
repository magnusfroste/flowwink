-- Create table for tracking email opens
CREATE TABLE public.newsletter_email_opens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_id UUID NOT NULL REFERENCES public.newsletters(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  tracking_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  opened_at TIMESTAMP WITH TIME ZONE,
  user_agent TEXT,
  ip_address TEXT,
  opens_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add open tracking columns to newsletters
ALTER TABLE public.newsletters
ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS unique_opens INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE public.newsletter_email_opens ENABLE ROW LEVEL SECURITY;

-- Admins can view all opens
CREATE POLICY "Admins can view email opens"
ON public.newsletter_email_opens
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert opens (from edge function)
CREATE POLICY "System can insert opens"
ON public.newsletter_email_opens
FOR INSERT
WITH CHECK (true);

-- System can update opens
CREATE POLICY "System can update opens"
ON public.newsletter_email_opens
FOR UPDATE
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_newsletter_opens_tracking ON public.newsletter_email_opens(tracking_id);
CREATE INDEX idx_newsletter_opens_newsletter ON public.newsletter_email_opens(newsletter_id);