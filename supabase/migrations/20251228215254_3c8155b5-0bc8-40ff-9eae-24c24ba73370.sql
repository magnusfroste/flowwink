-- Create knowledge base categories table
CREATE TABLE public.kb_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT DEFAULT 'HelpCircle',
  sort_order INTEGER DEFAULT 0,
  parent_id UUID REFERENCES public.kb_categories(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create knowledge base articles table
CREATE TABLE public.kb_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.kb_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  question TEXT NOT NULL,
  answer_json JSONB DEFAULT '[]'::jsonb,
  answer_text TEXT, -- Plain text version for AI context
  sort_order INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  include_in_chat BOOLEAN DEFAULT true, -- Whether to include in AI chat context
  views_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  meta_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(category_id, slug)
);

-- Enable RLS on both tables
ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for kb_categories
CREATE POLICY "Public can view active categories"
  ON public.kb_categories FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated can view all categories"
  ON public.kb_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage categories"
  ON public.kb_categories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for kb_articles
CREATE POLICY "Public can view published articles"
  ON public.kb_articles FOR SELECT
  USING (is_published = true);

CREATE POLICY "Authenticated can view all articles"
  ON public.kb_articles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Writers can create articles"
  ON public.kb_articles FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'writer'::app_role) OR has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Writers can update own articles, admins all"
  ON public.kb_articles FOR UPDATE
  USING ((created_by = auth.uid()) OR has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete articles"
  ON public.kb_articles FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_kb_categories_parent ON public.kb_categories(parent_id);
CREATE INDEX idx_kb_categories_active ON public.kb_categories(is_active);
CREATE INDEX idx_kb_articles_category ON public.kb_articles(category_id);
CREATE INDEX idx_kb_articles_published ON public.kb_articles(is_published);
CREATE INDEX idx_kb_articles_chat ON public.kb_articles(include_in_chat) WHERE include_in_chat = true;

-- Add trigger for updated_at
CREATE TRIGGER update_kb_categories_updated_at
  BEFORE UPDATE ON public.kb_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_kb_articles_updated_at
  BEFORE UPDATE ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();