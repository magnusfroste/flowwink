-- Create content_proposals table for AI-generated multi-channel content campaigns
CREATE TABLE public.content_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'published', 'archived')),
  topic TEXT NOT NULL,
  source_research JSONB DEFAULT '{}',
  pillar_content TEXT,
  channel_variants JSONB DEFAULT '{}',
  scheduled_for TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  published_channels TEXT[] DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE public.content_proposals ENABLE ROW LEVEL SECURITY;

-- RLS policies for content_proposals
CREATE POLICY "Authenticated users can view content proposals"
  ON public.content_proposals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create content proposals"
  ON public.content_proposals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update content proposals"
  ON public.content_proposals FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete content proposals"
  ON public.content_proposals FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by OR EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  ));

-- Create indexes for common queries
CREATE INDEX idx_content_proposals_status ON public.content_proposals(status);
CREATE INDEX idx_content_proposals_scheduled_for ON public.content_proposals(scheduled_for);
CREATE INDEX idx_content_proposals_created_by ON public.content_proposals(created_by);
CREATE INDEX idx_content_proposals_created_at ON public.content_proposals(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_content_proposals_updated_at
  BEFORE UPDATE ON public.content_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.content_proposals IS 'AI-generated multi-channel content campaign proposals';