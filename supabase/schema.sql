-- =============================================================================
-- PEZCMS DATABASE SCHEMA
-- =============================================================================
-- This file contains the complete database schema for self-hosting Pezcms.
-- Run this in your Supabase SQL Editor to set up a new instance.
--
-- Generated from migrations in /supabase/migrations/
-- Last updated: December 2024
-- =============================================================================

-- =============================================================================
-- PART 1: ENUMS AND TYPES
-- =============================================================================

-- Create role enum
CREATE TYPE public.app_role AS ENUM ('writer', 'approver', 'admin');

-- Create page status enum
CREATE TYPE public.page_status AS ENUM ('draft', 'reviewing', 'published', 'archived');

-- =============================================================================
-- PART 2: CORE TABLES
-- =============================================================================

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'writer',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  title TEXT,
  show_as_author BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Pages table
CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status page_status NOT NULL DEFAULT 'draft',
  content_json JSONB DEFAULT '[]'::jsonb,
  meta_json JSONB DEFAULT '{}'::jsonb,
  menu_order INTEGER NOT NULL DEFAULT 0,
  show_in_menu BOOLEAN NOT NULL DEFAULT true,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Page versions table for version history
CREATE TABLE public.page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content_json JSONB NOT NULL,
  meta_json JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Audit logs table for GDPR compliance
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Site settings table
CREATE TABLE public.site_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Global blocks table for reusable elements (footer, header, etc.)
CREATE TABLE public.global_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slot TEXT NOT NULL,
  type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(slot)
);

-- =============================================================================
-- PART 3: CHAT TABLES
-- =============================================================================

-- Chat conversations table
CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  title TEXT DEFAULT 'Ny konversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat messages table
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- PART 4: BLOG TABLES
-- =============================================================================

-- Blog categories (hierarchical)
CREATE TABLE public.blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Blog tags (flat)
CREATE TABLE public.blog_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Blog posts
CREATE TABLE public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  content_json JSONB DEFAULT '[]'::jsonb,
  featured_image TEXT,
  featured_image_alt TEXT,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  status page_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  meta_json JSONB DEFAULT '{}'::jsonb,
  is_featured BOOLEAN DEFAULT false,
  reading_time_minutes INT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Blog post categories junction
CREATE TABLE public.blog_post_categories (
  post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.blog_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

-- Blog post tags junction
CREATE TABLE public.blog_post_tags (
  post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- =============================================================================
-- PART 5: FORM SUBMISSIONS
-- =============================================================================

CREATE TABLE public.form_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL,
  block_id TEXT NOT NULL,
  form_name TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================================================
-- PART 6: ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PART 7: HELPER FUNCTIONS
-- =============================================================================

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's highest role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles 
  WHERE user_id = _user_id 
  ORDER BY 
    CASE role 
      WHEN 'admin' THEN 1 
      WHEN 'approver' THEN 2 
      WHEN 'writer' THEN 3 
    END
  LIMIT 1
$$;

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  
  -- Assign default writer role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'writer');
  
  RETURN NEW;
END;
$$;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- PART 8: TRIGGERS
-- =============================================================================

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_pages_updated_at
  BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_global_blocks_updated_at
  BEFORE UPDATE ON public.global_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- PART 9: RLS POLICIES - PROFILES
-- =============================================================================

CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- =============================================================================
-- PART 10: RLS POLICIES - USER ROLES
-- =============================================================================

CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- PART 11: RLS POLICIES - PAGES
-- =============================================================================

CREATE POLICY "All authenticated users can view pages"
  ON public.pages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public can view published pages"
  ON public.pages FOR SELECT
  TO anon
  USING (status = 'published');

CREATE POLICY "Writers can create pages"
  ON public.pages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'writer') OR 
    public.has_role(auth.uid(), 'approver') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Writers can update own draft pages"
  ON public.pages FOR UPDATE
  TO authenticated
  USING (
    (created_by = auth.uid() AND status = 'draft') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete pages"
  ON public.pages FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- PART 12: RLS POLICIES - PAGE VERSIONS
-- =============================================================================

CREATE POLICY "All authenticated can view versions"
  ON public.page_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can create versions"
  ON public.page_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'approver') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- =============================================================================
-- PART 13: RLS POLICIES - AUDIT LOGS
-- =============================================================================

CREATE POLICY "Users can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can create audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =============================================================================
-- PART 14: RLS POLICIES - SITE SETTINGS
-- =============================================================================

CREATE POLICY "Anyone can view site settings"
  ON public.site_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can update site settings"
  ON public.site_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert site settings"
  ON public.site_settings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =============================================================================
-- PART 15: RLS POLICIES - GLOBAL BLOCKS
-- =============================================================================

CREATE POLICY "Public can view active global blocks"
  ON public.global_blocks FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated can view all global blocks"
  ON public.global_blocks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert global blocks"
  ON public.global_blocks FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update global blocks"
  ON public.global_blocks FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete global blocks"
  ON public.global_blocks FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================================================
-- PART 16: RLS POLICIES - CHAT
-- =============================================================================

CREATE POLICY "Users can view own conversations"
  ON public.chat_conversations FOR SELECT
  USING (user_id = auth.uid() OR session_id IS NOT NULL);

CREATE POLICY "Users can create conversations"
  ON public.chat_conversations FOR INSERT
  WITH CHECK (user_id = auth.uid() OR session_id IS NOT NULL);

CREATE POLICY "Users can update own conversations"
  ON public.chat_conversations FOR UPDATE
  USING (user_id = auth.uid() OR session_id IS NOT NULL);

CREATE POLICY "Users can delete own conversations"
  ON public.chat_conversations FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view messages in own conversations"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id
      AND (c.user_id = auth.uid() OR c.session_id IS NOT NULL)
    )
  );

