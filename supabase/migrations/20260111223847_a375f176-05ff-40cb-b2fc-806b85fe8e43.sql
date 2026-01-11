-- Create chat feedback table
CREATE TABLE public.chat_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
  user_question TEXT,
  ai_response TEXT,
  context_pages TEXT[],
  context_kb_articles TEXT[],
  session_id TEXT,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert feedback (public chat)
CREATE POLICY "Anyone can submit feedback" 
ON public.chat_feedback 
FOR INSERT 
WITH CHECK (true);

-- Only admins can view feedback
CREATE POLICY "Admins can view feedback" 
ON public.chat_feedback 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Add feedback flags to kb_articles
ALTER TABLE public.kb_articles 
ADD COLUMN IF NOT EXISTS negative_feedback_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS positive_feedback_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS needs_improvement BOOLEAN DEFAULT false;

-- Create index for performance
CREATE INDEX idx_chat_feedback_rating ON public.chat_feedback(rating);
CREATE INDEX idx_chat_feedback_created_at ON public.chat_feedback(created_at DESC);
CREATE INDEX idx_kb_articles_needs_improvement ON public.kb_articles(needs_improvement) WHERE needs_improvement = true;