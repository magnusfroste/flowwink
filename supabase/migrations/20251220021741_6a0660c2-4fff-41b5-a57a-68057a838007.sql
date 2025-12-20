-- Create table for tracking link clicks
CREATE TABLE public.newsletter_link_clicks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_id UUID NOT NULL REFERENCES public.newsletters(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  link_id UUID NOT NULL DEFAULT gen_random_uuid(),
  original_url TEXT NOT NULL,
  clicked_at TIMESTAMP WITH TIME ZONE,
  click_count INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add click tracking columns to newsletters
ALTER TABLE public.newsletters
ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS unique_clicks INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE public.newsletter_link_clicks ENABLE ROW LEVEL SECURITY;

-- Admins can view all clicks
CREATE POLICY "Admins can view link clicks"
ON public.newsletter_link_clicks
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert clicks (from edge function)
CREATE POLICY "System can insert clicks"
ON public.newsletter_link_clicks
FOR INSERT
WITH CHECK (true);

-- System can update clicks
CREATE POLICY "System can update clicks"
ON public.newsletter_link_clicks
FOR UPDATE
USING (true);

-- Create indexes for faster lookups
CREATE INDEX idx_newsletter_clicks_link ON public.newsletter_link_clicks(link_id);
CREATE INDEX idx_newsletter_clicks_newsletter ON public.newsletter_link_clicks(newsletter_id);