CREATE POLICY "Users can create messages in own conversations"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id
      AND (c.user_id = auth.uid() OR c.session_id IS NOT NULL)
    )
  );

-- =============================================================================
-- PART 17: RLS POLICIES - BLOG
-- =============================================================================

-- Blog Categories
CREATE POLICY "Public can view categories" ON public.blog_categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON public.blog_categories FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Blog Tags
CREATE POLICY "Public can view tags" ON public.blog_tags FOR SELECT USING (true);
CREATE POLICY "Admins can manage tags" ON public.blog_tags FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Blog Posts
CREATE POLICY "Public can view published posts" ON public.blog_posts FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "Authenticated can view all posts" ON public.blog_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers can create posts" ON public.blog_posts FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'writer') OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Writers can update own drafts" ON public.blog_posts FOR UPDATE TO authenticated 
  USING ((created_by = auth.uid() AND status = 'draft') OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete posts" ON public.blog_posts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Blog Post Categories
CREATE POLICY "Public can view post categories" ON public.blog_post_categories FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage post categories" ON public.blog_post_categories FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.blog_posts p WHERE p.id = post_id AND (p.created_by = auth.uid() OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'))));

-- Blog Post Tags
CREATE POLICY "Public can view post tags" ON public.blog_post_tags FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage post tags" ON public.blog_post_tags FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.blog_posts p WHERE p.id = post_id AND (p.created_by = auth.uid() OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'admin'))));

-- =============================================================================
-- PART 18: RLS POLICIES - FORM SUBMISSIONS
-- =============================================================================

CREATE POLICY "Admins can view form submissions"
  ON public.form_submissions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete form submissions"
  ON public.form_submissions FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can submit forms"
  ON public.form_submissions FOR INSERT
  WITH CHECK (true);

-- =============================================================================
-- PART 19: INDEXES
-- =============================================================================

-- Pages
CREATE INDEX idx_pages_scheduled_at ON public.pages (scheduled_at) 
  WHERE scheduled_at IS NOT NULL AND status = 'reviewing';

-- Chat
CREATE INDEX idx_chat_conversations_user_id ON public.chat_conversations(user_id);
CREATE INDEX idx_chat_conversations_session_id ON public.chat_conversations(session_id);
CREATE INDEX idx_chat_messages_conversation_id ON public.chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Blog
CREATE INDEX idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX idx_blog_posts_slug ON public.blog_posts(slug);
CREATE INDEX idx_blog_posts_published_at ON public.blog_posts(published_at DESC);
CREATE INDEX idx_blog_posts_author ON public.blog_posts(author_id);
CREATE INDEX idx_blog_categories_slug ON public.blog_categories(slug);
CREATE INDEX idx_blog_tags_slug ON public.blog_tags(slug);

-- Form submissions
CREATE INDEX idx_form_submissions_page_id ON public.form_submissions(page_id);
CREATE INDEX idx_form_submissions_block_id ON public.form_submissions(block_id);
CREATE INDEX idx_form_submissions_created_at ON public.form_submissions(created_at DESC);

-- =============================================================================
-- PART 20: STORAGE BUCKET
-- =============================================================================

-- Create storage bucket for CMS images
INSERT INTO storage.buckets (id, name, public)
VALUES ('cms-images', 'cms-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cms-images');

CREATE POLICY "Authenticated users can update images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cms-images');

CREATE POLICY "Authenticated users can delete images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cms-images');

CREATE POLICY "Anyone can view cms images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'cms-images');

-- =============================================================================
-- PART 21: DEFAULT DATA
-- =============================================================================

-- Insert default footer settings
INSERT INTO public.site_settings (key, value) VALUES (
  'footer',
  '{
    "phone": "",
    "email": "",
    "address": "",
    "postalCode": "",
    "weekdayHours": "",
    "weekendHours": "",
    "brandName": "Your Organization",
    "brandTagline": "Your tagline here"
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Insert SEO settings
INSERT INTO public.site_settings (key, value) VALUES (
  'seo',
  '{
    "siteTitle": "Pezcms",
    "titleTemplate": "%s | Pezcms",
    "defaultDescription": "A modern CMS built with React and Supabase",
    "ogImage": "",
    "twitterHandle": "",
    "googleSiteVerification": "",
    "robotsIndex": true,
    "robotsFollow": true
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Insert performance settings
INSERT INTO public.site_settings (key, value) VALUES (
  'performance',
  '{
    "lazyLoadImages": true,
    "prefetchLinks": true,
    "minifyHtml": false,
    "enableServiceWorker": false,
    "imageCacheMaxAge": 31536000,
    "cacheStaticAssets": true
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Insert default footer global block
INSERT INTO public.global_blocks (slot, type, data, is_active) VALUES (
  'footer',
  'footer',
  '{}'::jsonb,
  true
) ON CONFLICT (slot) DO NOTHING;

-- =============================================================================
-- PART 22: REALTIME
-- =============================================================================

-- Enable realtime for pages (for live notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE public.pages;

-- =============================================================================
-- PART 23: EXTENSIONS (Optional - for scheduled publishing)
-- =============================================================================

-- Uncomment these if you want scheduled publishing via pg_cron
-- Note: pg_cron may not be available on all Supabase plans
-- CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
-- CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- =============================================================================
-- SETUP COMPLETE!
-- =============================================================================
-- 
-- Next steps:
-- 1. Create your first user by signing up in the app
-- 2. Promote that user to admin:
--    UPDATE public.user_roles SET role = 'admin' 
--    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your@email.com');
-- 3. Deploy Edge Functions (see SETUP.md)
-- 4. Configure environment variables
--
-- =============================================================================
