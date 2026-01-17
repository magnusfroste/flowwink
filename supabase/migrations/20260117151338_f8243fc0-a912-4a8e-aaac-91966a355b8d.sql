-- Create table for saved content research
CREATE TABLE public.content_research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic TEXT NOT NULL,
  target_audience TEXT,
  industry TEXT,
  target_channels TEXT[] DEFAULT '{}',
  research_data JSONB NOT NULL,
  ai_provider TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_research ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Users can view all research" 
ON public.content_research 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Users can create research" 
ON public.content_research 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their research" 
ON public.content_research 
FOR UPDATE 
TO authenticated
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their research" 
ON public.content_research 
FOR DELETE 
TO authenticated
USING (auth.uid() = created_by);

-- Add index for faster queries
CREATE INDEX idx_content_research_created_at ON public.content_research(created_at DESC);
CREATE INDEX idx_content_research_topic ON public.content_research USING gin(to_tsvector('english', topic));