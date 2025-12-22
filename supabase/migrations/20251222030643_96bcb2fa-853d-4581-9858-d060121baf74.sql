-- Add new activity types for calls, emails, meetings to lead_activities
-- The existing table already supports this via the 'type' text column and metadata jsonb

-- Create deal_activities table for tracking deal-specific activities
CREATE TABLE public.deal_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_deal_activities_deal_id ON public.deal_activities(deal_id);
CREATE INDEX idx_deal_activities_created_at ON public.deal_activities(created_at DESC);

-- Enable RLS
ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated can view deal activities"
  ON public.deal_activities FOR SELECT
  USING (has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can create deal activities"
  ON public.deal_activities FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can update deal activities"
  ON public.deal_activities FOR UPDATE
  USING (has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete deal activities"
  ON public.deal_activities FOR DELETE
  USING (has_role(auth.uid(), 'admin'));