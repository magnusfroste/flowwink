import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Core schema SQL - minimal tables needed to bootstrap the CMS
const CORE_SCHEMA = `
-- =============================================================================
-- FLOWWINK CORE SCHEMA - Auto-setup version
-- =============================================================================

-- Create enums if not exists
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('writer', 'approver', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.page_status AS ENUM ('draft', 'reviewing', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- User roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'writer',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
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
CREATE TABLE IF NOT EXISTS public.pages (
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

-- Site settings table
CREATE TABLE IF NOT EXISTS public.site_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Helper functions
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'writer');
  
  RETURN NEW;
END;
$$;

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

-- Triggers (drop first to avoid duplicates)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_pages_updated_at ON public.pages;
CREATE TRIGGER update_pages_updated_at
  BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS Policies for profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- RLS Policies for user_roles
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for pages
DROP POLICY IF EXISTS "All authenticated users can view pages" ON public.pages;
CREATE POLICY "All authenticated users can view pages"
  ON public.pages FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Public can view published pages" ON public.pages;
CREATE POLICY "Public can view published pages"
  ON public.pages FOR SELECT
  TO anon
  USING (status = 'published');

DROP POLICY IF EXISTS "Writers can create pages" ON public.pages;
CREATE POLICY "Writers can create pages"
  ON public.pages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'writer') OR 
    public.has_role(auth.uid(), 'approver') OR 
    public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Writers can update own draft pages" ON public.pages;
CREATE POLICY "Writers can update own draft pages"
  ON public.pages FOR UPDATE
  TO authenticated
  USING (
    (created_by = auth.uid() AND status = 'draft') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete pages" ON public.pages;
CREATE POLICY "Admins can delete pages"
  ON public.pages FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for site_settings
DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;
CREATE POLICY "Anyone can view site settings"
  ON public.site_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can update site settings" ON public.site_settings;
CREATE POLICY "Admins can update site settings"
  ON public.site_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert site settings" ON public.site_settings;
CREATE POLICY "Admins can insert site settings"
  ON public.site_settings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Storage bucket for images
INSERT INTO storage.buckets (id, name, public)
VALUES ('cms-images', 'cms-images', true)
ON CONFLICT (id) DO NOTHING;
`;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      service_role_key, 
      supabase_url,
      create_admin,
      admin_email,
      admin_password,
      admin_name
    } = await req.json();

    if (!service_role_key) {
      console.error('[setup-database] Missing service_role_key');
      return new Response(
        JSON.stringify({ error: 'Service role key is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use provided URL or fall back to environment
    const url = supabase_url || Deno.env.get('SUPABASE_URL');
    if (!url) {
      console.error('[setup-database] No Supabase URL available');
      return new Response(
        JSON.stringify({ error: 'Supabase URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[setup-database] Creating admin client...');
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(url, service_role_key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // If this is a request to create admin user
    if (create_admin) {
      console.log('[setup-database] Creating first admin user...');
      
      if (!admin_email || !admin_password) {
        return new Response(
          JSON.stringify({ error: 'Email and password are required for admin creation' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if any admin users exist
      const { data: existingAdmins, error: checkAdminError } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('role', 'admin')
        .limit(1);

      if (checkAdminError) {
        console.error('[setup-database] Error checking for existing admins:', checkAdminError);
      }

      if (existingAdmins && existingAdmins.length > 0) {
        return new Response(
          JSON.stringify({ 
            error: 'An admin user already exists. Use the normal signup flow.',
            success: false 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create the admin user
      const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email: admin_email,
        password: admin_password,
        email_confirm: true,
        user_metadata: { full_name: admin_name || admin_email }
      });

      if (createUserError) {
        console.error('[setup-database] Error creating user:', createUserError);
        return new Response(
          JSON.stringify({ 
            error: createUserError.message || 'Failed to create admin user',
            success: false 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[setup-database] User created, updating role to admin...');

      // The trigger will have created a 'writer' role, update it to 'admin'
      const { error: updateRoleError } = await supabaseAdmin
        .from('user_roles')
        .update({ role: 'admin' })
        .eq('user_id', newUser.user.id);

      if (updateRoleError) {
        console.error('[setup-database] Error updating role:', updateRoleError);
        // User was created but role update failed - still a partial success
        return new Response(
          JSON.stringify({ 
            success: true,
            warning: 'User created but role update failed. Please update role manually.',
            user_id: newUser.user.id
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[setup-database] First admin user created successfully!');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Admin user created successfully',
          user_id: newUser.user.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First, check if database is already set up
    console.log('[setup-database] Checking existing setup...');
    const { data: existingTables, error: checkError } = await supabaseAdmin
      .from('pages')
      .select('id')
      .limit(1);

    if (!checkError) {
      console.log('[setup-database] Database already configured');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Database is already configured',
          already_setup: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Run the schema SQL using rpc if available, or raw query
    console.log('[setup-database] Running schema migrations...');
    
    // Split into individual statements and run them
    const statements = CORE_SCHEMA
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const statement of statements) {
      try {
        // Use raw SQL via the REST API
        const response = await fetch(`${url}/rest/v1/rpc/`, {
          method: 'POST',
          headers: {
            'apikey': service_role_key,
            'Authorization': `Bearer ${service_role_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: statement + ';'
          }),
        });

        if (response.ok) {
          successCount++;
        }
      } catch (e) {
        // Many statements will "fail" because tables already exist, etc.
        // This is expected and okay
        errorCount++;
        if (e instanceof Error) {
          errors.push(e.message);
        }
      }
    }

    // Verify setup worked by checking for pages table again
    console.log('[setup-database] Verifying setup...');
    const { error: verifyError } = await supabaseAdmin
      .from('site_settings')
      .select('id')
      .limit(1);

    if (verifyError) {
      console.error('[setup-database] Setup verification failed:', verifyError);
      
      // Return instructions for manual setup
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Auto-setup failed. Please run the schema manually.',
          manual_required: true,
          instructions: [
            '1. Go to your Supabase project dashboard',
            '2. Navigate to SQL Editor',
            '3. Run the schema.sql file from the repository',
            '4. Refresh this page'
          ]
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[setup-database] Setup complete!');
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Database setup complete!',
        stats: { successCount, errorCount }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[setup-database] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        manual_required: true,
        instructions: [
          '1. Go to your Supabase project dashboard',
          '2. Navigate to SQL Editor', 
          '3. Run the schema.sql file from the repository',
          '4. Refresh this page'
        ]
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
