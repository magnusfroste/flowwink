-- Create form_submissions table to store form data
CREATE TABLE public.form_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL,
  block_id TEXT NOT NULL,
  form_name TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- Admins can view all submissions
CREATE POLICY "Admins can view form submissions"
ON public.form_submissions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete submissions
CREATE POLICY "Admins can delete form submissions"
ON public.form_submissions
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can submit forms (public forms)
CREATE POLICY "Anyone can submit forms"
ON public.form_submissions
FOR INSERT
WITH CHECK (true);

-- Add index for faster queries
CREATE INDEX idx_form_submissions_page_id ON public.form_submissions(page_id);
CREATE INDEX idx_form_submissions_block_id ON public.form_submissions(block_id);
CREATE INDEX idx_form_submissions_created_at ON public.form_submissions(created_at DESC);