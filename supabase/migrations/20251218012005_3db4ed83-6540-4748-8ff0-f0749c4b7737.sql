-- Extend profiles table for author functionality
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_as_author boolean DEFAULT false;

-- Blog Categories (hierarchical)
CREATE TABLE public.blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  parent_id uuid REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Blog Tags (flat)
CREATE TABLE public.blog_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Blog Posts
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  content_json jsonb DEFAULT '[]'::jsonb,
  featured_image text,
  featured_image_alt text,
  
  -- Author
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Optional Reviewer (generic)
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  
  -- Publishing
  status page_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  scheduled_at timestamptz,
  
  -- SEO
  meta_json jsonb DEFAULT '{}'::jsonb,
  
  -- Blog-specific
  is_featured boolean DEFAULT false,
  reading_time_minutes int,
  
  -- Tracking
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Blog Post Categories junction
CREATE TABLE public.blog_post_categories (
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.blog_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

-- Blog Post Tags junction
CREATE TABLE public.blog_post_tags (
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Enable RLS on all blog tables
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_tags ENABLE ROW LEVEL SECURITY;

-- Blog Categories RLS
CREATE POLICY "Public can view categories" ON public.blog_categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON public.blog_categories FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Blog Tags RLS
CREATE POLICY "Public can view tags" ON public.blog_tags FOR SELECT USING (true);
CREATE POLICY "Admins can manage tags" ON public.blog_tags FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Blog Posts RLS
CREATE POLICY "Public can view published posts" ON public.blog_posts FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "Authenticated can view all posts" ON public.blog_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers can create posts" ON public.blog_posts FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'writer') OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Writers can update own drafts" ON public.blog_posts FOR UPDATE TO authenticated 
  USING ((created_by = auth.uid() AND status = 'draft') OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete posts" ON public.blog_posts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Blog Post Categories RLS
CREATE POLICY "Public can view post categories" ON public.blog_post_categories FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage post categories" ON public.blog_post_categories FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.blog_posts p WHERE p.id = post_id AND (p.created_by = auth.uid() OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'))));

-- Blog Post Tags RLS
CREATE POLICY "Public can view post tags" ON public.blog_post_tags FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage post tags" ON public.blog_post_tags FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.blog_posts p WHERE p.id = post_id AND (p.created_by = auth.uid() OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'))));

-- Update trigger for blog_posts
CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Indexes for performance
CREATE INDEX idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX idx_blog_posts_slug ON public.blog_posts(slug);
CREATE INDEX idx_blog_posts_published_at ON public.blog_posts(published_at DESC);
CREATE INDEX idx_blog_posts_author ON public.blog_posts(author_id);
CREATE INDEX idx_blog_categories_slug ON public.blog_categories(slug);
CREATE INDEX idx_blog_tags_slug ON public.blog_tags(slug);